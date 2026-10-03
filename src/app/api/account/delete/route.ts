import { NextResponse } from 'next/server';
import { handleAccountDeletion } from '@/lib/server/account-deletion';

/**
 * POST /api/account/delete: in-app account deletion (App Store Guideline 5.1.1(v)).
 *
 * All logic (re-authentication, Sign in with Apple token revocation, deletion order,
 * table -> strategy list) lives in src/lib/server/account-deletion.ts so it can be
 * tested with a mocked fetch (scripts/test-account-deletion.mjs).
 *
 * Rate limited in src/middleware.ts (key "account-delete").
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 32 * 1024;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  try {
    const declared = Number(request.headers.get('content-length') || '0');
    if (declared > MAX_BODY_BYTES) {
      return json({ ok: false, code: 'invalid_body', message: 'Request too large.', retryable: false }, 413);
    }
    const text = await request.text().catch(() => '');
    if (text.length > MAX_BODY_BYTES) {
      return json({ ok: false, code: 'invalid_body', message: 'Request too large.', retryable: false }, 413);
    }
    let body: unknown = null;
    try {
      body = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      body = null;
    }

    const result = await handleAccountDeletion(
      { authorization: request.headers.get('authorization'), body },
      {
        supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, ''),
        anonKey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(),
        serviceKey: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? '').trim(),
        appleTeamId: process.env.APPLE_TEAM_ID,
        appleKeyId: process.env.APPLE_KEY_ID,
        applePrivateKey: process.env.APPLE_PRIVATE_KEY,
        appleClientId: process.env.APPLE_CLIENT_ID,
      },
      { fetch: (input, init) => fetch(input, init), now: () => Date.now() },
    );
    return json(result.body, result.status);
  } catch (err) {
    console.error('[account/delete] unexpected error', err instanceof Error ? err.name : 'unknown');
    return json(
      { ok: false, code: 'deletion_failed', message: 'Something went wrong. Please try again.', retryable: true },
      500,
    );
  }
}
