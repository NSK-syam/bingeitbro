import { NextResponse } from 'next/server.js';

export const runtime = 'nodejs';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim();

type MediaType = 'movie' | 'tv';

type RestError = {
  code?: string;
  message?: string;
  error?: string;
  details?: string;
};

type WatchlistRow = {
  id: string;
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  added_at: string;
};

type WatchlistCreateBody = {
  tmdbId?: number | string;
  mediaType?: string;
  title?: string;
  posterPath?: string | null;
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

function toClientItem(row: WatchlistRow) {
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    mediaType: row.media_type,
    title: row.title,
    posterPath: row.poster_path,
    addedAt: row.added_at,
  };
}

function parseTmdbId(value: number | string | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    return parsed > 0 ? parsed : null;
  }

  return null;
}

function parseMediaType(value: string | undefined): MediaType | null {
  return value === 'movie' || value === 'tv' ? value : null;
}

function validatePosterPath(value: string | null | undefined): string | null | 'invalid' {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'invalid';

  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, 500);
}

function isConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export async function GET(request: Request) {
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

    const params = new URLSearchParams({
      select: 'id,tmdb_id,media_type,title,poster_path,added_at',
      order: 'added_at.desc',
      limit: '100',
    });

    const response = await fetch(`${supabaseUrl}/rest/v1/watchlist_items?${params.toString()}`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    });

    const text = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { message: parseRestError(text, 'Failed to load watchlist.') },
        { status: 500 },
      );
    }

    const rows = (text ? (JSON.parse(text) as WatchlistRow[]) : []) ?? [];
    const items = Array.isArray(rows) ? rows.map(toClientItem) : [];
    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load watchlist.';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
    }

    const body = (await request.json().catch(() => null)) as WatchlistCreateBody | null;
    const tmdbId = parseTmdbId(body?.tmdbId);
    const mediaType = parseMediaType(body?.mediaType);
    const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : '';
    const posterPath = validatePosterPath(body?.posterPath);

    if (!tmdbId || !mediaType || !title) {
      return NextResponse.json(
        { message: 'tmdbId, mediaType, and title are required.' },
        { status: 400 },
      );
    }

    if (posterPath === 'invalid') {
      return NextResponse.json({ message: 'posterPath must be a string or null.' }, { status: 400 });
    }

    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const userId = await getAuthedUserId(token);
    if (!userId) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const payload = {
      user_id: userId,
      tmdb_id: tmdbId,
      media_type: mediaType,
      title,
      poster_path: posterPath,
    };

    const params = new URLSearchParams({ on_conflict: 'user_id,tmdb_id,media_type' });
    const response = await fetch(`${supabaseUrl}/rest/v1/watchlist_items?${params.toString()}`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { message: parseRestError(text, 'Failed to save watchlist item.') },
        { status: 500 },
      );
    }

    const rows = (text ? (JSON.parse(text) as WatchlistRow[]) : []) ?? [];
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!row) {
      return NextResponse.json(
        { message: 'Watchlist item saved but response was empty.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ item: toClientItem(row) }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save watchlist item.';
    return NextResponse.json({ message }, { status: 500 });
  }
}
