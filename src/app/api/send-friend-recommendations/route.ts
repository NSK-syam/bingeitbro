import { NextResponse } from 'next/server';

/**
 * Insert friend recommendations directly via Supabase REST (no Edge Function).
 * Avoids Edge Function OOM; same-origin so no CORS.
 * XX000 = Postgres internal error (e.g. OOM). Set SUPABASE_SERVICE_ROLE_KEY in Vercel to bypass RLS and reduce load.
 */
export const runtime = 'nodejs';
export const maxDuration = 15;

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? '').trim();
const useServiceRole = serviceRoleKey.split('.').length === 3;

function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

type RecRow = {
  sender_id: string;
  recipient_id: string;
  recommendation_id: string | null;
  tmdb_id: number | null;
  movie_title: string;
  movie_poster: string;
  movie_year: number | null;
  personal_message: string;
  remind_at: string | null;
};

/** Payload sent to Supabase (tmdb_id as string to match TEXT column). */
type InsertRow = Omit<RecRow, 'tmdb_id' | 'remind_at'> & {
  tmdb_id: string | null;
  remind_at?: string;
};

export async function POST(request: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { message: 'Server misconfigured: missing Supabase URL or anon key' },
        { status: 503 },
      );
    }
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
    }
    let body: { recommendations?: unknown[] };
    try {
      body = (await request.json()) as { recommendations?: unknown[] };
    } catch {
      return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
    }
    const raw = Array.isArray(body?.recommendations) ? body.recommendations : [];

    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
    });
    if (!authRes.ok) {
      return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
    }
    const user = (await authRes.json().catch(() => null)) as { id?: string } | null;
    if (!user?.id) {
      return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
    }

  const toInsert: RecRow[] = [];
  for (let i = 0; i < Math.min(raw.length, 50); i++) {
    const rec = raw[i];
    if (!rec || typeof rec !== 'object') continue;
    const r = rec as Record<string, unknown>;
    const sender_id = String(r.sender_id ?? '').trim();
    const recipient_id = String(r.recipient_id ?? '').trim();
    const movie_title = String(r.movie_title ?? '').trim().slice(0, 200);
    if (sender_id !== user.id || !recipient_id || !movie_title) continue;
    const poster = String(r.movie_poster ?? '').trim().slice(0, 500);
    toInsert.push({
      sender_id,
      recipient_id,
      recommendation_id: r.recommendation_id != null ? String(r.recommendation_id) : null,
      tmdb_id: typeof r.tmdb_id === 'number' ? r.tmdb_id : null,
      movie_title,
      movie_poster: poster.startsWith('https://image.tmdb.org/') ? poster : '',
      movie_year: typeof r.movie_year === 'number' ? r.movie_year : null,
      personal_message: String(r.personal_message ?? '').trim().slice(0, 200),
      remind_at: (() => {
        const raw = String(r.remind_at ?? '').trim();
        if (!raw) return null;
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return null;
        // Allow minor clock skew while still blocking stale reminder timestamps.
        if (parsed.getTime() < Date.now() - 60_000) return null;
        return parsed.toISOString();
      })(),
    });
  }

  if (toInsert.length === 0) {
    return NextResponse.json(
      { sent: 0, sentRecipientIds: [], skipped: { duplicates: [], notAllowed: [] } },
      { status: 200 },
    );
  }

  let allowed = toInsert;
  if (useServiceRole && serviceRoleKey) {
    const recipientIds = [...new Set(toInsert.map((r) => r.recipient_id))];
    if (recipientIds.length > 0) {
      const friendsRes = await fetch(
        `${supabaseUrl}/rest/v1/friends?select=friend_id&user_id=eq.${user.id}&friend_id=in.(${recipientIds.join(',')})`,
        {
          method: 'GET',
          headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${serviceRoleKey}` },
        },
      );
      if (friendsRes.ok) {
        const friends = (await friendsRes.json().catch(() => [])) as { friend_id?: string }[];
        const allowedIds = new Set(friends.map((row) => row.friend_id).filter(Boolean) as string[]);
        allowed = toInsert.filter((r) => allowedIds.has(r.recipient_id));
      }
    }
  }

  const allowedRecipientIds = new Set(allowed.map((r) => r.recipient_id));
  const notAllowedRecipientIds = toInsert
    .filter((r) => !allowedRecipientIds.has(r.recipient_id))
    .map((r) => r.recipient_id);

  if (allowed.length === 0) {
    return NextResponse.json(
      { sent: 0, sentRecipientIds: [], skipped: { duplicates: [], notAllowed: notAllowedRecipientIds } },
      { status: 200 },
    );
  }

  const insertAuth = useServiceRole && serviceRoleKey ? serviceRoleKey : token;
  const headers = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${insertAuth}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  let lastCode = '';
  let lastMessage = '';
  let sent = 0;
  const sentRecipientIds: string[] = [];
  const duplicateRecipientIds: string[] = [];

  const tryInsert = async (row: RecRow): Promise<{ ok: boolean; code: string; message: string }> => {
    const insertBody: InsertRow = {
      sender_id: row.sender_id,
      recipient_id: row.recipient_id,
      recommendation_id: row.recommendation_id,
      tmdb_id: row.tmdb_id != null ? String(row.tmdb_id) : null,
      movie_title: row.movie_title,
      movie_poster: row.movie_poster,
      movie_year: row.movie_year,
      personal_message: row.personal_message,
    };
    if (row.remind_at) {
      insertBody.remind_at = row.remind_at;
    }
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/friend_recommendations`, {
      method: 'POST',
      headers,
      body: JSON.stringify(insertBody),
    });
    const text = await insertRes.text();
    let data: { code?: string; message?: string } | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as { code?: string; message?: string };
      } catch {
        data = { message: text };
      }
    }
    const code = data?.code ?? '';
    const message = data?.message ?? insertRes.statusText;
    return { ok: insertRes.ok, code, message };
  };

  for (const row of allowed) {
    let result = await tryInsert(row);

    if (!result.ok && (result.code === 'XX000' || /out of memory/i.test(result.message))) {
      console.error('[send-friend-recommendations] Supabase insert failed (will retry once)', {
        code: result.code,
        message: result.message,
      });
      await new Promise((r) => setTimeout(r, 800));
      result = await tryInsert(row);
    }

    if (!result.ok) {
      lastCode = result.code;
      lastMessage = result.message;
      console.error('[send-friend-recommendations] Supabase insert failed', {
        code: lastCode,
        message: lastMessage,
      });
      if (lastCode === '23505') {
        duplicateRecipientIds.push(row.recipient_id);
        continue;
      }
      const userMessage =
        lastCode === 'XX000' || /out of memory/i.test(lastMessage)
          ? 'Server is busy. Please try again in a moment.'
          : row.remind_at && /remind_at|schema cache|column/i.test(lastMessage)
            ? 'Reminder columns are missing in Supabase. Run supabase-friend-recommendation-reminders.sql and try again.'
          : lastMessage;
      return NextResponse.json({ message: userMessage, code: lastCode }, { status: 500 });
    }
    sent += 1;
    sentRecipientIds.push(row.recipient_id);
  }

  return NextResponse.json(
    {
      sent,
      sentRecipientIds,
      skipped: {
        duplicates: duplicateRecipientIds,
        notAllowed: notAllowedRecipientIds,
      },
    },
    { status: 200 },
  );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[send-friend-recommendations] Unexpected error', err);
    const safe = /out of memory/i.test(msg) ? 'Request failed. Please try again.' : msg;
    return NextResponse.json({ message: safe }, { status: 500 });
  }
}
