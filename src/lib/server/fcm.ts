/**
 * Firebase Cloud Messaging (HTTP v1) sender for the native iOS/Android app.
 *
 * Server-only. Runs on Cloudflare Workers (OpenNext), so it uses fetch + Web
 * Crypto only (no firebase-admin / Node-only libs).
 *
 * Configuration (any one of):
 *   - FIREBASE_SERVICE_ACCOUNT_JSON: the service account key JSON (raw or base64)
 *   - FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 * plus NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to read tokens.
 *
 * Every exported send function is a silent no-op when not configured and never
 * throws: push is best-effort and must not break or noticeably slow the caller.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare/cloudflare-context';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
// Fixed Google OAuth2 token endpoint; also the JWT audience.
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ANDROID_CHANNEL_ID = 'bib_default';
const DEFAULT_BUDGET_MS = 2500;
const BACKGROUND_BUDGET_MS = 15000;
const FETCH_TIMEOUT_MS = 2000;
const MAX_USERS = 100;
const MAX_TOKENS = 300;
const SEND_CONCURRENCY = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FCM_TOKEN_RE = /^[A-Za-z0-9_:.-]{20,4096}$/;

type ServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

type SupabaseAdmin = {
  url: string;
  anonKey: string;
  serviceKey: string;
};

export type PushPayload = {
  title: string;
  body: string;
  /** String values only (FCM requirement). Use `path` for a same-site relative deep link. */
  data?: Record<string, string>;
};

export type UserPushMessage = PushPayload & { userId: string };

type TokenRow = { user_id: string; token: string; platform: string };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

let cachedAccount: ServiceAccount | null | undefined;
let cachedAccountSource = '';

function readServiceAccount(): ServiceAccount | null {
  const rawJson = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '').trim();
  const projectIdEnv = (process.env.FIREBASE_PROJECT_ID ?? '').trim();
  const clientEmailEnv = (process.env.FIREBASE_CLIENT_EMAIL ?? '').trim();
  const privateKeyEnv = process.env.FIREBASE_PRIVATE_KEY ?? '';
  const source = `${rawJson.length}:${projectIdEnv}:${clientEmailEnv}:${privateKeyEnv.length}`;
  if (cachedAccount !== undefined && cachedAccountSource === source) return cachedAccount;
  cachedAccountSource = source;
  cachedAccount = null;

  try {
    if (rawJson) {
      let text = rawJson;
      if (!text.startsWith('{')) {
        // Allow base64-encoded JSON (easier to paste into secret stores).
        text = atob(text);
      }
      const parsed = JSON.parse(text) as {
        project_id?: unknown;
        client_email?: unknown;
        private_key?: unknown;
      };
      const projectId = typeof parsed.project_id === 'string' ? parsed.project_id.trim() : '';
      const clientEmail = typeof parsed.client_email === 'string' ? parsed.client_email.trim() : '';
      const privateKey = typeof parsed.private_key === 'string' ? normalizePrivateKey(parsed.private_key) : '';
      if (projectId && clientEmail && privateKey) {
        cachedAccount = { projectId, clientEmail, privateKey };
      }
    } else if (projectIdEnv && clientEmailEnv && privateKeyEnv.trim()) {
      cachedAccount = {
        projectId: projectIdEnv,
        clientEmail: clientEmailEnv,
        privateKey: normalizePrivateKey(privateKeyEnv),
      };
    }
  } catch {
    cachedAccount = null;
  }
  return cachedAccount;
}

function normalizePrivateKey(value: string): string {
  return value
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/\\n/g, '\n');
}

function readSupabaseAdmin(): SupabaseAdmin | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? '').trim();
  if (!url || serviceKey.split('.').length !== 3) return null;
  return { url, anonKey: anonKey || serviceKey, serviceKey };
}

