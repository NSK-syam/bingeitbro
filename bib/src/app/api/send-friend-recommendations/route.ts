import { NextResponse } from 'next/server';
import { fetchWithTimeoutRetry } from '@/lib/fetch-with-retry';
import { dispatchPushNotification } from '@/lib/server/push-dispatch';
import { moderateUserGeneratedText } from '@/lib/server/content-safety';
import { createSupabaseAdminClient, getBlockRelationship, type UserBlockCache } from '@/lib/server/user-blocks';

/**
 * Insert friend recommendations directly via Supabase REST.
 * Node runtime (Cloudflare OpenNext compatibility).
 * XX000 = Postgres internal error (e.g. OOM). Set SUPABASE_SERVICE_ROLE_KEY in Vercel to bypass RLS and reduce load.
 */
export const runtime = 'nodejs';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? '').trim();
const useServiceRole = serviceRoleKey.split('.').length === 3;
const SUPABASE_FETCH_OPTIONS = { timeoutMs: 9000, retries: 1, retryDelayMs: 300 } as const;
const FRIEND_VALIDATION_UNAVAILABLE_MESSAGE = 'Unable to verify friend access right now. Please try again.';
const USER_SAFETY_CHECKS_UNAVAILABLE_MESSAGE = 'Recommendation safety checks are unavailable right now. Please try again.';

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

    const authRes = await fetchWithTimeoutRetry(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
    }, SUPABASE_FETCH_OPTIONS);
    if (!authRes.ok) {
      return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
    }
    const user = (await authRes.json().catch(() => null)) as {
      id?: string;
      email?: string | null;
      user_metadata?: { name?: string | null; full_name?: string | null } | null;
    } | null;
    if (!user?.id) {
      return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
    }
    const senderName =
      user.user_metadata?.name?.trim() ||
      user.user_metadata?.full_name?.trim() ||
      user.email?.split('@')[0]?.trim() ||
      'Someone';

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
      const personalMessageInput = String(r.personal_message ?? '').trim().slice(0, 200);
      let personalMessage = '';
      try {
        personalMessage = personalMessageInput
          ? moderateUserGeneratedText(personalMessageInput, { fieldLabel: 'note' }).slice(0, 200)
          : '';
      } catch (error) {
        const message = error instanceof Error ? error.message : 'This note contains language that is not allowed.';
        return NextResponse.json({ message }, { status: 400 });
      }

      toInsert.push({
        sender_id,
        recipient_id,
        recommendation_id: r.recommendation_id != null ? String(r.recommendation_id) : null,
        tmdb_id: typeof r.tmdb_id === 'number' ? r.tmdb_id : null,
        movie_title,
        movie_poster: (() => {
          if (!poster) return '';
          if (poster.startsWith('data:')) return '';
          if (poster.startsWith('/')) return poster;
          if (!/^https?:\/\//i.test(poster)) return '';
          return poster;
        })(),
        movie_year: typeof r.movie_year === 'number' ? r.movie_year : null,
        personal_message: personalMessage,
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
        const friendsRes = await fetchWithTimeoutRetry(
          `${supabaseUrl}/rest/v1/friends?select=friend_id&user_id=eq.${user.id}&friend_id=in.(${recipientIds.join(',')})`,
          {
            method: 'GET',
            headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${serviceRoleKey}` },
          },
          SUPABASE_FETCH_OPTIONS,
        );
        if (!friendsRes.ok) {
          console.error('[send-friend-recommendations] friend validation failed', {
            status: friendsRes.status,
            statusText: friendsRes.statusText,
          });
          return NextResponse.json(
            { message: FRIEND_VALIDATION_UNAVAILABLE_MESSAGE },
            { status: 503 },
          );
        }

        const friends = (await friendsRes.json().catch(() => null)) as { friend_id?: string }[] | null;
        if (!Array.isArray(friends)) {
          console.error('[send-friend-recommendations] friend validation returned invalid payload');
          return NextResponse.json(
            { message: FRIEND_VALIDATION_UNAVAILABLE_MESSAGE },
            { status: 503 },
          );
        }

        const allowedIds = new Set(friends.map((row) => row.friend_id).filter(Boolean) as string[]);
        allowed = toInsert.filter((r) => allowedIds.has(r.recipient_id));
      }
    }

    if (allowed.length > 0) {
      let admin;
      try {
        admin = createSupabaseAdminClient();
      } catch (error) {
        console.error('[send-friend-recommendations] safety checks unavailable', error);
        return NextResponse.json(
          { message: USER_SAFETY_CHECKS_UNAVAILABLE_MESSAGE },
          { status: 503 },
        );
      }
      const blockCache: UserBlockCache = new Map();
      const blockedRecipientIds = new Set<string>();

      for (const recipientId of [...new Set(allowed.map((row) => row.recipient_id))]) {
        const relationship = await getBlockRelationship(admin, user.id, recipientId, blockCache);
        if (relationship.blockedByCurrentUser || relationship.blockedByTargetUser) {
          blockedRecipientIds.add(recipientId);
        }
      }

      if (blockedRecipientIds.size > 0) {
        allowed = allowed.filter((row) => !blockedRecipientIds.has(row.recipient_id));
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
    const pushDispatches: Array<Promise<void>> = [];

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
      const insertRes = await fetchWithTimeoutRetry(`${supabaseUrl}/rest/v1/friend_recommendations`, {
        method: 'POST',
        headers,
        body: JSON.stringify(insertBody),
      }, SUPABASE_FETCH_OPTIONS);
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
            : 'Something went wrong. Please try again.';
        return NextResponse.json({ message: userMessage }, { status: 500 });
      }
      sent += 1;
      sentRecipientIds.push(row.recipient_id);

      const moviePath = row.tmdb_id != null
        ? `/movie/tmdb-${encodeURIComponent(String(row.tmdb_id))}`
        : row.recommendation_id
          ? `/movie/${encodeURIComponent(String(row.recommendation_id))}`
          : '/?view=friends';
      const preview = row.personal_message
        ? `${row.movie_title}: ${row.personal_message}`.slice(0, 220)
        : `Sent you a recommendation: ${row.movie_title}`.slice(0, 220);

      pushDispatches.push((async () => {
        try {
          const pushResult = await dispatchPushNotification({
            userIds: [row.recipient_id],
            category: 'recommendation',
            title: `New recommendation from ${senderName}`,
            body: preview,
            url: moviePath,
            tag: `friend-rec-${row.recipient_id}-${row.tmdb_id ?? row.recommendation_id ?? row.movie_title}`,
          });
          if (!pushResult.ok && !pushResult.skipped) {
            console.error('[send-friend-recommendations] push dispatch failed', pushResult.message);
          }
        } catch (error) {
          console.error('[send-friend-recommendations] push dispatch failed', error);
        }
      })());
    }

    if (pushDispatches.length > 0) {
      await Promise.allSettled(pushDispatches);
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
    const safe = /out of memory/i.test(msg)
      ? 'Request failed. Please try again.'
      : 'Something went wrong. Please try again.';
    return NextResponse.json({ message: safe }, { status: 500 });
  }
}
