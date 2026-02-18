import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildBibEmailTemplate } from '@/lib/email-template';
import { fetchWithTimeoutRetry } from '@/lib/fetch-with-retry';

export const runtime = 'nodejs';
export const maxDuration = 60;

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? '').trim();
const unosendApiKey = (process.env.UNOSEND_API_KEY ?? '').trim();
const announcementSecret = (
  process.env.ANNOUNCEMENT_BROADCAST_SECRET ??
  process.env.WATCH_REMINDER_CRON_SECRET ??
  ''
).trim();
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://bingeitbro.com');

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i;
const SUBJECT_DEFAULT = 'New on BiB: Live Radio is now available';
const CTA_URL = `${siteUrl.replace(/\/+$/, '')}/radio`;

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

const UNOSEND_BASE_URL = 'https://www.unosend.co/api/v1';
const UNOSEND_FETCH_OPTIONS = {
  timeoutMs: 12000,
  retries: 2,
  retryDelayMs: 350,
} as const;

function normalizeEmailHeader(value: string): string {
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
}

const unosendFrom = normalizeEmailHeader(process.env.UNOSEND_FROM ?? '');
const unosendReplyTo = normalizeEmailHeader(process.env.UNOSEND_REPLY_TO ?? '');

function normalizeSecretCandidate(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

function isAuthorized(request: Request): boolean {
  const configuredSecret = normalizeSecretCandidate(announcementSecret);
  if (!configuredSecret) return false;
  const url = new URL(request.url);
  const headerSecret = normalizeSecretCandidate(request.headers.get('x-announcement-secret'));
  const querySecret = normalizeSecretCandidate(url.searchParams.get('secret'));
  const bearerSecret = normalizeSecretCandidate(getBearerToken(request));

  return [headerSecret, querySecret, bearerSecret].some(
    (candidate) => candidate && candidate === configuredSecret,
  );
}

function sanitizeSubject(value: unknown): string {
  if (typeof value !== 'string') return SUBJECT_DEFAULT;
  const cleaned = value.trim().replace(/[\r\n]+/g, ' ');
  if (!cleaned) return SUBJECT_DEFAULT;
  return cleaned.slice(0, 120);
}

function buildAnnouncementPayload(
  user: UserRow,
  subject: string,
): UnosendPayload {
  const recipientName = user.name?.trim() || 'there';
  const text = [
    `Hi ${recipientName},`,
    '',
    'Live Radio is now available on BiB.',
    'You can open the Radio tab and play stations while continuing to browse movies and shows.',
    '',
    `Open Radio: ${CTA_URL}`,
    '',
    'You are receiving this product update because you have a BiB account.',
    'Inbox tip: If this email lands in Spam, click "Report not spam" and move it to Primary.',
  ].join('\n');

  const html = buildBibEmailTemplate({
    siteUrl,
    preheader: 'BiB now has live radio streaming',
    recipientName,
    title: 'Live Radio is now on BiB',
    intro: 'Play curated stations directly inside BiB while you keep exploring movies and shows.',
    spotlightLabel: 'New Feature',
    spotlightValue: 'Live Radio Hub',
    messageLabel: 'What you can do',
    messageValue:
      'Open the Radio tab, pick a station, and keep listening in the background while browsing.',
    ctaLabel: 'Open Radio on BiB',
    ctaUrl: CTA_URL,
    footerNote: 'You are receiving this product update because you have a BiB account.',
    inboxTip: 'If this lands in Spam, click "Report not spam" and move future BiB emails to Primary.',
  });

  return {
    from: unosendFrom,
    to: String(user.email ?? '').trim(),
    subject,
    html,
    text,
    ...(unosendReplyTo ? { reply_to: unosendReplyTo } : {}),
  };
}

async function sendOneEmail(payload: UnosendPayload): Promise<{ ok: boolean; message?: string }> {
  const response = await fetchWithTimeoutRetry(
    `${UNOSEND_BASE_URL}/emails`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${unosendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    UNOSEND_FETCH_OPTIONS,
  );
  if (response.ok) return { ok: true };
  const text = await response.text();
  return { ok: false, message: text || response.statusText };
}

async function sendBatchEmails(payload: UnosendPayload[]): Promise<{ ok: boolean; message?: string }> {
  const response = await fetchWithTimeoutRetry(
    `${UNOSEND_BASE_URL}/emails/batch`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${unosendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    UNOSEND_FETCH_OPTIONS,
  );
  if (response.ok) return { ok: true };
  const text = await response.text();
  return { ok: false, message: text || response.statusText };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ message: 'Supabase service role is not configured.' }, { status: 503 });
  }
  if (!unosendApiKey || !unosendFrom) {
    return NextResponse.json({ message: 'Email provider is not configured.' }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    dryRun?: boolean;
    limit?: number;
    subject?: string;
  };

  const dryRun = body.dryRun !== false;
  const subject = sanitizeSubject(body.subject);
  const limitRaw = typeof body.limit === 'number' ? body.limit : 5000;
  const limit = Math.max(1, Math.min(20000, Math.floor(limitRaw)));

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: users, error } = await supabase
    .from('users')
    .select('id,name,email')
    .not('email', 'is', null)
    .limit(limit);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const rows = (users ?? []) as UserRow[];
  const uniqueByEmail = new Map<string, UserRow>();
  for (const row of rows) {
    const email = String(row.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) continue;
    if (!uniqueByEmail.has(email)) {
      uniqueByEmail.set(email, row);
    }
  }

  const recipients = [...uniqueByEmail.values()];
  if (recipients.length === 0) {
    return NextResponse.json({ processed: rows.length, recipients: 0, sent: 0, skipped: rows.length }, { status: 200 });
  }

  const samplePayload = buildAnnouncementPayload(recipients[0], subject);
  if (dryRun) {
    return NextResponse.json(
      {
        dryRun: true,
        processed: rows.length,
        recipients: recipients.length,
        subject,
        sample: {
          to: samplePayload.to,
          text: samplePayload.text,
          html: samplePayload.html,
        },
      },
      { status: 200 },
    );
  }

  const payloads = recipients.map((row) => buildAnnouncementPayload(row, subject));
  const chunkSize = 100;
  let sent = 0;
  let failed = 0;
  const failedDetails: string[] = [];

  for (let i = 0; i < payloads.length; i += chunkSize) {
    const chunk = payloads.slice(i, i + chunkSize);
    const batch = await sendBatchEmails(chunk);
    if (batch.ok) {
      sent += chunk.length;
      continue;
    }

    failedDetails.push(`batch:${batch.message ?? 'batch failed'}`);
    for (const payload of chunk) {
      const single = await sendOneEmail(payload);
      if (single.ok) {
        sent += 1;
      } else {
        failed += 1;
        failedDetails.push(`single:${single.message ?? 'single failed'}:${payload.to}`);
      }
    }
  }

  return NextResponse.json(
    {
      dryRun: false,
      processed: rows.length,
      recipients: recipients.length,
      sent,
      failed,
      failedDetails: failedDetails.slice(0, 20),
      subject,
    },
    { status: failed > 0 ? 207 : 200 },
  );
}
