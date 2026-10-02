import { NextResponse } from 'next/server';
import { fetchWithTimeoutRetry } from '@/lib/fetch-with-retry';

/**
 * Register (POST) / unregister (DELETE) a native app FCM token.
 *
 * Auth: Bearer Supabase access token, verified against /auth/v1/user (same as
 * the other API routes). The user id always comes from the verified token,
 * never from the body. Writes use the service role so a token that moves to a
 * different account on the same device is reassigned to the current user, and
 * token rows are never readable from the client.
 *
 * Table: native_push_tokens (see supabase-native-push-schema.sql).
 */
export const runtime = 'nodejs';

const SUPABASE_FETCH_OPTIONS = { timeoutMs: 8000, retries: 1, retryDelayMs: 300 } as const;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_TOKENS_PER_USER = 10;
const FCM_TOKEN_RE = /^[A-Za-z0-9_:.-]{20,4096}$/;
const PLATFORMS = new Set(['ios', 'android']);

type Config = { url: string; anonKey: string; serviceKey: string };

function getConfig(): Config | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !anonKey || serviceKey.split('.').length !== 3) return null;
  return { url, anonKey, serviceKey };
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

async function getUserId(config: Config, accessToken: string | null): Promise<string | null> {
  if (!accessToken) return null;
  try {
    const res = await fetchWithTimeoutRetry(
      `${config.url}/auth/v1/user`,
      { method: 'GET', headers: { Authorization: `Bearer ${accessToken}`, apikey: config.anonKey } },
      SUPABASE_FETCH_OPTIONS,
    );
    if (!res.ok) return null;
    const user = (await res.json().catch(() => null)) as { id?: unknown } | null;
    return typeof user?.id === 'string' && user.id ? user.id : null;
  } catch {
    return null;
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get('content-length') || '0');
  if (declared > MAX_BODY_BYTES) return null;
  const text = await request.text().catch(() => '');
  if (!text || text.length > MAX_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function adminHeaders(config: Config, extra: Record<string, string> = {}) {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.serviceKey}`,
    ...extra,
  };
}

/** eq.<value> filter value; tokens are already restricted to [A-Za-z0-9_:.-]. */
function quoteToken(token: string): string {
  return encodeURIComponent(token);
}

async function pruneOldTokens(config: Config, userId: string): Promise<void> {
  // Keep only the most recently refreshed tokens per user.
  const res = await fetchWithTimeoutRetry(
    `${config.url}/rest/v1/native_push_tokens?select=token&user_id=eq.${userId}` +
      `&order=updated_at.desc&offset=${MAX_TOKENS_PER_USER}&limit=50`,
    { method: 'GET', headers: adminHeaders(config) },
    SUPABASE_FETCH_OPTIONS,
  );
  if (!res.ok) return;
  const rows = (await res.json().catch(() => [])) as Array<{ token?: string }>;
  const stale = (Array.isArray(rows) ? rows : [])
    .map((row) => row?.token ?? '')
    .filter((token) => FCM_TOKEN_RE.test(token));
  if (stale.length === 0) return;
  const list = encodeURIComponent(stale.map((token) => `"${token}"`).join(','));
  await fetchWithTimeoutRetry(
    `${config.url}/rest/v1/native_push_tokens?user_id=eq.${userId}&token=in.(${list})`,
    { method: 'DELETE', headers: adminHeaders(config, { Prefer: 'return=minimal' }) },
    SUPABASE_FETCH_OPTIONS,
  );
}

export async function POST(request: Request) {
  try {
    const config = getConfig();
    if (!config) {
      return NextResponse.json({ message: 'Push registration is not configured.' }, { status: 503 });
    }
    const userId = await getUserId(config, getBearerToken(request));
    if (!userId) {
      return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
    }

    const body = await readJsonBody(request);
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const platform = typeof body?.platform === 'string' ? body.platform.trim().toLowerCase() : '';
    if (!FCM_TOKEN_RE.test(token) || !PLATFORMS.has(platform)) {
      return NextResponse.json({ message: 'Invalid token or platform' }, { status: 400 });
    }

    const now = new Date().toISOString();
    // Upsert on the unique token: a token that belonged to another account on
    // this device is reassigned to the signed-in user.
    const upsertRes = await fetchWithTimeoutRetry(
      `${config.url}/rest/v1/native_push_tokens?on_conflict=token`,
      {
        method: 'POST',
        headers: adminHeaders(config, {
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        }),
        body: JSON.stringify({ user_id: userId, token, platform, updated_at: now }),
      },
      SUPABASE_FETCH_OPTIONS,
    );
    if (!upsertRes.ok) {
      // Log only the PostgREST error code: the body can echo the token.
      const errBody = (await upsertRes.json().catch(() => null)) as { code?: unknown } | null;
      const code = typeof errBody?.code === 'string' ? errBody.code.slice(0, 16) : '';
      console.error('[native-push/register] upsert failed', upsertRes.status, code);
      return NextResponse.json({ message: 'Could not register device.' }, { status: 500 });
    }

    await pruneOldTokens(config, userId).catch(() => undefined);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[native-push/register] unexpected error', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ message: 'Something went wrong.' }, { status: 500 });
  }
}

/**
 * Unlink a token (sign-out). With a valid session the row is deleted only if
 * it belongs to the caller. After sign-out the session may already be revoked,
 * so possession of the FCM token itself (an unguessable device secret) is
 * accepted to delete that single row; this can only ever stop pushes to that
 * device, never read or redirect them.
 */
export async function DELETE(request: Request) {
  try {
    const config = getConfig();
    if (!config) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    const body = await readJsonBody(request);
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!FCM_TOKEN_RE.test(token)) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 400 });
    }

    const userId = await getUserId(config, getBearerToken(request));
    const filter = userId ? `token=eq.${quoteToken(token)}&user_id=eq.${userId}` : `token=eq.${quoteToken(token)}`;
    const res = await fetchWithTimeoutRetry(
      `${config.url}/rest/v1/native_push_tokens?${filter}`,
      { method: 'DELETE', headers: adminHeaders(config, { Prefer: 'return=minimal' }) },
      SUPABASE_FETCH_OPTIONS,
    );
    if (!res.ok) {
      console.error('[native-push/register] delete failed', res.status);
      return NextResponse.json({ message: 'Could not unregister device.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[native-push/register] unexpected error', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ message: 'Something went wrong.' }, { status: 500 });
  }
}
