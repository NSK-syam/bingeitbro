/**
 * Core logic for POST /api/account/delete (in-app account deletion, App Store
 * Guideline 5.1.1(v)).
 *
 * This module has NO imports on purpose: it only uses fetch + Web Crypto, so it
 * runs on Cloudflare Workers (opennext) and can be loaded directly by
 * `node scripts/test-account-deletion.mjs` (Node type stripping) with a mocked fetch.
 *
 * ---------------------------------------------------------------------------
 * Request (JSON body, Bearer Supabase access token in Authorization):
 *   { confirm: "DELETE",
 *     password?: string,                // email/password accounts (re-auth)
 *     appleIdentityToken?: string,      // Sign in with Apple accounts (fresh native re-auth)
 *     appleAuthorizationCode?: string,
 *     appleNonce?: string }             // RAW nonce; Apple got SHA-256(raw) as hex
 *
 * Gate (nothing destructive happens until ALL of these pass):
 *   1. Bearer token is valid (GET /auth/v1/user).
 *   2. confirm === "DELETE".
 *   3. Recent re-authentication, chosen from the auth user's identities:
 *      - Apple identity: Apple env present, then the fresh identity token is verified
 *        (Apple JWKS RS256, iss, aud = com.bingeitbro.app, exp, iat <= 10 min old,
 *        nonce == sha256hex(raw nonce)) and its `sub` must equal the user's Apple identity.
 *      - else email identity: password re-entered and verified via
 *        POST /auth/v1/token?grant_type=password (returned user id must match).
 *      - else (OAuth only, e.g. Google): the VERIFIED caller session itself must contain a
 *        recent qualifying authentication event: an `amr` entry of the access token (already
 *        validated by /auth/v1/user, and its `sub` must equal the user id) with method in
 *        {password, oauth, otp, magiclink, sso/saml, id_token} (never token_refresh), a finite
 *        timestamp no more than 60 s in the future and no older than 10 minutes.
 *        last_sign_in_at is NOT used (a sign-in on another device must not refresh an old
 *        session). Fails closed with `reauth_required`.
 *   4. Apple users only: the authorization code is exchanged at Apple; the id_token returned
 *      by the exchange is verified (JWKS signature, iss, aud, exp, nonce if present) and its
 *      `sub` must equal the verified request token's `sub` and the account's Apple identity
 *      (so a code for another Apple ID cannot be revoked). Only then is the refresh token
 *      revoked. Any failure aborts BEFORE deleting anything.
 *
 * Deletion order (every step is idempotent, so a retry simply continues):
 *   D1. native_push_tokens   DELETE user_id=eq.<id>   (stop pushes right away; also cascades)
 *   D2. chat_themes          DELETE themes of DM chats containing the user, and of
 *                            groups the user owns (chat_id is TEXT, no FK, never cascades)
 *   D3. auth.users           DELETE /auth/v1/admin/users/<id>  (404 = already gone),
 *       up to 3 attempts. auth.users -> public.users -> every user-owned table is
 *       ON DELETE CASCADE in the schema files, so D3 removes all app data in ONE Postgres
 *       transaction. There is deliberately NO fallback that deletes public.users directly:
 *       GoTrue does not surface the Postgres error code, so a timeout/401/5xx cannot be told
 *       apart from an FK problem, and deleting the profile while the auth user survives would
 *       wipe the data and let ensureUserProfile recreate an empty profile.
 *   On any failure: 500 { retryable: true, step }. The user is still signed in (the auth
 *   user only disappears in D3) and can simply retry. Note D1/D2 are separate requests:
 *   if D3 fails after them, the push tokens and chat themes are already gone (the device
 *   re-registers its push token on next launch; themes fall back to the default).
 *
 * Table -> strategy (from supabase-*.sql / production_migration.sql):
 *   CASCADE via public.users (FK ON DELETE CASCADE): recommendations, friends,
 *     friend_recommendations (sender/recipient), nudges, watchlist, watched_movies,
 *     top_10_picks, top_10_ratings (profile_user/rater), song_playlists,
 *     song_profile_ratings, watch_reminders, push_subscriptions, native_push_tokens,
 *     trivia_attempts, direct_messages, direct_message_reactions, watch_groups (owner),
 *     watch_group_members, watch_group_invites, watch_group_picks, watch_group_messages,
 *     watch_group_message_reactions, watch_group_pick_votes, watch_group_pick_watches.
 *   CASCADE via auth.users: public.users.
 *   Explicit delete (no FK): chat_themes.
 *   Not user data: ai_budget_guard (global spend counter).
 *   Storage: no Supabase Storage buckets are used (avatars are emoji / static paths).
 *   Payments: none (no subscription / purchase tables exist).
 * ---------------------------------------------------------------------------
 *
 * Never log tokens, codes, passwords or Apple secrets: only step names and statuses.
 */

