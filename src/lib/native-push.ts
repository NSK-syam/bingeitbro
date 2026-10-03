/**
 * Native (Capacitor iOS/Android) push token lifecycle.
 *
 * Pure logic with injected dependencies (plugin, fetch, persistent storage) so
 * it can be tested in Node (scripts/mobile/test-native-push-lifecycle.mjs). The
 * Capacitor wiring (Preferences, listeners, sign-out registry) lives in
 * src/components/native/NativePush.tsx.
 *
 * Invariants
 * 1. One serialized work queue: every register, refresh, unlink, server DELETE
 *    and FCM rotation runs on it, so work for account A finishes before work for
 *    account B starts. Each auth change bumps `generation`; tasks re-check the
 *    account and generation before and after every await and stop when stale.
 *    After dispose() nothing writes state or starts requests.
 * 2. Record before send. The registration record { userId, tokens } is
 *    persisted (Preferences) BEFORE a POST is sent, so a registration that may
 *    have reached the server is never forgotten, even across a reload or crash.
 * 3. Retire before unlink. When an account's session ends (sign-out awaited via
 *    the native logout registry, an auth change, or startup finding a record for
 *    a different or no user), its tokens become persisted "retired markers"
 *    { id, token, userId } BEFORE any unlink request. A marker is cleared (by
 *    id, so a stale task can't clear a newer one) only after BOTH the server
 *    DELETE succeeded AND the device token was rotated to a different token. A
 *    sign-out timeout therefore never counts as cleanup; the next startup
 *    resumes it.
 * 4. Fail closed. A new account is registered only when no markers remain and
 *    the device token isn't one that was ever retired. If deleteToken() fails or
 *    getToken() still returns the retired token, nothing is registered; we retry
 *    on the next auth event or app resume.
 *
 * Residual: a POST for A that the client gave up on (timeout) can still commit
 * on the server after A's cleanup DELETE. By then that token has been rotated
 * (invariant 3), so the row points at a dead FCM token: nothing is delivered and
 * the sender prunes it on UNREGISTERED. B never uses that token (invariant 4).
 *
 * If Firebase isn't configured in the native build (GoogleService-Info.plist /
 * google-services.json missing), getToken rejects as "unavailable" and push is
 * skipped quietly: no permission prompt, no error UI.
 */

export const ANDROID_PUSH_CHANNEL_ID = 'bib_default';
export const REGISTER_ENDPOINT = '/api/native-push/register';
export const PUSH_REGISTRATION_KEY = 'bib_push_registration';
export const PUSH_RETIRED_KEY = 'bib_push_retired';
export const PUSH_RETIRED_TOKENS_KEY = 'bib_push_retired_tokens';
const REREGISTER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const GET_TOKEN_TIMEOUT_MS = 15000;
const MAX_TOKENS_PER_RECORD = 10;
const MAX_RETIRED_TOKENS = 50;

export type PushPlatform = 'ios' | 'android';
export type PushPermission = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

/** Subset of FirebaseMessaging used here (matches @capacitor-firebase/messaging). */
export type MessagingApi = {
  getToken(): Promise<{ token: string }>;
  deleteToken(): Promise<void>;
  checkPermissions(): Promise<{ receive: PushPermission }>;
  requestPermissions(): Promise<{ receive: PushPermission }>;
  createChannel?(channel: { id: string; name: string; description?: string; importance?: number }): Promise<void>;
};

/** Persistent async key/value store (Capacitor Preferences in the app). */
export type AsyncStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string | null): Promise<void>;
};

export type LifecycleDeps = {
  messaging: MessagingApi;
  platform: PushPlatform;
  fetch: typeof fetch;
  store: AsyncStore;
  /** Importance.High from the plugin (4). */
  androidImportanceHigh?: number;
  sleep?: (ms: number) => Promise<void>;
  requestTimeoutMs?: number;
  newId?: () => string;
};

type RegistrationRecord = { userId: string; tokens: string[]; at: number };
type RetiredMarker = { id: string; token: string; userId: string };
type BearerHint = { userId: string | null; accessToken: string | null } | null;

function errorText(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err ?? '');
  const e = err as { code?: unknown; message?: unknown };
  return `${typeof e.code === 'string' ? e.code : ''} ${typeof e.message === 'string' ? e.message : ''}`;
}

