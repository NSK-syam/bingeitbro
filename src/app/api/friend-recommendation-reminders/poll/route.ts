import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

type ReminderRow = {
  id: string;
  sender_id: string;
  movie_title: string;
  movie_poster: string | null;
  movie_year: number | null;
  tmdb_id: string | number | null;
  recommendation_id: string | null;
  remind_at: string;
};

type SenderRow = {
  id: string;
  name: string | null;
  avatar: string | null;
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

export async function POST(request: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ reminders: [] }, { status: 200 });
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
      select: 'id,sender_id,movie_title,movie_poster,movie_year,tmdb_id,recommendation_id,remind_at',
      recipient_id: `eq.${userId}`,
      remind_at: `lte.${nowIso}`,
      reminder_notified_at: 'is.null',
      order: 'remind_at.asc',
      limit: String(limit),
      or: '(is_watched.is.null,is_watched.eq.false)',
    });

    const dueRes = await fetch(`${supabaseUrl}/rest/v1/friend_recommendations?${params.toString()}`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!dueRes.ok) {
      return NextResponse.json({ reminders: [] }, { status: 200 });
    }

    const dueText = await dueRes.text();
    const dueRows = (dueText ? (JSON.parse(dueText) as ReminderRow[]) : []) ?? [];
    if (!Array.isArray(dueRows) || dueRows.length === 0) {
      return NextResponse.json({ reminders: [] }, { status: 200 });
    }

    const claimedRows = (
      await Promise.all(
        dueRows.map(async (row) => {
          const patchParams = new URLSearchParams({
            id: `eq.${row.id}`,
            recipient_id: `eq.${userId}`,
            reminder_notified_at: 'is.null',
          });
          const patchRes = await fetch(`${supabaseUrl}/rest/v1/friend_recommendations?${patchParams.toString()}`, {
            method: 'PATCH',
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify({
              reminder_notified_at: nowIso,
            }),
          });
          if (!patchRes.ok) return null;
          const patchText = await patchRes.text();
          const patchRows = (patchText ? (JSON.parse(patchText) as ReminderRow[]) : []) ?? [];
          return Array.isArray(patchRows) && patchRows.length > 0 ? row : null;
        }),
      )
    ).filter((row): row is ReminderRow => row !== null);

    if (claimedRows.length === 0) {
      return NextResponse.json({ reminders: [] }, { status: 200 });
    }

    const senderIds = [...new Set(claimedRows.map((row) => row.sender_id))];
    const sendersParams = new URLSearchParams({
      select: 'id,name,avatar',
      id: `in.(${senderIds.join(',')})`,
    });

    const sendersRes = await fetch(`${supabaseUrl}/rest/v1/users?${sendersParams.toString()}`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    });

    const senderRows = sendersRes.ok
      ? (((await sendersRes.json().catch(() => [])) as SenderRow[]) ?? [])
      : [];
    const senderMap = new Map(senderRows.map((row) => [row.id, row]));

    const reminders = claimedRows.map((row) => {
      const sender = senderMap.get(row.sender_id);
      const tmdbId = row.tmdb_id != null ? String(row.tmdb_id) : '';
      const recommendationId = row.recommendation_id ? String(row.recommendation_id) : '';
      return {
        id: row.id,
        senderId: row.sender_id,
        senderName: sender?.name?.trim() || 'Your friend',
        senderAvatar: sender?.avatar?.trim() || null,
        movieId: tmdbId || recommendationId || row.id,
        movieTitle: row.movie_title,
        moviePoster: row.movie_poster,
        movieYear: row.movie_year,
        remindAt: row.remind_at,
        isTmdb: Boolean(tmdbId),
      };
    });

    return NextResponse.json({ reminders }, { status: 200 });
  } catch {
    return NextResponse.json({ reminders: [] }, { status: 200 });
  }
}