export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_DEFAULT_CLIENT_ID = 'com.bingeitbro.app';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

/** Re-authentication must be at most this old. */
export const REAUTH_MAX_AGE_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AccountDeletionEnv = {
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  appleTeamId?: string;
  appleKeyId?: string;
  /** Contents of the .p8 file (PEM, PKCS#8). Literal "\n" sequences are accepted. */
  applePrivateKey?: string;
  appleClientId?: string;
};

export type AccountDeletionDeps = {
  fetch: typeof fetch;
  now: () => number;
  /** Optional delay between auth-delete attempts (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
};

const AUTH_DELETE_ATTEMPTS = 3;
const AUTH_DELETE_RETRY_DELAY_MS = 400;

/** amr methods that represent a real (re-)authentication, not a token refresh. */
const QUALIFYING_AMR_METHODS = new Set(['password', 'oauth', 'otp', 'magiclink', 'sso/saml', 'id_token']);

export type AccountDeletionInput = {
  authorization: string | null;
  body: unknown;
};

export type AccountDeletionResult = {
  status: number;
  body: Record<string, unknown>;
};

type AuthIdentity = {
  id?: string;
  provider?: string;
  provider_id?: string;
  identity_data?: { sub?: unknown } | null;
};

type AuthUser = {
  id?: string;
  email?: string | null;
  last_sign_in_at?: string | null;
  app_metadata?: { provider?: unknown; providers?: unknown } | null;
  identities?: AuthIdentity[] | null;
};

class StepError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
  }
}

function fail(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): AccountDeletionResult {
  return { status, body: { ok: false, code, message, retryable: false, ...extra } };
}