/** Firebase missing from the native build: stop quietly. */
function isNotConfiguredError(err: unknown): boolean {
  return /UNAVAILABLE|UNIMPLEMENTED|not configured|GoogleService-Info|FirebaseApp is not initialized|google-services/i.test(
    errorText(err),
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function parseJson<T>(raw: string | null, guard: (value: unknown) => value is T): T | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isRecord = (value: unknown): value is RegistrationRecord => {
  const v = value as RegistrationRecord;
  return Boolean(v) && typeof v.userId === 'string' && isStringArray(v.tokens) && typeof v.at === 'number';
};

const isMarkers = (value: unknown): value is RetiredMarker[] =>
  Array.isArray(value) &&
  value.every((m) => m && typeof m.id === 'string' && typeof m.token === 'string' && typeof m.userId === 'string');

/** Only same-site relative paths ("/movie/123", "/?view=friends"); else null. */
export function safePushPath(raw: unknown, origin: string): string | null {
  if (typeof raw !== 'string') return null;
  const path = raw.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.length > 300) return null;
  try {
    const url = new URL(path, origin);
    if (url.origin !== origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function createPushLifecycle(deps: LifecycleDeps) {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const requestTimeoutMs = deps.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const newId =
    deps.newId ??
    (() =>
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

  let disposed = false;
  let started = false;
  let generation = 0;
  let userId: string | null = null;
  let accessToken: string | null = null;
  /** Generation that has a successful registration. */
  let enabledGeneration: number | null = null;
  /** Generation with a sync queued or running. */
  let syncingGeneration: number | null = null;
  let queue: Promise<void> = Promise.resolve();
  /** Serializes read-modify-write of persisted state (separate from the work queue, so retiring never waits on a slow POST). */
  let storeLock: Promise<unknown> = Promise.resolve();

  const isCurrent = (gen: number) => !disposed && gen === generation;

  function enqueue(task: () => Promise<void>): Promise<void> {
    const run = queue.then(() => (disposed ? undefined : task()));
    queue = run.catch(() => undefined);
    return queue;
  }

  function withStore<T>(fn: () => Promise<T>): Promise<T> {
    const run = storeLock.then(fn, fn);
    storeLock = run.catch(() => undefined);
    return run;
  }

  // --- persisted state (call only inside withStore) -------------------------

  async function readRecord() {
    return parseJson(await deps.store.get(PUSH_REGISTRATION_KEY), isRecord);
  }
  async function writeRecord(record: RegistrationRecord | null) {
    await deps.store.set(PUSH_REGISTRATION_KEY, record ? JSON.stringify(record) : null);
  }
  async function readMarkers() {
    return parseJson(await deps.store.get(PUSH_RETIRED_KEY), isMarkers) ?? [];
  }
  async function writeMarkers(markers: RetiredMarker[]) {
    await deps.store.set(PUSH_RETIRED_KEY, markers.length ? JSON.stringify(markers) : null);
  }
  async function readRetiredTokens() {
    return parseJson(await deps.store.get(PUSH_RETIRED_TOKENS_KEY), isStringArray) ?? [];
  }

  /**
   * Move the registration record into retired markers (persisted first), unless
   * it belongs to `keepUserId`. Retired tokens are also remembered so they can
   * never be registered again.
   */
  async function retireRecordLocked(keepUserId: string | null): Promise<void> {
    const record = await readRecord();
    if (!record || (keepUserId && record.userId === keepUserId)) return;
    const markers = await readMarkers();
    for (const token of record.tokens) {
      if (!markers.some((m) => m.token === token)) markers.push({ id: newId(), token, userId: record.userId });
    }
    const retired = await readRetiredTokens();
    const nextRetired = [...retired.filter((t) => !record.tokens.includes(t)), ...record.tokens].slice(-MAX_RETIRED_TOKENS);
    await writeMarkers(markers);
    await deps.store.set(PUSH_RETIRED_TOKENS_KEY, JSON.stringify(nextRetired));
    await writeRecord(null);
  }

  // --- requests --------------------------------------------------------------

  async function request(method: 'POST' | 'DELETE', bearer: string | null, body: unknown): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const res = await deps.fetch(REGISTER_ENDPOINT, {
        method,
        headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        body: JSON.stringify(body),
        signal: controller.signal,
        keepalive: method === 'DELETE',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  type Probe = { status: 'ok'; token: string } | { status: 'not-configured' } | { status: 'error' };

  async function probeToken(): Promise<Probe> {
    try {
      const { token } = await withTimeout(deps.messaging.getToken(), GET_TOKEN_TIMEOUT_MS);
      return token ? { status: 'ok', token } : { status: 'error' };
    } catch (err) {
      return isNotConfiguredError(err) ? { status: 'not-configured' } : { status: 'error' };
    }
  }

  /** Ensure the device token is no longer `token`. Fails closed. */
  async function rotateAway(token: string): Promise<boolean> {
    let probe = await probeToken();
    if (disposed || probe.status !== 'ok') return false;
    if (probe.token !== token) return true;
    try {
      await deps.messaging.deleteToken();
    } catch {
      return false;
    }
    if (disposed) return false;
    probe = await probeToken();
    return probe.status === 'ok' && probe.token !== token;
  }

  /**
   * Process every persisted marker: server DELETE (owner's bearer when known,
   * else token-possession proof) then rotation. Each marker is removed by id
   * only after both succeed. Returns true when no markers remain.
   */
  async function processMarkers(hint: BearerHint): Promise<boolean> {
    const markers = await withStore(readMarkers);
    for (const marker of markers) {
      if (disposed) return false;
      const bearer = hint && hint.userId === marker.userId ? hint.accessToken : null;
      let deleted = await request('DELETE', bearer, { token: marker.token });
      if (!deleted && bearer && !disposed) deleted = await request('DELETE', null, { token: marker.token });
      if (!deleted || disposed) continue;
      const rotated = await rotateAway(marker.token);
      if (!rotated || disposed) continue;
      await withStore(async () => {
        if (disposed) return;
        const current = await readMarkers();
        await writeMarkers(current.filter((m) => m.id !== marker.id));
      });
    }
    if (disposed) return false;
    return (await withStore(readMarkers)).length === 0;
  }

  /**
   * Record (persist) then POST. Fails closed on retired tokens. The record write
   * happens under the store lock together with the generation check, so a
   * concurrent sign-out either retires this token or stops it before sending.
   */
  async function registerToken(gen: number, token: string, force: boolean): Promise<boolean> {
    const owner = userId;
    const bearer = accessToken;
    if (!isCurrent(gen) || !owner || !bearer) return false;

    const decision = await withStore(async (): Promise<'skip' | 'send' | 'blocked' | 'stale'> => {
      if (!isCurrent(gen) || userId !== owner) return 'stale';
      const retired = await readRetiredTokens();
      if (retired.includes(token)) return 'blocked';
      const record = await readRecord();
      if (record && record.userId !== owner) return 'blocked'; // must be retired first
      const tokens = record?.tokens ?? [];
      const fresh = !force && tokens.includes(token) && Date.now() - (record?.at ?? 0) < REREGISTER_AFTER_MS;
      if (fresh) return 'skip';
      const nextTokens = [...tokens.filter((t) => t !== token), token].slice(-MAX_TOKENS_PER_RECORD);
      await writeRecord({ userId: owner, tokens: nextTokens, at: record?.at ?? 0 });
      return 'send';
    });
    if (decision === 'skip') return true;
    if (decision !== 'send') return false;

    const ok = await request('POST', bearer, { token, platform: deps.platform });
    if (!ok || !isCurrent(gen) || userId !== owner) return false;
    await withStore(async () => {
      if (!isCurrent(gen) || userId !== owner) return;
      const record = await readRecord();
      if (record && record.userId === owner) await writeRecord({ ...record, at: Date.now() });
    });
    return true;
  }

  async function enable(gen: number): Promise<void> {
    // getToken works before permission is granted, so it doubles as the
    // "is Firebase configured?" check before any prompt.
    let probe = await probeToken();
    if (!isCurrent(gen) || probe.status === 'not-configured') return;

    if (deps.platform === 'android' && deps.messaging.createChannel) {
      try {
        await deps.messaging.createChannel({
          id: ANDROID_PUSH_CHANNEL_ID,
          name: 'BingeItBro',
          description: 'Friend recommendations and watch reminders',
          importance: deps.androidImportanceHigh ?? 4,
        });
      } catch {
        // Optional.
      }
      if (!isCurrent(gen)) return;
    }

    let permission = (await deps.messaging.checkPermissions()).receive;
    if (!isCurrent(gen)) return;
    if (permission === 'prompt' || permission === 'prompt-with-rationale') {
      permission = (await deps.messaging.requestPermissions()).receive;
      if (!isCurrent(gen)) return;
    }
    if (permission !== 'granted') return;

    // iOS may not have the APNs token on the first try; retry briefly.
    for (let attempt = 0; probe.status !== 'ok' && attempt < 3; attempt += 1) {
      await sleep(1500 * (attempt + 1));
      if (!isCurrent(gen)) return;
      probe = await probeToken();
      if (!isCurrent(gen) || probe.status === 'not-configured') return;
    }
    if (probe.status !== 'ok') return;

    if (await registerToken(gen, probe.token, false)) {
      if (isCurrent(gen)) enabledGeneration = gen;
    }
  }

  /** Startup / auth-change task: clean up other accounts' leftovers, then register the current one. */
  async function syncTask(gen: number, hint: BearerHint): Promise<void> {
    try {
      if (!isCurrent(gen)) return;
      const owner = userId;
      await withStore(() => retireRecordLocked(owner));
      if (disposed) return;
      const clean = await processMarkers(hint);
      // Fail closed: never register while a retired token may still be live.
      if (!clean || !isCurrent(gen) || !owner || userId !== owner) return;
      await enable(gen);
    } finally {
      if (!disposed && syncingGeneration === gen) syncingGeneration = null;
    }
  }

  function scheduleSync(hint: BearerHint): Promise<void> {
    const gen = generation;
    syncingGeneration = gen;
    return enqueue(() => syncTask(gen, hint));
  }

  return {
    /** Call on every Supabase auth event (initial session, sign-in/out, token refresh). */
    onSession(nextUserId: string | null, nextAccessToken: string | null): Promise<void> {
      if (disposed) return queue;
      if (!started) {
        // First auth event after startup: always sync, even when signed out, so
        // leftovers from an interrupted sign-out are cleaned up before anything else.
        started = true;
        generation += 1;
        userId = nextUserId;
        accessToken = nextAccessToken;
        return scheduleSync(null);
      }
      if (nextUserId === userId) {
        accessToken = nextAccessToken;
        const needsSync =
          Boolean(nextUserId) && enabledGeneration !== generation && syncingGeneration !== generation;
        return needsSync ? scheduleSync(null) : queue;
      }
      const hint: BearerHint = userId ? { userId, accessToken } : null;
      generation += 1;
      userId = nextUserId;
      accessToken = nextAccessToken;
      enabledGeneration = null;
      return scheduleSync(hint);
    },

    /** FCM token refresh (tokenReceived). Re-registers for the current account only. */
    onTokenRefresh(token: string): Promise<void> {
      if (disposed || !token) return queue;
      const gen = generation;
      return enqueue(async () => {
        if (!isCurrent(gen) || enabledGeneration !== gen) return;
        await registerToken(gen, token, true);
      });
    },

    /** App resumed: retry pending cleanup/registration if the last attempt failed. */
    onResume(): Promise<void> {
      if (disposed || syncingGeneration === generation) return queue;
      if (enabledGeneration === generation && userId) return queue;
      return scheduleSync(null);
    },

    /**
     * Awaited by AuthProvider.signOut (via the native logout registry) while the
     * session is still valid. Retires the registration (persisted) right away,
     * then runs the unlink + rotation on the queue. If the caller's timeout wins,
     * the markers stay and the next startup finishes the job.
     */
    async logout(ctx: { userId: string | null; accessToken: string | null }): Promise<void> {
      if (disposed) return;
      await withStore(async () => {
        generation += 1; // stops in-flight work for the old account
        userId = null;
        accessToken = null;
        enabledGeneration = null;
        await retireRecordLocked(null);
      });
      await scheduleSync(ctx.userId ? { userId: ctx.userId, accessToken: ctx.accessToken } : null);
    },

    /** Stop all work; queued and in-flight tasks no longer write state or start requests. */
    dispose() {
      disposed = true;
    },

    /** Resolves when all queued work has finished (tests). */
    idle(): Promise<void> {
      return queue;
    },
  };
}

export type PushLifecycle = ReturnType<typeof createPushLifecycle>;
