/**
 * Native (Capacitor iOS/Android) push token lifecycle.
 *
 * Pure logic with injected dependencies (plugin, fetch, storage) so it can be
 * unit-tested in Node (scripts/mobile/test-native-push-lifecycle.mjs). The
 * Capacitor wiring lives in src/components/native/NativePush.tsx.
 *
 * Invariants:
 * - Every side effect (register, refresh, unlink, FCM token delete) runs on ONE
 *   serialized queue, so operations for account A always finish before any
 *   operation for account B starts.
 * - Each sign-in/sign-out/account switch bumps `generation`. Tasks capture the
 *   generation they were created for and re-check it before and after every
 *   await; stale tasks stop without starting new work.
 * - Every token that was (or may have been) registered for an account is
 *   recorded before the POST is sent. When that account's session ends, the
 *   queued unlink task deletes all of them server-side, so a stale POST that
 *   landed late is always cleaned up before the next account registers.
 * - After dispose(), no task writes state or starts requests.
 *
 * If Firebase isn't configured in the native build (GoogleService-Info.plist /
 * google-services.json missing), getToken rejects as "unavailable" and push is
 * skipped quietly: no permission prompt, no error UI.
 */

export const ANDROID_PUSH_CHANNEL_ID = 'bib_default';
export const REGISTER_ENDPOINT = '/api/native-push/register';
const REGISTERED_KEY = 'bib_native_push_registered';
const REREGISTER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;
const GET_TOKEN_TIMEOUT_MS = 15000;

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

export type KeyValueStore = {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
};

export type LifecycleDeps = {
  messaging: MessagingApi;
  platform: PushPlatform;
  fetch: typeof fetch;
  storage?: KeyValueStore;
  /** Importance.High from the plugin (4). */
  androidImportanceHigh?: number;
  sleep?: (ms: number) => Promise<void>;
};

type Registration = { userId: string; accessToken: string; token: string };

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

  let disposed = false;
  let generation = 0;
  let userId: string | null = null;
  let accessToken: string | null = null;
  /** Account (generation) that has a successful registration; null when none. */
  let enabledGeneration: number | null = null;
  /** Generation for which an enable attempt is queued or running. */
  let enablingGeneration: number | null = null;
  /** Everything registered (or possibly registered) per generation, pending unlink. */
  const registrations = new Map<number, Registration[]>();
  let queue: Promise<void> = Promise.resolve();

  const isCurrent = (gen: number) => !disposed && gen === generation;

  function enqueue(task: () => Promise<void>) {
    queue = queue.then(() => (disposed ? undefined : task())).catch(() => undefined);
    return queue;
  }

  function readCache(): { key: string; at: number } | null {
    try {
      const raw = deps.storage?.get(REGISTERED_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { key?: unknown; at?: unknown };
      return typeof parsed.key === 'string' && typeof parsed.at === 'number' ? { key: parsed.key, at: parsed.at } : null;
    } catch {
      return null;
    }
  }

  function writeCache(value: { key: string; at: number } | null) {
    try {
      deps.storage?.set(REGISTERED_KEY, value ? JSON.stringify(value) : null);
    } catch {
      // Ignore.
    }
  }

  async function request(method: 'POST' | 'DELETE', bearer: string | null, body: unknown): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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

  /** Record, then POST. Recording first means a POST that lands late is still unlinked. */
  async function registerToken(gen: number, token: string, force: boolean): Promise<boolean> {
    if (!isCurrent(gen) || !userId || !accessToken) return false;
    const reg: Registration = { userId, accessToken, token };
    const list = registrations.get(gen) ?? [];
    if (!list.some((r) => r.token === token)) list.push(reg);
    registrations.set(gen, list);

    const cacheKey = `${reg.userId}:${token}`;
    const cached = readCache();
    if (!force && cached?.key === cacheKey && Date.now() - cached.at < REREGISTER_AFTER_MS) return true;

    const ok = await request('POST', reg.accessToken, { token, platform: deps.platform });
    // Re-check after the await: a stale success must not touch shared state.
    // Its row (if it landed) is removed by the unlink task already queued for gen.
    if (!isCurrent(gen)) return false;
    if (ok) writeCache({ key: cacheKey, at: Date.now() });
    return ok;
  }

  async function enableTask(gen: number) {
    if (!isCurrent(gen) || !userId) return;
    try {
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

      const ok = await registerToken(gen, probe.token, false);
      if (ok && isCurrent(gen)) enabledGeneration = gen;
    } finally {
      if (!disposed && enablingGeneration === gen) enablingGeneration = null;
    }
  }

  /** Unlink every token recorded for `gen` (plus the device's current token) and rotate it at FCM. */
  async function unlinkTask(gen: number, fallbackAccessToken: string | null, hadAccount: boolean) {
    const recorded = registrations.get(gen) ?? [];
    registrations.delete(gen);
    writeCache(null);

    const targets = new Map<string, string | null>();
    for (const reg of recorded) targets.set(reg.token, reg.accessToken);
    if (hadAccount) {
      // Also covers a registration from a previous app launch (cache hit, no POST this session).
      const probe = await probeToken();
      if (disposed) return;
      if (probe.status === 'ok' && !targets.has(probe.token)) targets.set(probe.token, fallbackAccessToken);
      if (probe.status === 'not-configured' && targets.size === 0) return;
    }
    for (const [token, bearer] of targets) {
      if (disposed) return;
      // The server falls back to token possession when the session is already revoked.
      await request('DELETE', bearer ?? fallbackAccessToken, { token });
    }
    if (disposed || targets.size === 0) return;
    try {
      // New FCM token for the next account; the old one stops receiving pushes.
      await deps.messaging.deleteToken();
    } catch {
      // Ignore.
    }
  }

  return {
    /** Call on every Supabase auth event (initial session, sign-in/out, token refresh). */
    onSession(nextUserId: string | null, nextAccessToken: string | null) {
      if (disposed) return queue;
      if (nextUserId === userId) {
        // Same account (e.g. TOKEN_REFRESHED): keep the newest bearer for future requests.
        accessToken = nextAccessToken;
        if (nextUserId && nextAccessToken && enabledGeneration !== generation && enablingGeneration !== generation) {
          const gen = generation;
          enablingGeneration = gen;
          enqueue(() => enableTask(gen));
        }
        return queue;
      }

      const previousGen = generation;
      const previousUserId = userId;
      const previousAccessToken = accessToken;
      generation += 1;
      userId = nextUserId;
      accessToken = nextAccessToken;
      enabledGeneration = null;
      enablingGeneration = null;

      if (previousUserId || registrations.has(previousGen)) {
        enqueue(() => unlinkTask(previousGen, previousAccessToken, Boolean(previousUserId)));
      }
      if (nextUserId && nextAccessToken) {
        const gen = generation;
        enablingGeneration = gen;
        enqueue(() => enableTask(gen));
      }
      return queue;
    },

    /** FCM token refresh (tokenReceived). Re-registers for the current account only. */
    onTokenRefresh(token: string) {
      if (disposed || !token) return queue;
      const gen = generation;
      enqueue(async () => {
        if (!isCurrent(gen) || enabledGeneration !== gen) return;
        await registerToken(gen, token, true);
      });
      return queue;
    },

    /** Stop all work; queued and in-flight tasks no longer write state or start requests. */
    dispose() {
      disposed = true;
    },

    /** Resolves when all queued work has finished (tests). */
    idle() {
      return queue;
    },
  };
}

export type PushLifecycle = ReturnType<typeof createPushLifecycle>;
