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

function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

async function getAuthedUserId(token: string): Promise<string | null> {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as { id?: string } | null;
  return typeof payload?.id === 'string' ? payload.id : null;
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

export async function DELETE(request: Request, context: RouteContext) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
    }

    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const userId = await getAuthedUserId(token);
    if (!userId) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const { id } = await context.params;
    const itemId = id.trim();
    if (!itemId) {
      return NextResponse.json({ message: 'id is required.' }, { status: 400 });
    }

    const params = new URLSearchParams({
      id: `eq.${itemId}`,
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
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ message: 'Watchlist item not found.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete watchlist item.';
    return NextResponse.json({ message }, { status: 500 });
  }
}
