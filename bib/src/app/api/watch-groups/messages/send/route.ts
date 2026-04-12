import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dispatchPushNotification } from '@/lib/server/push-dispatch';
import { moderateUserGeneratedText } from '@/lib/server/content-safety';
import { getAuthedRequestUser, getBearerToken } from '@/lib/server/request-auth';
import { createSupabaseAdminClient, getBlockRelationship, type UserBlockCache } from '@/lib/server/user-blocks';

export const runtime = 'nodejs';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const SEND_GROUP_MESSAGE_ERROR = 'Failed to send message.';
const VERIFY_GROUP_MEMBERSHIP_ERROR = 'Failed to verify group membership.';
const USER_SAFETY_CHECKS_UNAVAILABLE_MESSAGE = 'Message safety checks are unavailable right now. Please try again.';
const LEGACY_REPLY_PREFIX = '[[bib_reply_to:';

type SharedMovieInput = {
  mediaType: 'movie' | 'show';
  tmdbId: string;
  title: string;
  poster: string | null;
  releaseYear: number | null;
};

type RequestBody = {
  groupId?: unknown;
  body?: unknown;
  replyToId?: unknown;
  sharedMovie?: unknown;
};

function trimString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function sanitizeSharedMovie(value: unknown): SharedMovieInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const mediaType = input.mediaType === 'show' ? 'show' : input.mediaType === 'movie' ? 'movie' : null;
  const tmdbId = trimString(input.tmdbId, 64);
  const title = trimString(input.title, 200);
  if (!mediaType || !tmdbId || !title) return null;

  const rawPoster = trimString(input.poster, 500);
  const poster = rawPoster
    ? rawPoster.startsWith('/') || /^https?:\/\//i.test(rawPoster)
      ? rawPoster
      : null
    : null;
  const releaseYear = typeof input.releaseYear === 'number' ? input.releaseYear : null;

  return {
    mediaType,
    tmdbId,
    title,
    poster,
    releaseYear,
  };
}

function buildPreview(body: string, sharedMovie: SharedMovieInput | null): string {
  if (body) return body.slice(0, 140);
  if (!sharedMovie) return 'Sent a new message.';
  return `Shared ${sharedMovie.mediaType === 'show' ? 'show' : 'movie'}: ${sharedMovie.title}`.slice(0, 140);
}

function isMissingWatchGroupOptionalColumnsError(message: string): boolean {
  const lower = message.toLowerCase();
  const mentionsOptionalColumn =
    lower.includes('reply_to_id') ||
    lower.includes('shared_media_type') ||
    lower.includes('shared_tmdb_id') ||
    lower.includes('shared_title') ||
    lower.includes('shared_poster') ||
    lower.includes('shared_release_year');

  return (
    lower.includes('schema cache') ||
    (mentionsOptionalColumn && lower.includes('column') && lower.includes('watch_group_messages'))
  );
}

function buildLegacyBody(body: string, replyToId: string | null, sharedMovie: SharedMovieInput | null): string {
  const fallbackBody = body || `Shared ${sharedMovie?.mediaType === 'show' ? 'show' : 'movie'}: ${sharedMovie?.title ?? 'a title'}`;
  if (!replyToId) return fallbackBody.slice(0, 1200);
  return `[[bib_reply_to:${replyToId}]] ${fallbackBody}`.slice(0, 1200);
}

function escapeLegacyReplyPrefix(body: string): string {
  return body.trimStart().startsWith(LEGACY_REPLY_PREFIX) ? `\u2063${body}` : body;
}