/* ----------------------------------------------------------------------------
 * Encoding helpers (Web Crypto + btoa/atob only)
 * --------------------------------------------------------------------------*/

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlDecodeToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJwtPart(part: string): Record<string, unknown> | null {
  try {
    const json = new TextDecoder().decode(base64UrlDecodeToBytes(part));
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Unverified payload of a JWT (only used on tokens already verified elsewhere). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  return decodeJwtPart(parts[1]);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bytes = base64UrlDecodeToBytes(body.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
  const out = new ArrayBuffer(bytes.length);
  new Uint8Array(out).set(bytes);
  return out;
}

/* ----------------------------------------------------------------------------
 * Fetch helper
 * --------------------------------------------------------------------------*/

async function timedFetch(
  deps: AccountDeletionDeps,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await deps.fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed = (await res.json()) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function serviceHeaders(env: AccountDeletionEnv, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: env.anonKey || env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, ...extra };
}

/* ----------------------------------------------------------------------------
 * Apple: config, identity token verification, client secret, revocation
 * --------------------------------------------------------------------------*/

export function appleConfigured(env: AccountDeletionEnv): boolean {
  return Boolean(env.appleTeamId?.trim() && env.appleKeyId?.trim() && env.applePrivateKey?.trim());
}

function appleClientId(env: AccountDeletionEnv): string {
  return env.appleClientId?.trim() || APPLE_DEFAULT_CLIENT_ID;
}

type AppleTokenCheck =
  | { ok: true; sub: string }
  | { ok: false; reason: string; transient?: boolean };

/**
 * Verify an Apple id_token: RS256 signature against Apple's JWKS, iss, aud, exp,
 * iat freshness (10 min) and the nonce (sha256hex(raw nonce)).
 * `nonceRequired: false` (used for the id_token returned by the code exchange) still
 * rejects a nonce claim that is present but does not match.
 */
export async function verifyAppleIdentityToken(
  deps: AccountDeletionDeps,
  token: string,
  options: { rawNonce: string; clientId: string; nonceRequired: boolean },
): Promise<AppleTokenCheck> {
  const { rawNonce, clientId, nonceRequired } = options;
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  if (!header || !payload) return { ok: false, reason: 'malformed' };
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return { ok: false, reason: 'bad_header' };

  let keysRes: Response;
  try {
    keysRes = await timedFetch(deps, APPLE_KEYS_URL, { method: 'GET' });
  } catch {
    return { ok: false, reason: 'jwks_unreachable', transient: true };
  }
  if (!keysRes.ok) return { ok: false, reason: 'jwks_unreachable', transient: true };
  const jwks = await readJson(keysRes);
  const keys = Array.isArray(jwks?.keys) ? (jwks.keys as Array<Record<string, unknown>>) : [];
  const jwk = keys.find((key) => key?.kid === header.kid && key?.kty === 'RSA');
  if (!jwk || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') return { ok: false, reason: 'unknown_kid' };

  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signature = base64UrlDecodeToBytes(parts[2]);
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature as BufferSource, signed);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'bad_signature' };

  const now = deps.now();
  if (payload.iss !== APPLE_ISSUER) return { ok: false, reason: 'bad_iss' };
  const aud = payload.aud;
  const audOk = Array.isArray(aud) ? aud.includes(clientId) : aud === clientId;
  if (!audOk) return { ok: false, reason: 'bad_aud' };
  const exp = typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  if (!exp || exp + CLOCK_SKEW_MS < now) return { ok: false, reason: 'expired' };
  const iat = typeof payload.iat === 'number' ? payload.iat * 1000 : 0;
  if (!iat || iat > now + CLOCK_SKEW_MS || now - iat > REAUTH_MAX_AGE_MS) return { ok: false, reason: 'stale' };
  const expectedNonce = await sha256Hex(rawNonce);
  if (payload.nonce !== undefined || nonceRequired) {
    if (typeof payload.nonce !== 'string' || payload.nonce.toLowerCase() !== expectedNonce) {
      return { ok: false, reason: 'bad_nonce' };
    }
  }
  if (typeof payload.sub !== 'string' || !payload.sub) return { ok: false, reason: 'no_sub' };
  return { ok: true, sub: payload.sub };
}

/** ES256 client_secret JWT for Apple's token/revoke endpoints (valid 5 minutes). */
export async function createAppleClientSecret(env: AccountDeletionEnv, nowMs: number): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const header = { alg: 'ES256', kid: (env.appleKeyId ?? '').trim(), typ: 'JWT' };
  const payload = {
    iss: (env.appleTeamId ?? '').trim(),
    iat,
    exp: iat + 300,
    aud: APPLE_ISSUER,
    sub: appleClientId(env),
  };
  const signingInput = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(env.applePrivateKey ?? ''),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // Web Crypto returns the raw r||s (IEEE P1363) signature, which is exactly JWS ES256.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

/**
 * Exchange the fresh authorization code, verify that the exchanged id_token belongs to
 * `expectedSub` (the verified request token's sub == the account's Apple identity), and
 * only then revoke the refresh token. Throws StepError ('apple_code_mismatch' when the
 * code belongs to a different Apple ID or its id_token is missing/invalid).
 */
async function revokeAppleTokens(
  env: AccountDeletionEnv,
  deps: AccountDeletionDeps,
  authorizationCode: string,
  expectedSub: string,
  rawNonce: string,
): Promise<void> {
  let clientSecret: string;
  try {
    clientSecret = await createAppleClientSecret(env, deps.now());
  } catch {
    throw new StepError('apple_client_secret', 'Apple key could not be loaded.');
  }
  const clientId = appleClientId(env);
  const form = { 'Content-Type': 'application/x-www-form-urlencoded' };

  let tokenRes: Response;
  try {
    tokenRes = await timedFetch(deps, APPLE_TOKEN_URL, {
      method: 'POST',
      headers: form,
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: authorizationCode,
        grant_type: 'authorization_code',
      }).toString(),
    });
  } catch {
    throw new StepError('apple_token', 'Apple token endpoint unreachable.');
  }
  const tokenJson = await readJson(tokenRes);
  if (!tokenRes.ok) {
    const appleError = typeof tokenJson?.error === 'string' ? tokenJson.error : 'unknown';
    console.error('[account/delete] apple token exchange failed', tokenRes.status, appleError);
    throw new StepError('apple_token', 'Apple token exchange failed.');
  }
  const refreshToken = typeof tokenJson?.refresh_token === 'string' ? tokenJson.refresh_token : '';
  const accessToken = typeof tokenJson?.access_token === 'string' ? tokenJson.access_token : '';
  const token = refreshToken || accessToken;
  if (!token) throw new StepError('apple_token', 'Apple returned no token to revoke.');

  // Bind the code to the account: the id_token Apple returns for THIS code must be valid
  // and belong to the same Apple ID that was verified from the request. Fail closed.
  const exchangedIdToken = typeof tokenJson?.id_token === 'string' ? tokenJson.id_token : '';
  if (!exchangedIdToken) throw new StepError('apple_code_mismatch', 'Apple returned no id_token for the code.');
  const exchanged = await verifyAppleIdentityToken(deps, exchangedIdToken, {
    rawNonce,
    clientId,
    nonceRequired: false,
  });
  if (!exchanged.ok) {
    if (exchanged.transient) throw new StepError('apple_token', 'Could not verify the exchanged id_token.');
    throw new StepError('apple_code_mismatch', 'Exchanged id_token is invalid.');
  }
  if (exchanged.sub !== expectedSub) {
    throw new StepError('apple_code_mismatch', 'Authorization code belongs to a different Apple ID.');
  }

  let revokeRes: Response;
  try {
    revokeRes = await timedFetch(deps, APPLE_REVOKE_URL, {
      method: 'POST',
      headers: form,
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        token,
        token_type_hint: refreshToken ? 'refresh_token' : 'access_token',
      }).toString(),
    });
  } catch {
    throw new StepError('apple_revoke', 'Apple revoke endpoint unreachable.');
  }
  if (!revokeRes.ok) {
    console.error('[account/delete] apple revoke failed', revokeRes.status);
    throw new StepError('apple_revoke', 'Apple token revocation failed.');
  }
}

