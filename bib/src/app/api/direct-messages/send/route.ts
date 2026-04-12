import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dispatchPushNotification } from '@/lib/server/push-dispatch';
import { getAuthedRequestUser, getBearerToken } from '@/lib/server/request-auth';
import { moderateUserGeneratedText } from '@/lib/server/content-safety';
import { createSupabaseAdminClient, getBlockRelationship } from '@/lib/server/user-blocks';

export const runtime = 'nodejs';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const SEND_MESSAGE_ERROR = 'Failed to send message.';
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
  recipientId?: unknown;
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

function isMissingDirectMessageOptionalColumnsError(message: string): boolean {
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
    (mentionsOptionalColumn && lower.includes('column') && lower.includes('direct_messages'))
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

function buildPreview(body: string, sharedMovie: SharedMovieInput | null): string {
  if (body) return body.slice(0, 140);
  if (!sharedMovie) return 'Sent you a new message.';
  return `Shared ${sharedMovie.mediaType === 'show' ? 'show' : 'movie'}: ${sharedMovie.title}`.slice(0, 140);
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
    const recipientId = trimString(body?.recipientId, 120);
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

    if (!recipientId) {
      return NextResponse.json({ message: 'recipientId is required.' }, { status: 400 });
    }
    if (!safeMessageBody && !sharedMovie) {
      return NextResponse.json({ message: 'Message cannot be empty.' }, { status: 400 });
    }

    const storedMessageBody = replyToId ? safeMessageBody : escapeLegacyReplyPrefix(safeMessageBody);

    let admin;
    try {
      admin = createSupabaseAdminClient();
    } catch (error) {
      console.error('[direct-messages/send] safety checks unavailable', error);
      return NextResponse.json({ message: USER_SAFETY_CHECKS_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    const relationship = await getBlockRelationship(admin, authedUser.id, recipientId);
    if (relationship.blockedByCurrentUser) {
      return NextResponse.json(
        { message: 'Unblock this user before sending them a message.' },
        { status: 403 },
      );
    }
    if (relationship.blockedByTargetUser) {
      return NextResponse.json(
        { message: 'This user has blocked you.' },
        { status: 403 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const fullPayload = {
      sender_id: authedUser.id,
      recipient_id: recipientId,
      body: storedMessageBody || null,
      reply_to_id: replyToId,
      shared_media_type: sharedMovie?.mediaType ?? null,
      shared_tmdb_id: sharedMovie?.tmdbId ?? null,
      shared_title: sharedMovie?.title ?? null,
      shared_poster: sharedMovie?.poster ?? null,
      shared_release_year: sharedMovie?.releaseYear ?? null,
    };

    let insertError: string | null = null;

    const primaryInsert = await supabase.from('direct_messages').insert(fullPayload);
    if (primaryInsert.error) {
      insertError = primaryInsert.error.message;
    }

    if (insertError && isMissingDirectMessageOptionalColumnsError(insertError)) {
      const fallbackInsert = await supabase.from('direct_messages').insert({
        sender_id: authedUser.id,
        recipient_id: recipientId,
        body: buildLegacyBody(storedMessageBody, replyToId, sharedMovie),
      });
      if (fallbackInsert.error) {
        insertError = fallbackInsert.error.message;
      } else {
        insertError = null;
      }
    }

    if (insertError) {
      console.error('[direct-messages/send] insert failed', {
        recipientId,
        replyToId,
        hasSharedMovie: Boolean(sharedMovie),
        error: insertError,
      });
      return NextResponse.json({ message: SEND_MESSAGE_ERROR }, { status: 500 });
    }

    const senderName = authedUser.name?.trim() || authedUser.email?.split('@')[0] || 'Someone';
    const preview = buildPreview(safeMessageBody, sharedMovie);
    try {
      const pushResult = await dispatchPushNotification({
        userIds: [recipientId],
        category: 'chat',
        title: `New message from ${senderName}`,
        body: preview,
        url: `/?chat=direct&peer=${encodeURIComponent(authedUser.id)}`,
        tag: `direct-${authedUser.id}`,
      });
      if (!pushResult.ok && !pushResult.skipped) {
        console.error('[direct-messages/send] push dispatch failed', pushResult.message);
      }
    } catch (error) {
      console.error('[direct-messages/send] push dispatch failed', error);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[direct-messages/send] unexpected error', error);
    return NextResponse.json({ message: SEND_MESSAGE_ERROR }, { status: 500 });
  }
}
