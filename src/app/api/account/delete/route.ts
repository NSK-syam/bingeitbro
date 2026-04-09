import { NextResponse } from 'next/server';
import { createPrivateKey, sign as signJwt } from 'node:crypto';
import { createClient, type User } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim();
const serviceRoleKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE ??
  ''
).trim();

type AppleRevocationClientConfig = {
  clientId: string;
  clientSecret: string;
};

type AppleRevocationMaterial = {
  source: 'access_token' | 'refresh_token';
  token: string;
};

function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

function trimString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function getAuthedUser(token: string): Promise<{ id: string } | null> {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as { id?: string } | null;
  if (!payload?.id) return null;
  return { id: payload.id };
}

function getAppleRevocationClientConfig(): AppleRevocationClientConfig | null {
  const clientId = trimString(
    process.env.APPLE_CLIENT_ID ?? process.env.SIGN_IN_WITH_APPLE_CLIENT_ID,
    255,
  );
  if (!clientId) return null;

  const directClientSecret = trimString(
    process.env.APPLE_CLIENT_SECRET ?? process.env.SIGN_IN_WITH_APPLE_CLIENT_SECRET,
    4096,
  );
  if (directClientSecret) {
    return { clientId, clientSecret: directClientSecret };
  }

  const teamId = trimString(
    process.env.APPLE_TEAM_ID ?? process.env.SIGN_IN_WITH_APPLE_TEAM_ID,
    255,
  );
  const keyId = trimString(
    process.env.APPLE_KEY_ID ?? process.env.SIGN_IN_WITH_APPLE_KEY_ID,
    255,
  );
  const privateKey = trimString(
    process.env.APPLE_PRIVATE_KEY ?? process.env.SIGN_IN_WITH_APPLE_PRIVATE_KEY,
    8192,
  ).replace(/\\n/g, '\n');

  if (!teamId || !keyId || !privateKey) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: teamId,
      iat: now,
      exp: now + 300,
      aud: 'https://appleid.apple.com',
      sub: clientId,
    }),
  ).toString('base64url');
  const unsignedToken = `${header}.${payload}`;
  const signature = signJwt('sha256', Buffer.from(unsignedToken), {
    key: createPrivateKey(privateKey),
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');

  return {
    clientId,
    clientSecret: `${unsignedToken}.${signature}`,
  };
}

function userHasAppleIdentity(user: User): boolean {
  const providerValues = new Set<string>();

  if (typeof user.app_metadata?.provider === 'string') {
    providerValues.add(user.app_metadata.provider.toLowerCase());
  }

  if (Array.isArray(user.app_metadata?.providers)) {
    for (const provider of user.app_metadata.providers) {
      if (typeof provider === 'string') {
        providerValues.add(provider.toLowerCase());
      }
    }
  }

  if (Array.isArray(user.identities)) {
    for (const identity of user.identities) {
      if (typeof identity?.provider === 'string') {
        providerValues.add(identity.provider.toLowerCase());
      }
    }
  }

  return providerValues.has('apple');
}

function getStoredAppleDeletionPrerequisite(user: User): Record<string, unknown> | null {
  const prerequisites = user.app_metadata?.account_deletion_prerequisites;
  if (!isRecord(prerequisites)) return null;
  const apple = prerequisites.apple;
  return isRecord(apple) ? apple : null;
}

async function exchangeAppleAuthorizationCode(
  authorizationCode: string,
  config: AppleRevocationClientConfig,
): Promise<AppleRevocationMaterial | null> {
  const response = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: authorizationCode,
      grant_type: 'authorization_code',
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    error?: unknown;
    error_description?: unknown;
    refresh_token?: unknown;
  } | null;

  if (!response.ok) {
    const error = trimString(payload?.error, 120);
    const description = trimString(payload?.error_description, 240);
    throw new Error(
      description || error || `Apple token exchange failed with status ${response.status}.`,
    );
  }

  const refreshToken = trimString(payload?.refresh_token, 4096);
  if (refreshToken) {
    return { token: refreshToken, source: 'refresh_token' };
  }

  const accessToken = trimString(payload?.access_token, 4096);
  if (accessToken) {
    return { token: accessToken, source: 'access_token' };
  }

  return null;
}

async function getAppleRevocationMaterial(
  prerequisite: Record<string, unknown>,
  config: AppleRevocationClientConfig,
): Promise<AppleRevocationMaterial | null> {
  const refreshToken = trimString(prerequisite.refreshToken, 4096);
  if (refreshToken) {
    return { token: refreshToken, source: 'refresh_token' };
  }

  const accessToken = trimString(prerequisite.accessToken, 4096);
  if (accessToken) {
    return { token: accessToken, source: 'access_token' };
  }

  const authorizationCode = trimString(prerequisite.authorizationCode, 4096);
  if (!authorizationCode) return null;

  return exchangeAppleAuthorizationCode(authorizationCode, config);
}

async function attemptAppleAuthorizationRevocation(user: User): Promise<void> {
  if (!userHasAppleIdentity(user)) return;

  const prerequisite = getStoredAppleDeletionPrerequisite(user);
  if (!prerequisite) {
    return;
  }

  const config = getAppleRevocationClientConfig();
  if (!config) {
    console.info(
      '[account-delete] skipping Apple revocation because Apple client credentials are not configured.',
    );
    return;
  }

  // The shipped provider-credentials capture path currently stores only capability flags and a limitation string
  // under app_metadata.account_deletion_prerequisites.apple. It does not persist the raw authorization code,
  // refresh token, or access token Apple requires for revocation, so most current users will reach this skip path
  // even though deletion itself remains fully functional.
  const revocationMaterial = await getAppleRevocationMaterial(prerequisite, config);
  if (!revocationMaterial) {
    const limitation = trimString(prerequisite.limitation, 240);
    console.info(
      '[account-delete] skipping Apple revocation because stored prerequisite data does not include revocation token material.',
      limitation ? { limitation } : undefined,
    );
    return;
  }

  const response = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      token: revocationMaterial.token,
      token_type_hint: revocationMaterial.source,
    }),
  });

  if (!response.ok) {
    const body = (await response.text().catch(() => '')).trim();
    throw new Error(body || `Apple revocation failed with status ${response.status}.`);
  }
}

export async function POST(request: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { message: 'Account deletion is unavailable right now. Please contact support.' },
        { status: 503 },
      );
    }

    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const authedUser = await getAuthedUser(token);
    if (!authedUser?.id) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userLookup, error: userLookupError } = await admin.auth.admin.getUserById(authedUser.id);
    if (userLookupError || !userLookup.user) {
      return NextResponse.json(
        { message: userLookupError?.message || 'Failed to load account before deletion.' },
        { status: 500 },
      );
    }

    try {
      await admin.auth.admin.signOut(token, 'global');
    } catch (error) {
      console.warn('[account-delete] failed to revoke active sessions before deletion', error);
    }

    try {
      await attemptAppleAuthorizationRevocation(userLookup.user);
    } catch (error) {
      console.warn('[account-delete] Apple authorization revocation failed; continuing with deletion', error);
    }

    const { error } = await admin.auth.admin.deleteUser(authedUser.id);
    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to delete account.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete account.';
    return NextResponse.json({ message }, { status: 500 });
  }
}