/* ----------------------------------------------------------------------------
 * Supabase helpers
 * --------------------------------------------------------------------------*/

type CallerLookup =
  | { kind: 'ok'; user: AuthUser }
  | { kind: 'unauthenticated' }
  | { kind: 'deleted' }
  | { kind: 'error' };

async function getCaller(env: AccountDeletionEnv, deps: AccountDeletionDeps, accessToken: string): Promise<CallerLookup> {
  let res: Response;
  try {
    res = await timedFetch(deps, `${env.supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: { apikey: env.anonKey, Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { kind: 'error' };
  }
  const json = await readJson(res);
  if (res.ok) {
    return typeof json?.id === 'string' && UUID_RE.test(json.id) ? { kind: 'ok', user: json as AuthUser } : { kind: 'unauthenticated' };
  }
  // A correctly signed JWT whose user no longer exists: the account is already deleted.
  const code = typeof json?.error_code === 'string' ? json.error_code : typeof json?.code === 'string' ? json.code : '';
  const msg = String(json?.msg ?? json?.message ?? '');
  if (code === 'user_not_found' || /does not exist/i.test(msg)) return { kind: 'deleted' };
  if (res.status >= 500) return { kind: 'error' };
  return { kind: 'unauthenticated' };
}

async function getAdminUser(
  env: AccountDeletionEnv,
  deps: AccountDeletionDeps,
  userId: string,
): Promise<AuthUser | 'not_found'> {
  const res = await timedFetch(deps, `${env.supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: 'GET',
    headers: serviceHeaders(env),
  });
  if (res.status === 404) return 'not_found';
  if (!res.ok) throw new StepError('load_user', `admin user lookup failed (${res.status})`);
  const json = await readJson(res);
  if (!json || json.id !== userId) throw new StepError('load_user', 'admin user lookup returned an unexpected user');
  return json as AuthUser;
}

function providersOf(user: AuthUser): Set<string> {
  const set = new Set<string>();
  for (const identity of user.identities ?? []) {
    if (typeof identity?.provider === 'string') set.add(identity.provider);
  }
  const meta = user.app_metadata ?? {};
  if (typeof meta.provider === 'string') set.add(meta.provider);
  if (Array.isArray(meta.providers)) {
    for (const p of meta.providers) if (typeof p === 'string') set.add(p);
  }
  return set;
}

function appleSubOf(user: AuthUser): string | null {
  const identity = (user.identities ?? []).find((item) => item?.provider === 'apple');
  if (!identity) return null;
  const sub = identity.identity_data?.sub;
  if (typeof sub === 'string' && sub) return sub;
  if (typeof identity.provider_id === 'string' && identity.provider_id) return identity.provider_id;
  return null;
}

/**
 * True when the caller's OWN session (the access token, whose signature was just verified
 * by GET /auth/v1/user) records a qualifying authentication within REAUTH_MAX_AGE_MS.
 * Uses only the token's `amr` entries: token_refresh does not count, timestamps must be
 * finite and at most 60 s in the future. last_sign_in_at is deliberately ignored (it moves
 * when the user signs in on ANOTHER device). Fails closed.
 * See https://supabase.com/docs/guides/auth/jwt-fields
 */
export function sessionRecentlyAuthenticated(accessToken: string, userId: string, nowMs: number): boolean {
  const payload = decodeJwtPayload(accessToken);
  if (!payload || payload.sub !== userId) return false;
  const amr = Array.isArray(payload.amr) ? (payload.amr as Array<Record<string, unknown>>) : [];
  for (const entry of amr) {
    const method = typeof entry?.method === 'string' ? entry.method : '';
    if (!QUALIFYING_AMR_METHODS.has(method)) continue;
    const ts = typeof entry?.timestamp === 'number' ? entry.timestamp * 1000 : NaN;
    if (!Number.isFinite(ts)) continue;
    if (ts > nowMs + CLOCK_SKEW_MS) continue;
    if (nowMs - ts > REAUTH_MAX_AGE_MS) continue;
    return true;
  }
  return false;
}

type PasswordCheck = 'ok' | 'invalid' | 'error';

async function verifyPassword(
  env: AccountDeletionEnv,
  deps: AccountDeletionDeps,
  email: string,
  password: string,
  userId: string,
): Promise<PasswordCheck> {
  let res: Response;
  try {
    res = await timedFetch(deps, `${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: env.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return 'error';
  }
  if (res.status >= 500 || res.status === 429) return 'error';
  const json = await readJson(res);
  if (!res.ok) return 'invalid';
  const user = json?.user as { id?: unknown } | undefined;
  const ok = user?.id === userId;
  // Best effort: end the extra session the password check just created.
  const newAccessToken = typeof json?.access_token === 'string' ? json.access_token : '';
  if (newAccessToken) {
    await timedFetch(deps, `${env.supabaseUrl}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: env.anonKey, Authorization: `Bearer ${newAccessToken}` },
    }).catch(() => undefined);
  }
  return ok ? 'ok' : 'invalid';
}

