import { fetchWithTimeoutRetry } from '@/lib/fetch-with-retry';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const SUPABASE_FETCH_OPTIONS = { timeoutMs: 9000, retries: 1, retryDelayMs: 300 } as const;

export type AuthedRequestUser = {
  id: string;
  email: string | null;
  name: string | null;
  userMetadata: Record<string, unknown> | null;
};

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

export async function getAuthedRequestUser(request: Request): Promise<AuthedRequestUser | null> {
  const token = getBearerToken(request);
  if (!token || !supabaseUrl || !supabaseAnonKey) return null;

  const authRes = await fetchWithTimeoutRetry(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  }, SUPABASE_FETCH_OPTIONS);

  if (!authRes.ok) return null;

  const user = (await authRes.json().catch(() => null)) as {
    id?: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  } | null;

  if (!user?.id) return null;

  const userMetadata = user.user_metadata ?? null;
  const metadataName = typeof userMetadata?.name === 'string'
    ? userMetadata.name
    : typeof userMetadata?.full_name === 'string'
      ? userMetadata.full_name
      : null;

  return {
    id: user.id,
    email: typeof user.email === 'string' ? user.email : null,
    name: metadataName,
    userMetadata,
  };
}
