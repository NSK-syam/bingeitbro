import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getWatchReminderOpenPath } from '@/lib/watch-reminder-path';
import { buildBibEmailTemplate } from '@/lib/email-template';
import { fetchWithTimeoutRetry } from '@/lib/fetch-with-retry';
import { dispatchPushNotification, type PushDispatchPayload } from '@/lib/server/push-dispatch';

export const runtime = 'nodejs';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? '').trim();
const unosendApiKey = (process.env.UNOSEND_API_KEY ?? '').trim();
const dispatchSecret = (process.env.WATCH_REMINDER_CRON_SECRET ?? '').trim();
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i;

const normalizeEmailHeader = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const cleaned = trimmed.replace(/[\r\n]+/g, ' ').replace(/^["']+|["']+$/g, '').trim();
  if (!cleaned) return '';

  const angleMatch = cleaned.match(/^(.*)<([^>]+)>$/);
  if (angleMatch) {
    const name = angleMatch[1].trim().replace(/^["']+|["']+$/g, '');
    const email = angleMatch[2].trim();
    if (EMAIL_RE.test(email)) {
      return name ? `${name} <${email}>` : email;
    }
  }

  if (EMAIL_RE.test(cleaned)) return cleaned;
  return '';
};

const unosendFrom = normalizeEmailHeader(process.env.UNOSEND_FROM ?? '');
const unosendReplyTo = normalizeEmailHeader(process.env.UNOSEND_REPLY_TO ?? '');
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://bingeitbro.com');

function sanitizePosterUrl(posterUrl: string | null | undefined): string {
  const trimmed = String(posterUrl ?? '').trim();
  if (!trimmed || trimmed.length > 500) return '';
  const normalizedSiteUrl = String(siteUrl).replace(/\/+$/, '');
  if (trimmed.startsWith('/')) return normalizedSiteUrl ? `${normalizedSiteUrl}${trimmed}` : '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (normalizedSiteUrl && trimmed.startsWith(`${normalizedSiteUrl}/`)) return trimmed;
  return '';
}

type WatchReminderRow = {
  id: string;
  user_id: string;
  movie_id: string;
  movie_title: string;
  movie_poster: string | null;
  movie_year: number | null;
  remind_at: string;
};

type FriendRecommendationReminderRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  recommendation_id: string | null;
  tmdb_id: string | number | null;
  movie_title: string;
  movie_poster: string | null;
  movie_year: number | null;
  remind_at: string | null;
};

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type UnosendPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
};

type EmailJob = {
  reminderId: string;
  payload: UnosendPayload;
};

type DispatchSummary = {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  failedDetails: string[];
  push?: {
    sent: number;
    failed: number;
    failedDetails: string[];
  };
};

const unosendBaseUrl = 'https://www.unosend.co/api/v1';
const UNOSEND_FETCH_OPTIONS = {
  timeoutMs: 12000,
  retries: 2,
  retryDelayMs: 350,
} as const;
type SupabaseServiceClient = SupabaseClient;

async function sendPushJobs(jobs: PushDispatchPayload[]): Promise<{
  sent: number;
  failed: number;
  failedDetails: string[];
}> {
  let sent = 0;
  let failed = 0;
  const failedDetails: string[] = [];

  for (const job of jobs) {
    try {
      const result = await dispatchPushNotification(job);
      if (result.ok) {
        sent += 1;
      } else if (!result.skipped) {
        failed += 1;
        if (result.message) failedDetails.push(result.message);
      }
    } catch (error) {
      failed += 1;
      failedDetails.push(error instanceof Error ? error.message : 'Push dispatch failed.');
    }
  }

  return {
    sent,
    failed,
    failedDetails: failedDetails.slice(0, 10),
  };
}

function normalizeSecretCandidate(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

function secretsMatch(candidate: string, configured: string): boolean {
  if (!candidate || !configured) return false;
  const candidateBuffer = Buffer.from(candidate, 'utf8');
  const configuredBuffer = Buffer.from(configured, 'utf8');
  if (candidateBuffer.length !== configuredBuffer.length) return false;
  return timingSafeEqual(candidateBuffer, configuredBuffer);
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

type DispatchAuth =
  | { ok: true; mode: 'secret' }
  | { ok: true; mode: 'user'; userId: string }
  | { ok: false };

async function authorizeDispatch(request: Request): Promise<DispatchAuth> {
  const configuredSecret = normalizeSecretCandidate(dispatchSecret);
  const bearerToken = getBearerToken(request);

  const headerSecret = normalizeSecretCandidate(request.headers.get('x-watch-reminder-secret'));
  const bearerAsSecret = normalizeSecretCandidate(bearerToken);

  if (
    configuredSecret &&
    [headerSecret, bearerAsSecret].some((candidate) => secretsMatch(candidate, configuredSecret))
  ) {
    return { ok: true, mode: 'secret' };
  }

  // Fallback: authenticated users can trigger dispatch for themselves only.
  if (!supabaseUrl || !supabaseAnonKey || !bearerToken) {
    return { ok: false };
  }

  try {
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anonClient.auth.getUser(bearerToken);
    const userId = data?.user?.id;
    if (error || !userId) return { ok: false };
    return { ok: true, mode: 'user', userId };
  } catch {
    return { ok: false };
  }
}

async function sendOneEmail(payload: UnosendPayload): Promise<{ ok: boolean; message?: string }> {
  const response = await fetchWithTimeoutRetry(`${unosendBaseUrl}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${unosendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, UNOSEND_FETCH_OPTIONS);

  if (response.ok) return { ok: true };
  const text = await response.text();
  return { ok: false, message: text || response.statusText };
}

async function sendBatchEmails(payload: UnosendPayload[]): Promise<{ ok: boolean; message?: string }> {
  const response = await fetchWithTimeoutRetry(`${unosendBaseUrl}/emails/batch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${unosendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, UNOSEND_FETCH_OPTIONS);

  if (response.ok) return { ok: true };
  const text = await response.text();
  return { ok: false, message: text || response.statusText };
}

async function sendJobs(jobs: EmailJob[]): Promise<{ sentIds: string[]; failed: number; failedDetails: string[] }> {
  if (jobs.length === 0) {
    return { sentIds: [], failed: 0, failedDetails: [] };
  }

  const sentIds: string[] = [];
  let failed = 0;
  const failedDetails: string[] = [];

  if (jobs.length === 1) {
    const result = await sendOneEmail(jobs[0].payload);
    if (result.ok) sentIds.push(jobs[0].reminderId);
    else {
      failed += 1;
      if (result.message) failedDetails.push(`single:${result.message}`);
    }
    return { sentIds, failed, failedDetails };
  }

  const batchResult = await sendBatchEmails(jobs.map((j) => j.payload));
  if (batchResult.ok) {
    sentIds.push(...jobs.map((j) => j.reminderId));
    return { sentIds, failed, failedDetails };
  }

  if (batchResult.message) failedDetails.push(`batch:${batchResult.message}`);
  for (const job of jobs) {
    const single = await sendOneEmail(job.payload);
    if (single.ok) sentIds.push(job.reminderId);
    else {
      failed += 1;
      if (single.message) failedDetails.push(`single:${single.message}`);
    }
  }

  return { sentIds, failed, failedDetails };
}

async function dispatchWatchReminderEmails(
  supabase: SupabaseServiceClient,
  limit: number,
  nowIso: string,
  onlyUserId: string | null = null,
): Promise<DispatchSummary> {
  let reminderQuery = supabase
    .from('watch_reminders')
    .select('id,user_id,movie_id,movie_title,movie_poster,movie_year,remind_at')
    .is('canceled_at', null)
    .is('email_sent_at', null)
    .lte('remind_at', nowIso)
    .order('remind_at', { ascending: true });

  if (onlyUserId) {
    reminderQuery = reminderQuery.eq('user_id', onlyUserId);
  }

  const { data: reminders, error: remindersError } = await reminderQuery.limit(limit);

  if (remindersError) {
    throw new Error(remindersError.message);
  }

  const due = (reminders ?? []) as WatchReminderRow[];
  if (due.length === 0) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0, failedDetails: [] };
  }

  const userIds = [...new Set(due.map((r) => r.user_id))];
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id,name,email')
    .in('id', userIds);

  if (usersError) {
    throw new Error(usersError.message);
  }

  const userRows = (users ?? []) as UserRow[];
  const userMap = new Map<string, UserRow>(userRows.map((u) => [u.id, u]));
  const jobs: EmailJob[] = [];
  const pushJobs: PushDispatchPayload[] = [];
  let skipped = 0;

  for (const reminder of due) {
    const recipient = userMap.get(reminder.user_id);
    const movieLabel = reminder.movie_year
      ? `${reminder.movie_title} (${reminder.movie_year})`
      : reminder.movie_title;
    pushJobs.push({
      userIds: [reminder.user_id],
      category: 'schedule',
      title: 'Movie reminder',
      body: `Time to watch ${movieLabel}`.slice(0, 220),
      url: getWatchReminderOpenPath(reminder.movie_id),
      tag: `watch-reminder-${reminder.id}`,
    });

    const email = (recipient?.email ?? '').trim();
    if (!EMAIL_RE.test(email)) {
      skipped += 1;
      continue;
    }

    const receiverName = recipient?.name?.trim() || 'there';
    const openLink = `${siteUrl}${getWatchReminderOpenPath(reminder.movie_id)}`;
    const subject = `Reminder: Watch ${movieLabel}`;
    const text = [
      `Hi ${receiverName},`,
      '',
      `Your BiB reminder is here for: ${movieLabel}`,
      `It's reminder time now.`,
      '',
      `Open now: ${openLink}`,
      '',
      `Inbox tip: If this email lands in Spam, click "Report not spam" and move it to Primary.`,
    ].join('\n');
    const html = buildBibEmailTemplate({
      siteUrl,
      preheader: `Reminder for ${movieLabel}`,
      recipientName: receiverName,
      title: 'Your watch reminder is here',
      intro: 'It is time to watch your scheduled pick.',
      posterUrl: sanitizePosterUrl(reminder.movie_poster),
      spotlightLabel: 'Scheduled Pick',
      spotlightValue: movieLabel,
      ctaLabel: 'Open on Binge it bro',
      ctaUrl: openLink,
      footerNote: 'You are receiving this because you scheduled this reminder in BiB.',
      inboxTip: 'If this lands in Spam, click "Report not spam" and move future BiB emails to Primary.',
    });

    jobs.push({
      reminderId: reminder.id,
      payload: {
        from: unosendFrom,
        to: email,
        subject,
        html,
        text,
        ...(unosendReplyTo ? { reply_to: unosendReplyTo } : {}),
      },
    });
  }

  const sendResult = await sendJobs(jobs);
  const pushResult = await sendPushJobs(pushJobs);

  if (sendResult.sentIds.length > 0) {
    const updateNow = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('watch_reminders')
      .update({ email_sent_at: updateNow, updated_at: updateNow })
      .in('id', sendResult.sentIds)
      .is('email_sent_at', null);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  return {
    processed: due.length,
    sent: sendResult.sentIds.length,
    skipped,
    failed: sendResult.failed,
    failedDetails: sendResult.failedDetails.slice(0, 10),
    push: pushResult,
  };
}

async function dispatchFriendRecommendationReminderEmails(
  supabase: SupabaseServiceClient,
  limit: number,
  nowIso: string,
  onlyRecipientId: string | null = null,
): Promise<DispatchSummary> {
  let reminderQuery = supabase
    .from('friend_recommendations')
    .select('id,sender_id,recipient_id,recommendation_id,tmdb_id,movie_title,movie_poster,movie_year,remind_at,is_watched')
    .not('remind_at', 'is', null)
    .is('reminder_email_sent_at', null)
    .lte('remind_at', nowIso)
    .or('is_watched.is.null,is_watched.eq.false')
    .order('remind_at', { ascending: true });

  if (onlyRecipientId) {
    reminderQuery = reminderQuery.eq('recipient_id', onlyRecipientId);
  }

  const { data: reminders, error: remindersError } = await reminderQuery.limit(limit);

  if (remindersError) {
    throw new Error(remindersError.message);
  }

  const due = (reminders ?? []) as FriendRecommendationReminderRow[];
  if (due.length === 0) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0, failedDetails: [] };
  }

  const userIds = [...new Set(due.flatMap((row) => [row.sender_id, row.recipient_id]))];
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id,name,email')
    .in('id', userIds);

  if (usersError) {
    throw new Error(usersError.message);
  }

  const userRows = (users ?? []) as UserRow[];
  const userMap = new Map<string, UserRow>(userRows.map((u) => [u.id, u]));
  const jobs: EmailJob[] = [];
  const pushJobs: PushDispatchPayload[] = [];
  let skipped = 0;

  for (const reminder of due) {
    const recipient = userMap.get(reminder.recipient_id);
    const sender = userMap.get(reminder.sender_id);

    const recipientEmail = (recipient?.email ?? '').trim();
    if (!EMAIL_RE.test(recipientEmail)) {
      skipped += 1;
      continue;
    }

    const receiverName = recipient?.name?.trim() || 'there';
    const senderName = sender?.name?.trim() || 'Your friend';
    const movieLabel = reminder.movie_year
      ? `${reminder.movie_title} (${reminder.movie_year})`
      : reminder.movie_title;

    const tmdbId = reminder.tmdb_id != null ? String(reminder.tmdb_id).trim() : '';
    const recommendationId = reminder.recommendation_id ? String(reminder.recommendation_id).trim() : '';
    const openLink = tmdbId
      ? `${siteUrl}/movie/tmdb-${encodeURIComponent(tmdbId)}`
      : recommendationId
        ? `${siteUrl}/movie/${encodeURIComponent(recommendationId)}`
        : `${siteUrl}/?view=friends`;
    pushJobs.push({
      userIds: [reminder.recipient_id],
      category: 'schedule',
      title: `${senderName} sent you a watch reminder`.slice(0, 120),
      body: `${senderName} reminded you to watch ${movieLabel}`.slice(0, 220),
      url: tmdbId
        ? `/movie/tmdb-${encodeURIComponent(tmdbId)}`
        : recommendationId
          ? `/movie/${encodeURIComponent(recommendationId)}`
          : '/?view=friends',
      tag: `friend-reminder-${reminder.id}`,
    });

    const subject = `${senderName} reminded you to watch ${movieLabel}`;
    const text = [
      `Hi ${receiverName},`,
      '',
      `${senderName} sent you a reminder for: ${movieLabel}`,
      `It's reminder time now.`,
      '',
      `Open now: ${openLink}`,
      '',
      `Inbox tip: If this email lands in Spam, click "Report not spam" and move it to Primary.`,
    ].join('\n');
    const html = buildBibEmailTemplate({
      siteUrl,
      preheader: `${senderName} reminded you about ${movieLabel}`,
      recipientName: receiverName,
      title: `${senderName} sent you a watch reminder`,
      intro: 'Your friend nudged you so you do not miss this title.',
      posterUrl: sanitizePosterUrl(reminder.movie_poster),
      spotlightLabel: 'Reminder Pick',
      spotlightValue: movieLabel,
      ctaLabel: 'Open movie on Binge it bro',
      ctaUrl: openLink,
      footerNote: 'You can manage reminder alerts from your BiB account.',
      inboxTip: 'If this lands in Spam, click "Report not spam" and move future BiB emails to Primary.',
    });

    jobs.push({
      reminderId: reminder.id,
      payload: {
        from: unosendFrom,
        to: recipientEmail,
        subject,
        html,
        text,
        ...(unosendReplyTo ? { reply_to: unosendReplyTo } : {}),
      },
    });
  }

  const sendResult = await sendJobs(jobs);
  const pushResult = await sendPushJobs(pushJobs);

  if (sendResult.sentIds.length > 0) {
    const updateNow = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('friend_recommendations')
      .update({ reminder_email_sent_at: updateNow })
      .in('id', sendResult.sentIds)
      .is('reminder_email_sent_at', null);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  return {
    processed: due.length,
    sent: sendResult.sentIds.length,
    skipped,
    failed: sendResult.failed,
    failedDetails: sendResult.failedDetails.slice(0, 10),
    push: pushResult,
  };
}

export async function POST(request: Request) {
  try {
    const dispatchAuth = await authorizeDispatch(request);
    if (!dispatchAuth.ok) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json({ message: 'Supabase service role is not configured.' }, { status: 503 });
    }
    if (!unosendApiKey || !unosendFrom) {
      return NextResponse.json({ message: 'Email provider is not configured.' }, { status: 503 });
    }

    const body = (await request.json().catch(() => null)) as { limit?: number } | null;
    const requestedLimit = typeof body?.limit === 'number' ? body.limit : 50;
    const limit = Math.max(1, Math.min(200, Math.floor(requestedLimit)));
    const nowIso = new Date().toISOString();

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    const scopedUserId = dispatchAuth.mode === 'user' ? dispatchAuth.userId : null;
    const watch = await dispatchWatchReminderEmails(supabase, limit, nowIso, scopedUserId);

    let friendRecommendation: DispatchSummary = {
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      failedDetails: [],
      push: { sent: 0, failed: 0, failedDetails: [] },
    };

    try {
      friendRecommendation = await dispatchFriendRecommendationReminderEmails(
        supabase,
        limit,
        nowIso,
        scopedUserId,
      );
    } catch (friendErr) {
      const message = friendErr instanceof Error ? friendErr.message : 'Friend reminder dispatch failed.';
      friendRecommendation = {
        processed: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        failedDetails: [message],
      };
    }

    return NextResponse.json(
      {
        processed: watch.processed,
        sent: watch.sent,
        skipped: watch.skipped,
        failed: watch.failed,
        failedDetails: watch.failedDetails,
        friendRecommendation,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to dispatch watch reminder emails.';
    return NextResponse.json({ message }, { status: 500 });
  }
}