/** PostgREST DELETE; a missing table (404) counts as nothing to delete. */
async function restDelete(env: AccountDeletionEnv, deps: AccountDeletionDeps, step: string, pathAndQuery: string) {
  let res: Response;
  try {
    res = await timedFetch(deps, `${env.supabaseUrl}/rest/v1/${pathAndQuery}`, {
      method: 'DELETE',
      headers: serviceHeaders(env, { Prefer: 'return=minimal' }),
    });
  } catch {
    throw new StepError(step, 'network error');
  }
  if (res.ok || res.status === 404) return;
  throw new StepError(step, `delete failed (${res.status})`);
}

async function restSelect(
  env: AccountDeletionEnv,
  deps: AccountDeletionDeps,
  step: string,
  pathAndQuery: string,
): Promise<Array<Record<string, unknown>>> {
  let res: Response;
  try {
    res = await timedFetch(deps, `${env.supabaseUrl}/rest/v1/${pathAndQuery}`, {
      method: 'GET',
      headers: serviceHeaders(env),
    });
  } catch {
    throw new StepError(step, 'network error');
  }
  if (res.status === 404) return [];
  if (!res.ok) throw new StepError(step, `select failed (${res.status})`);
  const json = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(json) ? (json as Array<Record<string, unknown>>) : [];
}