/** True when both FCM credentials and the Supabase service role are configured. */
export function isFcmConfigured(): boolean {
  return Boolean(readServiceAccount() && readSupabaseAdmin());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlFromString(value: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function truncate(value: string, max: number): string {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Only same-site relative paths (e.g. "/movie/123", "/?view=friends"). */
export function sanitizePushPath(path: unknown): string {
  if (typeof path !== 'string') return '';
  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) return '';
  if (trimmed.length > 300 || /[\u0000-\u001f]/.test(trimmed)) return '';
  return trimmed;
}

// ---------------------------------------------------------------------------
// OAuth2 access token (service account JWT, RS256 via Web Crypto)
// ---------------------------------------------------------------------------

let cachedSigningKey: { pem: string; key: CryptoKey } | null = null;
let cachedAccessToken: { token: string; expiresAt: number; clientEmail: string } | null = null;
let inflightAccessToken: Promise<string | null> | null = null;

async function getSigningKey(pem: string): Promise<CryptoKey> {
  if (cachedSigningKey && cachedSigningKey.pem === pem) return cachedSigningKey.key;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  cachedSigningKey = { pem, key };
  return key;
}

async function fetchAccessToken(account: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlFromString(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64UrlFromString(
    JSON.stringify({
      iss: account.clientEmail,
      scope: FCM_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const key = await getSigningKey(account.privateKey);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64UrlFromBytes(new Uint8Array(signature))}`;

  const response = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  if (!response.ok) {
    console.error('[fcm] OAuth token request failed', response.status);
    return null;
  }
  const data = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
  const token = typeof data?.access_token === 'string' ? data.access_token : '';
  if (!token) return null;
  const expiresIn = typeof data?.expires_in === 'number' ? data.expires_in : 3600;
  cachedAccessToken = {
    token,
    // Refresh a minute early.
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    clientEmail: account.clientEmail,
  };
  return token;
}

async function getAccessToken(account: ServiceAccount): Promise<string | null> {
  if (
    cachedAccessToken &&
    cachedAccessToken.clientEmail === account.clientEmail &&
    cachedAccessToken.expiresAt > Date.now()
  ) {
    return cachedAccessToken.token;
  }
  if (!inflightAccessToken) {
    inflightAccessToken = fetchAccessToken(account)
      .catch((err) => {
        console.error('[fcm] OAuth token error', err instanceof Error ? err.name : 'unknown');
        return null;
      })
      .finally(() => {
        inflightAccessToken = null;
      });
  }
  return inflightAccessToken;
}

// ---------------------------------------------------------------------------
// Token storage (Supabase REST, service role)
// ---------------------------------------------------------------------------

async function loadTokens(admin: SupabaseAdmin, userIds: string[]): Promise<TokenRow[]> {
  if (userIds.length === 0) return [];
  const url =
    `${admin.url}/rest/v1/native_push_tokens?select=user_id,token,platform` +
    `&user_id=in.(${userIds.join(',')})&order=updated_at.desc&limit=${MAX_TOKENS}`;
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { apikey: admin.anonKey, Authorization: `Bearer ${admin.serviceKey}` },
  });
  if (!response.ok) return [];
  const rows = (await response.json().catch(() => [])) as TokenRow[];
  return Array.isArray(rows)
    ? rows.filter((row) => typeof row?.token === 'string' && FCM_TOKEN_RE.test(row.token))
    : [];
}

async function deleteTokens(admin: SupabaseAdmin, tokens: string[]): Promise<void> {
  const valid = tokens.filter((token) => FCM_TOKEN_RE.test(token));
  if (valid.length === 0) return;
  const list = valid.map((token) => `"${token}"`).join(',');
  await fetchWithTimeout(`${admin.url}/rest/v1/native_push_tokens?token=in.(${encodeURIComponent(list)})`, {
    method: 'DELETE',
    headers: {
      apikey: admin.anonKey,
      Authorization: `Bearer ${admin.serviceKey}`,
      Prefer: 'return=minimal',
    },
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

type SendResult = 'ok' | 'unregistered' | 'unauthorized' | 'error';

function buildMessage(token: string, payload: PushPayload) {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload.data ?? {})) {
    if (typeof value !== 'string' || !key || key.length > 64) continue;
    if (key === 'path') {
      const path = sanitizePushPath(value);
      if (path) data.path = path;
      continue;
    }
    data[key] = value.slice(0, 500);
  }
  return {
    message: {
      token,
      notification: {
        title: truncate(payload.title, 100),
        body: truncate(payload.body, 240),
      },
      data,
      android: {
        priority: 'HIGH',
        notification: {
          channel_id: ANDROID_CHANNEL_ID,
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: { sound: 'default' },
        },
      },
    },
  };
}

async function sendOne(account: ServiceAccount, accessToken: string, token: string, payload: PushPayload): Promise<SendResult> {
  const response = await fetchWithTimeout(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.projectId)}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildMessage(token, payload)),
    },
  );
  if (response.ok) return 'ok';
  if (response.status === 401) return 'unauthorized';

  const data = (await response.json().catch(() => null)) as {
    error?: { status?: string; details?: Array<{ errorCode?: string }> };
  } | null;
  const errorCodes = (data?.error?.details ?? []).map((detail) => detail?.errorCode ?? '');

  // Only UNREGISTERED proves the token is dead. INVALID_ARGUMENT can also mean
  // a bad payload, so tokens are never pruned on it.
  if (errorCodes.includes('UNREGISTERED')) return 'unregistered';

  console.error('[fcm] send failed', response.status, data?.error?.status ?? '', errorCodes.join(','));
  return 'error';
}

async function sendJobs(
  account: ServiceAccount,
  accessToken: string,
  jobs: Array<{ token: string; payload: PushPayload }>,
): Promise<SendResult[]> {
  const results: SendResult[] = [];
  for (let i = 0; i < jobs.length; i += SEND_CONCURRENCY) {
    const batch = jobs.slice(i, i + SEND_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((job) => sendOne(account, accessToken, job.token, job.payload).catch((): SendResult => 'error')),
    );
    results.push(...batchResults);
  }
  return results;
}

async function deliver(messages: UserPushMessage[]): Promise<void> {
  const account = readServiceAccount();
  const admin = readSupabaseAdmin();
  if (!account || !admin) return;

  const byUser = new Map<string, PushPayload[]>();
  for (const message of messages) {
    if (!message || !UUID_RE.test(String(message.userId ?? ''))) continue;
    if (!message.title && !message.body) continue;
    if (!byUser.has(message.userId) && byUser.size >= MAX_USERS) continue;
    const list = byUser.get(message.userId) ?? [];
    list.push(message);
    byUser.set(message.userId, list);
  }
  if (byUser.size === 0) return;

  const tokens = await loadTokens(admin, [...byUser.keys()]);
  if (tokens.length === 0) return;

  let accessToken = await getAccessToken(account);
  if (!accessToken) return;

  const jobs: Array<{ token: string; payload: PushPayload }> = [];
  for (const row of tokens) {
    for (const payload of byUser.get(row.user_id) ?? []) {
      if (jobs.length < MAX_TOKENS) jobs.push({ token: row.token, payload });
    }
  }

  const results = await sendJobs(account, accessToken, jobs);

  // Access token rejected (e.g. key rotated): invalidate, re-auth and retry those once.
  const unauthorized = results.flatMap((result, index) => (result === 'unauthorized' ? [index] : []));
  if (unauthorized.length > 0) {
    cachedAccessToken = null;
    accessToken = await getAccessToken(account);
    if (accessToken) {
      const retried = await sendJobs(account, accessToken, unauthorized.map((index) => jobs[index]));
      unauthorized.forEach((jobIndex, i) => {
        results[jobIndex] = retried[i];
      });
    }
  }

  const unregistered = new Set<string>();
  results.forEach((result, index) => {
    if (result === 'unregistered') unregistered.add(jobs[index].token);
  });
  if (unregistered.size > 0) {
    await deleteTokens(admin, [...unregistered]);
  }
}

type WaitUntilContext = { ctx?: { waitUntil?: (promise: Promise<unknown>) => void } };

/** Cloudflare ExecutionContext.waitUntil when running inside the OpenNext worker, else null. */
function getWaitUntil(): ((promise: Promise<unknown>) => void) | null {
  try {
    const context = getCloudflareContext() as unknown as WaitUntilContext;
    const ctx = context?.ctx;
    if (!ctx || typeof ctx.waitUntil !== 'function') return null;
    return (promise) => ctx.waitUntil?.(promise);
  } catch {
    // Not inside a Cloudflare request (next dev/build, tests).
    return null;
  }
}

function withBudget(promise: Promise<void>, budgetMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, budgetMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Send per-user push messages. Best effort and never rejects; a no-op when
 * FCM credentials or the Supabase service role aren't configured.
 *
 * `messages` may be a function that builds them (e.g. looks up display
 * names); it then only runs when push is configured, inside the background
 * task.
 *
 * On Cloudflare the delivery is handed to ctx.waitUntil so the caller's
 * response isn't delayed; elsewhere it is awaited with a short time budget.
 */
export async function sendPushMessages(
  messages: UserPushMessage[] | (() => Promise<UserPushMessage[]>),
  options: { budgetMs?: number } = {},
): Promise<void> {
  try {
    if (Array.isArray(messages) && messages.length === 0) return;
    if (!isFcmConfigured()) return;

    const delivery = (async () => {
      const resolved = typeof messages === 'function' ? await messages() : messages;
      if (Array.isArray(resolved) && resolved.length > 0) await deliver(resolved);
    })().catch((err) => {
      console.error('[fcm] delivery error', err instanceof Error ? err.name : 'unknown');
    });

    const waitUntil = getWaitUntil();
    if (waitUntil) {
      try {
        waitUntil(withBudget(delivery, BACKGROUND_BUDGET_MS));
        return;
      } catch {
        // Fall through to awaiting.
      }
    }
    await withBudget(delivery, Math.max(250, options.budgetMs ?? DEFAULT_BUDGET_MS));
  } catch {
    // Never throw into the caller.
  }
}

/** Send the same notification to every registered device of the given users. */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
  options: { budgetMs?: number } = {},
): Promise<void> {
  try {
    const unique = [...new Set(Array.isArray(userIds) ? userIds : [])];
    await sendPushMessages(
      unique.map((userId) => ({ userId, ...payload })),
      options,
    );
  } catch {
    // Never throw into the caller.
  }
}

/** Display names for push copy. Returns an empty map when not configured or on error. */
export async function fetchUserNamesForPush(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  try {
    const admin = readSupabaseAdmin();
    const ids = [...new Set(userIds)].filter((id) => UUID_RE.test(id)).slice(0, MAX_USERS);
    if (!admin || ids.length === 0) return names;
    const response = await fetchWithTimeout(
      `${admin.url}/rest/v1/users?select=id,name,username&id=in.(${ids.join(',')})`,
      { method: 'GET', headers: { apikey: admin.anonKey, Authorization: `Bearer ${admin.serviceKey}` } },
      1500,
    );
    if (!response.ok) return names;
    const rows = (await response.json().catch(() => [])) as Array<{ id?: string; name?: string | null; username?: string | null }>;
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row?.id) continue;
      const name = (row.name ?? '').trim() || (row.username ?? '').trim();
      if (name) names.set(row.id, truncate(name, 60));
    }
  } catch {
    // Ignore.
  }
  return names;
}