export async function POST(request: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
    }

    const authedUser = await getAuthedRequestUser(request);
    const token = getBearerToken(request);
    if (!authedUser?.id || !token) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const groupId = trimString(body?.groupId, 120);
    const messageBody = trimString(body?.body, 1200);
    const replyToId = trimString(body?.replyToId, 120) || null;
    const sharedMovie = sanitizeSharedMovie(body?.sharedMovie);
    let safeMessageBody = '';
    try {
      safeMessageBody = messageBody
        ? moderateUserGeneratedText(messageBody, { fieldLabel: 'message' }).slice(0, 1200)
        : '';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'This message contains language that is not allowed.';
      return NextResponse.json({ message }, { status: 400 });
    }

    if (!groupId) {
      return NextResponse.json({ message: 'groupId is required.' }, { status: 400 });
    }
    if (!safeMessageBody && !sharedMovie) {
      return NextResponse.json({ message: 'Message cannot be empty.' }, { status: 400 });
    }

    const storedMessageBody = replyToId ? safeMessageBody : escapeLegacyReplyPrefix(safeMessageBody);

    let admin;
    try {
      admin = createSupabaseAdminClient();
    } catch (error) {
      console.error('[watch-groups/messages/send] safety checks unavailable', error);
      return NextResponse.json({ message: USER_SAFETY_CHECKS_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    const { data: memberRows, error: membershipError } = await admin
      .from('watch_group_members')
      .select('user_id')
      .eq('group_id', groupId);

    if (membershipError) {
      console.error('[watch-groups/messages/send] membership lookup failed', {
        groupId,
        error: membershipError.message,
      });
      return NextResponse.json({ message: VERIFY_GROUP_MEMBERSHIP_ERROR }, { status: 500 });
    }

    const memberIds = [...new Set(
      ((memberRows ?? []) as Array<{ user_id?: string | null }>)
        .map((row) => (typeof row.user_id === 'string' ? row.user_id : ''))
        .filter(Boolean),
    )];

    if (!memberIds.includes(authedUser.id)) {
      return NextResponse.json({ message: 'You are not a member of this group.' }, { status: 403 });
    }

    const blockCache: UserBlockCache = new Map();
    for (const memberId of memberIds) {
      if (!memberId || memberId === authedUser.id) continue;
      const relationship = await getBlockRelationship(admin, authedUser.id, memberId, blockCache);
      if (relationship.blockedByCurrentUser) {
        return NextResponse.json(
          { message: 'Unblock all affected users before sending messages in this group.' },
          { status: 403 },
        );
      }
      if (relationship.blockedByTargetUser) {
        return NextResponse.json(
          { message: 'A member of this group has blocked you. Group messaging is unavailable.' },
          { status: 403 },
        );
      }
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let insertError: string | null = null;
    const primaryInsert = await supabase.from('watch_group_messages').insert({
      group_id: groupId,
      sender_id: authedUser.id,
      body: storedMessageBody || null,
      reply_to_id: replyToId,
      shared_media_type: sharedMovie?.mediaType ?? null,
      shared_tmdb_id: sharedMovie?.tmdbId ?? null,
      shared_title: sharedMovie?.title ?? null,
      shared_poster: sharedMovie?.poster ?? null,
      shared_release_year: sharedMovie?.releaseYear ?? null,
    });

    if (primaryInsert.error) {
      insertError = primaryInsert.error.message;
      const missingSharedColumns = isMissingWatchGroupOptionalColumnsError(insertError);

      if (missingSharedColumns) {
        const fallbackInsert = await supabase.from('watch_group_messages').insert({
          group_id: groupId,
          sender_id: authedUser.id,
          body: buildLegacyBody(storedMessageBody, replyToId, sharedMovie),
        });
        insertError = fallbackInsert.error?.message ?? null;
      }
    }

    if (insertError) {
      console.error('[watch-groups/messages/send] insert failed', {
        groupId,
        replyToId,
        hasSharedMovie: Boolean(sharedMovie),
        error: insertError,
      });
      return NextResponse.json({ message: SEND_GROUP_MESSAGE_ERROR }, { status: 500 });
    }

    const [{ data: group }] = await Promise.all([
      supabase
        .from('watch_groups')
        .select('name')
        .eq('id', groupId)
        .maybeSingle(),
    ]);

    const recipientIds = [...new Set(
      ((memberRows ?? []) as Array<{ user_id?: string | null }>)
        .map((row) => (typeof row.user_id === 'string' ? row.user_id : ''))
        .filter((value) => value && value !== authedUser.id),
    )];
    const groupName = typeof group?.name === 'string' && group.name.trim()
      ? group.name.trim()
      : 'Group watch';
    const senderName = authedUser.name?.trim() || authedUser.email?.split('@')[0] || 'Someone';

    if (recipientIds.length > 0) {
      try {
        const pushResult = await dispatchPushNotification({
          userIds: recipientIds,
          category: 'chat',
          title: `${groupName}`,
          body: `${senderName}: ${buildPreview(safeMessageBody, sharedMovie)}`,
          url: `/?chat=group&group=${encodeURIComponent(groupId)}`,
          tag: `group-${groupId}`,
        });
        if (!pushResult.ok && !pushResult.skipped) {
          console.error('[watch-groups/messages/send] push dispatch failed', pushResult.message);
        }
      } catch (error) {
        console.error('[watch-groups/messages/send] push dispatch failed', error);
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[watch-groups/messages/send] unexpected error', error);
    return NextResponse.json({ message: SEND_GROUP_MESSAGE_ERROR }, { status: 500 });
  }
}
