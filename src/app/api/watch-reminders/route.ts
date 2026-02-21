import { NextResponse } from 'next/server';
import { fetchWithTimeoutRetry } from '@/lib/fetch-with-retry';

export const runtime = 'nodejs';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const SUPABASE_FETCH_OPTIONS = { timeoutMs: 9000, retries: 1, retryDelayMs: 300 } as const;

type RestError = {
  code?: string;
  message?: string;
  error?: string;
};

type ReminderRow = {
  id: string;
  movie_id: string;
  movie_title: string;
  movie_poster: string | null;
  movie_year: number | null;
  remind_at: string;
  created_at: string;
  updated_at: string;
  notified_at: string | null;
  canceled_at: string | null;
};

type ReminderResponse = {
  id: string;
  movieId: string;
  movieTitle: string;
  moviePoster: string | null;
  movieYear: number | null;
  remindAt: string;
  createdAt: string;
  updatedAt: string;
  notifiedAt: string | null;
  canceledAt: string | null;
};

function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

async function getAuthedUserId(token: string): Promise<string | null> {
  const authRes = await fetchWithTimeoutRetry(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  }, SUPABASE_FETCH_OPTIONS);
  if (!authRes.ok) return null;
  const user = (await authRes.json().catch(() => null)) as { id?: string } | null;
  return typeof user?.id === 'string' ? user.id : null;
}

function parseRestError(text: string, fallback: string): string {
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as RestError;
    return parsed.message || parsed.error || fallback;
  } catch {
    return text || fallback;
  }
}

function toClientReminder(row: ReminderRow): ReminderResponse {
  return {
    id: row.id,
    movieId: row.movie_id,
    movieTitle: row.movie_title,
    moviePoster: row.movie_poster,
    movieYear: row.movie_year,
    remindAt: row.remind_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notifiedAt: row.notified_at,
    canceledAt: row.canceled_at,
  };
}

export async function GET(request: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
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

    const { searchParams } = new URL(request.url);
    const movieId = (searchParams.get('movieId') ?? '').trim();

    const params = new URLSearchParams({
      select: 'id,movie_id,movie_title,movie_poster,movie_year,remind_at,created_at,updated_at,notified_at,canceled_at',
      user_id: `eq.${userId}`,
      canceled_at: 'is.null',
      order: 'remind_at.asc',
      limit: '50',
    });
    if (movieId) {
      params.set('movie_id', `eq.${movieId}`);
      params.set('limit', '1');
    }

    const response = await fetchWithTimeoutRetry(`${supabaseUrl}/rest/v1/watch_reminders?${params.toString()}`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    }, SUPABASE_FETCH_OPTIONS);

    const text = await response.text();
    if (!response.ok) {
      const message = parseRestError(text, 'Failed to load reminders.');
      return NextResponse.json({ message }, { status: 500 });
    }

    const rows = (text ? (JSON.parse(text) as ReminderRow[]) : []) ?? [];
    const reminders = Array.isArray(rows) ? rows.map(toClientReminder) : [];
    return NextResponse.json({ reminders }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load reminders.';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
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

    const body = (await request.json().catch(() => null)) as {
      movieId?: string;
      movieTitle?: string;
      moviePoster?: string | null;
      movieYear?: number | null;
      remindAt?: string;
    } | null;

    const movieId = (body?.movieId ?? '').trim();
    const movieTitle = (body?.movieTitle ?? '').trim();
    const moviePoster = body?.moviePoster ? String(body.moviePoster).trim().slice(0, 500) : null;
    const movieYear = typeof body?.movieYear === 'number' ? body.movieYear : null;
    const remindAtRaw = (body?.remindAt ?? '').trim();
    const remindAtDate = remindAtRaw ? new Date(remindAtRaw) : null;
    const remindAtIso = remindAtDate && !Number.isNaN(remindAtDate.getTime()) ? remindAtDate.toISOString() : '';

    if (!movieId || !movieTitle || !remindAtIso) {
      return NextResponse.json(
        { message: 'movieId, movieTitle, and remindAt are required.' },
        { status: 400 },
      );
    }

    if (new Date(remindAtIso).getTime() < Date.now() - 60_000) {
      return NextResponse.json({ message: 'Reminder time must be in the future.' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const payload = {
      user_id: userId,
      movie_id: movieId,
      movie_title: movieTitle.slice(0, 200),
      movie_poster: moviePoster,
      movie_year: movieYear,
      remind_at: remindAtIso,
      notified_at: null,
      canceled_at: null,
      updated_at: nowIso,
    };

    const params = new URLSearchParams({ on_conflict: 'user_id,movie_id' });
    const response = await fetchWithTimeoutRetry(`${supabaseUrl}/rest/v1/watch_reminders?${params.toString()}`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(payload),
    }, SUPABASE_FETCH_OPTIONS);

    const text = await response.text();
    if (!response.ok) {
      const message = parseRestError(text, 'Failed to save reminder.');
      return NextResponse.json({ message }, { status: 500 });
    }

    const rows = (text ? (JSON.parse(text) as ReminderRow[]) : []) ?? [];
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!row) {
      return NextResponse.json({ message: 'Reminder saved but response was empty.' }, { status: 200 });
    }

    return NextResponse.json({ reminder: toClientReminder(row) }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save reminder.';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
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

    const url = new URL(request.url);
    const body = (await request.json().catch(() => null)) as { movieId?: string } | null;
    const movieId = (body?.movieId ?? url.searchParams.get('movieId') ?? '').trim();
    if (!movieId) {
      return NextResponse.json({ message: 'movieId is required.' }, { status: 400 });
    }

    const params = new URLSearchParams({
      user_id: `eq.${userId}`,
      movie_id: `eq.${movieId}`,
    });
    const response = await fetchWithTimeoutRetry(`${supabaseUrl}/rest/v1/watch_reminders?${params.toString()}`, {
      method: 'DELETE',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        Prefer: 'return=minimal',
      },
    }, SUPABASE_FETCH_OPTIONS);

    if (!response.ok) {
      const text = await response.text();
      const message = parseRestError(text, 'Failed to delete reminder.');
      return NextResponse.json({ message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete reminder.';
    return NextResponse.json({ message }, { status: 500 });
  }
}
