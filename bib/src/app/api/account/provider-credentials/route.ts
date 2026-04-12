import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthedRequestUser } from '@/lib/server/request-auth';

export const runtime = 'nodejs';

type ProviderCredentialBody = {
  authorizationCode?: unknown;
  email?: unknown;
  identityToken?: unknown;
  provider?: unknown;
  user?: unknown;
};

function trimString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
const serviceRoleKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE ??
  ''
).trim();

function buildStoredAppleCredential(input: {
  authorizationCode: string;
  email: string;
  identityToken: string;
  providerUser: string;
}) {
  const capturedAt = new Date().toISOString();
  const hasAuthorizationCode = Boolean(input.authorizationCode);
  const hasIdentityToken = Boolean(input.identityToken);
  const providerUserPresent = Boolean(input.providerUser);

  return {
    capturedAt,
    hasAuthorizationCode,
    hasIdentityToken,
    providerUserPresent,
    canAttemptRevocationNow: hasAuthorizationCode,
    limitation:
      hasAuthorizationCode
        ? 'Apple authorization codes from Expo native auth are short-lived, and this task does not add server-only storage for revocation material. Deletion flows must treat revocation as best-effort and may require a fresh Apple sign-in.'
        : 'Expo native Apple auth did not provide a fresh authorization code for this session, and this task does not retain durable revocation material. Later deletion flows should assume revocation may require a new Apple sign-in.',
  };
}

export async function POST(request: Request) {
  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { message: 'Provider credential storage is unavailable right now.' },
        { status: 503 },
      );
    }

    const authedUser = await getAuthedRequestUser(request);
    if (!authedUser?.id) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as ProviderCredentialBody | null;
    const provider = trimString(body?.provider, 32).toLowerCase();
    const authorizationCode = trimString(body?.authorizationCode, 4096);
    const identityToken = trimString(body?.identityToken, 8192);
    const email = trimString(body?.email, 320);
    const providerUser = trimString(body?.user, 255);

    if (provider !== 'apple') {
      return NextResponse.json({ message: 'Only Apple provider capture is supported.' }, { status: 400 });
    }

    if (!authorizationCode && !identityToken && !providerUser) {
      return NextResponse.json(
        { message: 'At least one provider credential field is required.' },
        { status: 400 },
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: existingUser, error: lookupError } = await admin.auth.admin.getUserById(authedUser.id);
    if (lookupError || !existingUser.user) {
      return NextResponse.json(
        { message: lookupError?.message || 'Unable to load account metadata.' },
        { status: 500 },
      );
    }

    const existingAppMetadata =
      existingUser.user.app_metadata && typeof existingUser.user.app_metadata === 'object'
        ? existingUser.user.app_metadata
        : {};
    const existingPrerequisites =
      existingAppMetadata.account_deletion_prerequisites &&
      typeof existingAppMetadata.account_deletion_prerequisites === 'object'
        ? existingAppMetadata.account_deletion_prerequisites
        : {};

    const storedAppleCredential = buildStoredAppleCredential({
      authorizationCode,
      email,
      identityToken,
      providerUser,
    });

    const { error: updateError } = await admin.auth.admin.updateUserById(authedUser.id, {
      app_metadata: {
        ...existingAppMetadata,
        account_deletion_prerequisites: {
          ...existingPrerequisites,
          apple: storedAppleCredential,
        },
      },
    });

    if (updateError) {
      return NextResponse.json(
        { message: updateError.message || 'Failed to persist provider credentials.' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        provider,
        storedAt: storedAppleCredential.capturedAt,
        prerequisite: {
          accountDeletionPath: 'app_metadata.account_deletion_prerequisites.apple',
          canAttemptRevocationNow: storedAppleCredential.canAttemptRevocationNow,
          hasAuthorizationCode: storedAppleCredential.hasAuthorizationCode,
          hasIdentityToken: storedAppleCredential.hasIdentityToken,
          providerUserPresent: storedAppleCredential.providerUserPresent,
          limitation: storedAppleCredential.limitation,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to capture provider credentials.';
    return NextResponse.json({ message }, { status: 500 });
  }
}