/**
 * DELETE the auth user, up to AUTH_DELETE_ATTEMPTS times. Returns true when it is gone
 * (deleted now or already, 404). Never touches public.users on failure.
 */
async function deleteAuthUser(env: AccountDeletionEnv, deps: AccountDeletionDeps, userId: string): Promise<boolean> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; attempt <= AUTH_DELETE_ATTEMPTS; attempt += 1) {
    try {
      const res = await timedFetch(deps, `${env.supabaseUrl}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: serviceHeaders(env, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ should_soft_delete: false }),
      });
      if (res.ok || res.status === 404) return true;
      console.error('[account/delete] auth delete attempt failed', attempt, res.status);
    } catch {
      console.error('[account/delete] auth delete attempt failed', attempt, 'network/timeout');
    }
    if (attempt < AUTH_DELETE_ATTEMPTS) await sleep(AUTH_DELETE_RETRY_DELAY_MS * attempt);
  }
  return false;
}

/* ----------------------------------------------------------------------------
 * Handler
 * --------------------------------------------------------------------------*/

function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const [scheme, token] = header.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' && value.length <= max ? value : '';
}

export async function handleAccountDeletion(
  input: AccountDeletionInput,
  env: AccountDeletionEnv,
  deps: AccountDeletionDeps,
): Promise<AccountDeletionResult> {
  if (!env.supabaseUrl || !env.anonKey || env.serviceKey.split('.').length !== 3) {
    return fail(503, 'not_configured', 'Account deletion is not configured on the server.');
  }

  // ---- Gate 1: authenticated caller ----
  const accessToken = bearerFrom(input.authorization);
  if (!accessToken) return fail(401, 'not_authenticated', 'Please sign in again.');
  const caller = await getCaller(env, deps, accessToken);
  if (caller.kind === 'deleted') {
    return { status: 200, body: { ok: true, alreadyDeleted: true, appleRevoked: false } };
  }
  if (caller.kind === 'error') {
    return fail(503, 'auth_unavailable', 'Could not verify your session. Please try again.', { retryable: true });
  }
  if (caller.kind === 'unauthenticated') return fail(401, 'not_authenticated', 'Please sign in again.');
  const userId = caller.user.id as string;

  // ---- Gate 2: explicit confirmation ----
  const body = input.body && typeof input.body === 'object' && !Array.isArray(input.body)
    ? (input.body as Record<string, unknown>)
    : null;
  if (!body) return fail(400, 'invalid_body', 'Invalid request.');
  if (body.confirm !== 'DELETE') {
    return fail(400, 'confirmation_required', 'Type DELETE to confirm account deletion.');
  }

  // Authoritative identities come from the admin API.
  let authUser: AuthUser;
  try {
    const found = await getAdminUser(env, deps, userId);
    if (found === 'not_found') {
      return { status: 200, body: { ok: true, alreadyDeleted: true, appleRevoked: false } };
    }
    authUser = found;
  } catch (err) {
    const step = err instanceof StepError ? err.step : 'load_user';
    console.error('[account/delete] step failed', step);
    return fail(500, 'deletion_failed', 'Could not load your account. Please try again.', { retryable: true, step });
  }

  const providers = providersOf(authUser);
  const isApple = providers.has('apple');

  // ---- Gate 3: recent re-authentication ----
  let appleAuthorizationCode = '';
  let verifiedAppleSub = '';
  let appleRawNonce = '';
  if (isApple) {
    if (!appleConfigured(env)) {
      return fail(
        503,
        'apple_revocation_unavailable',
        'Deleting a Sign in with Apple account is temporarily unavailable. Please try again later or contact support@bingeitbro.com.',
      );
    }
    const identityToken = str(body.appleIdentityToken, 8192);
    appleAuthorizationCode = str(body.appleAuthorizationCode, 2048);
    const rawNonce = str(body.appleNonce, 256);
    if (!identityToken || !appleAuthorizationCode || !rawNonce) {
      return fail(
        400,
        'apple_reauth_required',
        'Confirm with Sign in with Apple in the Binge It Bro iOS app to delete this account.',
      );
    }
    const check = await verifyAppleIdentityToken(deps, identityToken, {
      rawNonce,
      clientId: appleClientId(env),
      nonceRequired: true,
    });
    if (!check.ok) {
      if (check.transient) {
        return fail(503, 'apple_unavailable', 'Could not reach Apple. Please try again.', { retryable: true });
      }
      return fail(401, 'apple_token_invalid', 'Apple confirmation was not valid. Please try again.', { retryable: true });
    }
    const expectedSub = appleSubOf(authUser);
    if (!expectedSub || check.sub !== expectedSub) {
      return fail(
        403,
        'apple_account_mismatch',
        'That Apple ID is not the one linked to this account. Confirm with the Apple ID you use for Binge It Bro.',
      );
    }
    verifiedAppleSub = check.sub;
    appleRawNonce = rawNonce;
  } else if (providers.has('email')) {
    const password = str(body.password, 1024);
    if (!password) return fail(401, 'password_required', 'Enter your password to confirm.');
    const email = typeof authUser.email === 'string' ? authUser.email : '';
    if (!email) return fail(401, 'reauth_required', 'Please sign out, sign in again and retry.');
    const result = await verifyPassword(env, deps, email, password, userId);
    if (result === 'error') {
      return fail(503, 'auth_unavailable', 'Could not verify your password. Please try again.', { retryable: true });
    }
    if (result === 'invalid') return fail(401, 'invalid_password', 'Incorrect password.');
  } else {
    if (!sessionRecentlyAuthenticated(accessToken, userId, deps.now())) {
      return fail(
        403,
        'reauth_required',
        'For your security, sign in again, then delete your account within 10 minutes.',
      );
    }
  }

  // ---- Gate 4: Apple token revocation (before anything is deleted) ----
  let appleRevoked = false;
  if (isApple) {
    try {
      await revokeAppleTokens(env, deps, appleAuthorizationCode, verifiedAppleSub, appleRawNonce);
      appleRevoked = true;
    } catch (err) {
      const step = err instanceof StepError ? err.step : 'apple_revoke';
      console.error('[account/delete] step failed', step);
      if (step === 'apple_code_mismatch') {
        return fail(
          403,
          'apple_account_mismatch',
          'The Apple confirmation did not match this account. Nothing was deleted. Please try again.',
          { step },
        );
      }
      return fail(
        502,
        'apple_revocation_failed',
        'Could not revoke Sign in with Apple. Nothing was deleted. Please try again.',
        { retryable: true, step },
      );
    }
  }

  // ---- Destructive steps (idempotent, in order) ----
  try {
    // D1. Device push tokens (also cascades; deleted first so pushes stop immediately).
    await restDelete(env, deps, 'native_push_tokens', `native_push_tokens?user_id=eq.${userId}`);

    // D2. chat_themes has no FK: DM themes containing the user, and themes of owned groups.
    const groups = await restSelect(env, deps, 'chat_themes', `watch_groups?select=id&owner_id=eq.${userId}`);
    const groupChatIds = groups
      .map((row) => (typeof row.id === 'string' && UUID_RE.test(row.id) ? `"group:${row.id}"` : ''))
      .filter(Boolean);
    if (groupChatIds.length > 0) {
      await restDelete(env, deps, 'chat_themes', `chat_themes?chat_id=in.(${encodeURIComponent(groupChatIds.join(','))})`);
    }
    await restDelete(env, deps, 'chat_themes', `chat_themes?chat_id=like.${encodeURIComponent(`direct:*${userId}*`)}`);

    // D3. Auth user: cascades public.users and every user-owned table in one transaction.
    // No public.users fallback (see header): on failure the user retries.
    const gone = await deleteAuthUser(env, deps, userId);
    if (!gone) throw new StepError('auth_user', 'auth user delete failed');
  } catch (err) {
    const step = err instanceof StepError ? err.step : 'unknown';
    console.error('[account/delete] step failed', step);
    return fail(500, 'deletion_failed', 'Account deletion did not finish. Please try again.', {
      retryable: true,
      step,
      appleRevoked,
    });
  }

  return { status: 200, body: { ok: true, appleRevoked } };
}
