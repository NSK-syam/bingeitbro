import { NextResponse } from 'next/server.js';

export const runtime = 'nodejs';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim();

type RestError = {
  code?: string;
  message?: string;
  error?: string;
  details?: string;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AuthResult =
  | {
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      message: string;
      status: number;
    };

function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

function parseRestError(text: string, fallback: string): string {
  if (!text) return fallback;

  try {
    const parsed = JSON.parse(text) as RestError;
    return parsed.message || parsed.error || parsed.details || fallback;
  } catch {
    return text || fallback;
  }
}

function isConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function authenticateRequest(token: string): Promise<AuthResult> {
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: 'Not authenticated.', status: 401 };
    }

    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        message: parseRestError(text, 'Authentication service is unavailable.'),
        status: 503,
      };
    }

    const payload = (text ? (JSON.parse(text) as { id?: string }) : null) ?? null;
    if (typeof payload?.id !== 'string' || !payload.id.trim()) {
      return { ok: false, message: 'Authentication service is unavailable.', status: 503 };
    }

    return { ok: true, userId: payload.id.trim() };
  } catch {
    return { ok: false, message: 'Authentication service is unavailable.', status: 503 };
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
    }

    const { id } = await context.params;
    const itemId = id.trim();
    if (!itemId || !isUuid(itemId)) {
      return NextResponse.json({ message: 'id must be a valid UUID.' }, { status: 400 });
    }

    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const auth = await authenticateRequest(token);
    if (!auth.ok) {
      return NextResponse.json({ message: auth.message }, { status: auth.status });
    }

    const params = new URLSearchParams({
      id: `eq.${itemId}`,
      user_id: `eq.${auth.userId}`,
      select: 'id',
    });

    const response = await fetch(`${supabaseUrl}/rest/v1/watchlist_items?${params.toString()}`, {
      method: 'DELETE',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        Prefer: 'return=representation',
      },
    });

    const text = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { message: parseRestError(text, 'Failed to delete watchlist item.') },
        { status: 500 },
      );
    }

    const rows = (text ? (JSON.parse(text) as Array<{ id?: string }>) : []) ?? [];
    void rows;
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete watchlist item.';
    return NextResponse.json({ message }, { status: 500 });
  }
}
