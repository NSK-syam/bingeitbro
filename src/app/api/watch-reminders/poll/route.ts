import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

type ReminderRow = {
  id: string;
  movie_id: string;
  movie_title: string;
  movie_poster: string | null;
  movie_year: number | null;
  remind_at: string;
};

type ReminderResponse = {
  id: string;
  movieId: string;
  movieTitle: string;
  moviePoster: string | null;
  movieYear: number | null;
  remindAt: string;
};

function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

async function getAuthedUserId(token: string): Promise<string | null> {
  const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  });
  if (!authRes.ok) return null;
  const user = (await authRes.json().catch(() => null)) as { id?: string } | null;
  return typeof user?.id === 'string' ? user.id : null;
}

function toClientReminder(row: ReminderRow): ReminderResponse {
  return {
    id: row.id,
    movieId: row.movie_id,
    movieTitle: row.movie_title,
    moviePoster: row.movie_poster,
    movieYear: row.movie_year,
    remindAt: row.remind_at,
  };
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

    const body = (await request.json().catch(() => null)) as { limit?: number } | null;
    const requestedLimit = typeof body?.limit === 'number' ? body.limit : 5;
    const limit = Math.max(1, Math.min(10, Math.floor(requestedLimit)));
    const nowIso = new Date().toISOString();

    const params = new URLSearchParams({
      select: 'id,movie_id,movie_title,movie_poster,movie_year,remind_at',
      user_id: `eq.${userId}`,
      canceled_at: 'is.null',
      notified_at: 'is.null',
      remind_at: `lte.${nowIso}`,
      order: 'remind_at.asc',
      limit: String(limit),
    });

    const dueRes = await fetch(`${supabaseUrl}/rest/v1/watch_reminders?${params.toString()}`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    });

    const dueText = await dueRes.text();
    if (!dueRes.ok) {
      return NextResponse.json({ reminders: [] }, { status: 200 });
    }

    const dueRows = (dueText ? (JSON.parse(dueText) as ReminderRow[]) : []) ?? [];
    if (!Array.isArray(dueRows) || dueRows.length === 0) {
      return NextResponse.json({ reminders: [] }, { status: 200 });
    }

    const claimedRows = (
      await Promise.all(
        dueRows.map(async (row) => {
          const patchParams = new URLSearchParams({
            id: `eq.${row.id}`,
            user_id: `eq.${userId}`,
            notified_at: 'is.null',
          });
          const patchRes = await fetch(`${supabaseUrl}/rest/v1/watch_reminders?${patchParams.toString()}`, {
            method: 'PATCH',
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify({
              notified_at: nowIso,
              updated_at: nowIso,
            }),
          });
          if (!patchRes.ok) return null;
          const patchText = await patchRes.text();
          const patchRows = (patchText ? (JSON.parse(patchText) as ReminderRow[]) : []) ?? [];
          return Array.isArray(patchRows) && patchRows.length > 0 ? row : null;
        }),
      )
    ).filter((row): row is ReminderRow => row !== null);

    return NextResponse.json(
      { reminders: claimedRows.map(toClientReminder) },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ reminders: [] }, { status: 200 });
  }
}
