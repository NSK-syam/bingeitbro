import { NextResponse } from 'next/server';
import { buildBibEmailTemplate } from '@/lib/email-template';
import { fetchWithTimeoutRetry } from '@/lib/fetch-with-retry';
import { getAuthedRequestUser } from '@/lib/server/request-auth';
import { createSupabaseAdminClient } from '@/lib/server/user-blocks';

export const runtime = 'nodejs';

type ReportKind = 'user' | 'direct_message' | 'group_message';

type RequestBody = {
  kind?: unknown;
  targetUserId?: unknown;
  targetMessageId?: unknown;
  groupId?: unknown;
  reason?: unknown;
  details?: unknown;
};

type LoadTargetContextResult =
  | {
    ok: true;
    targetLabel: string;
    messagePreview: string;
    groupLabel: string;
  }
  | {
    ok: false;
    message: string;
    status: number;
  };

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://bingeitbro.com');
const unosendApiKey = (process.env.UNOSEND_API_KEY ?? '').trim();
const unosendBaseUrl = 'https://www.unosend.co/api/v1';
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i;
const UNOSEND_FETCH_OPTIONS = {
  timeoutMs: 12000,
  retries: 2,
  retryDelayMs: 350,
} as const;
const REPORTING_UNAVAILABLE_MESSAGE = 'Reporting is unavailable right now. Please contact support.';
const LEGACY_REPLY_PREFIX = '[[bib_reply_to:';

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

  const parts = cleaned.split(/\s+/);
  const last = parts[parts.length - 1];
  if (EMAIL_RE.test(last)) {
    const name = parts.slice(0, -1).join(' ').trim().replace(/^["']+|["']+$/g, '');
    return name ? `${name} <${last}>` : last;
  }

  return '';
};

const supportInbox = normalizeEmailHeader(process.env.REPORTS_SUPPORT_EMAIL ?? process.env.SUPPORT_EMAIL ?? '');
const unosendFrom = normalizeEmailHeader(process.env.UNOSEND_FROM ?? '');
const unosendReplyTo = normalizeEmailHeader(process.env.UNOSEND_REPLY_TO ?? '');

function trimString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isReportKind(value: unknown): value is ReportKind {
  return value === 'user' || value === 'direct_message' || value === 'group_message';
}

function normalizeLegacyReplyBody(body: string | null | undefined): string {
  const value = body ?? '';
  return value.startsWith('\u2063') ? value.slice(1) : value;
}

function decodeLegacyReplyBody(body: string | null | undefined, replyToId?: string | null): string {
  const rawBody = body ?? '';
  if (rawBody.startsWith('\u2063')) return rawBody.slice(1);

  const normalizedBody = normalizeLegacyReplyBody(rawBody);
  if (replyToId) return normalizedBody;

  const raw = normalizedBody.trimStart();
  if (!raw.startsWith(LEGACY_REPLY_PREFIX)) return normalizedBody;

  const prefixEnd = raw.indexOf(']]');
  if (prefixEnd === -1) return normalizedBody;
  return raw.slice(prefixEnd + 2).replace(/^\s+/, '');
}

function isMissingReplyColumnError(message: string, table: 'direct_messages' | 'watch_group_messages'): boolean {
  const lower = message.toLowerCase();
  return lower.includes('schema cache') || (lower.includes('reply_to_id') && lower.includes('column') && lower.includes(table));
}

async function unosendRequest(payload: unknown) {
  const response = await fetchWithTimeoutRetry(`${unosendBaseUrl}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${unosendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, UNOSEND_FETCH_OPTIONS);

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error?: { message?: string } }).error?.message || response.statusText)
        : typeof data === 'object' && data !== null && 'message' in data
          ? String((data as { message?: string }).message || response.statusText)
          : response.statusText || 'Request failed';
    throw new Error(message);
  }
}

async function loadTargetContext(
  reporterUserId: string,
  kind: ReportKind,
  targetUserId: string,
  targetMessageId: string,
  groupId: string,
): Promise<LoadTargetContextResult> {
  const admin = createSupabaseAdminClient();

  const loadUserLabel = async (userId: string): Promise<string> => {
    if (!userId) return '';
    const authUser = await admin.auth.admin.getUserById(userId);
    const metadata = authUser.data.user?.user_metadata;
    const name =
      typeof metadata?.name === 'string'
        ? metadata.name
        : typeof metadata?.full_name === 'string'
          ? metadata.full_name
          : '';
    const email = typeof authUser.data.user?.email === 'string' ? authUser.data.user.email : '';
    return [name.trim(), email.trim()].filter(Boolean).join(' · ') || userId;
  };

  let targetLabel = targetUserId;
  if (targetUserId) {
    targetLabel = await loadUserLabel(targetUserId);
  }

  let messagePreview = '';
  if (kind === 'direct_message' && targetMessageId) {
    let data:
      | { body?: string | null; sender_id?: string | null; recipient_id?: string | null; reply_to_id?: string | null }
      | null = null;
    const primaryResult = await admin
      .from('direct_messages')
      .select('body,sender_id,recipient_id,reply_to_id')
      .eq('id', targetMessageId)
      .maybeSingle();
    if (primaryResult.error && isMissingReplyColumnError(primaryResult.error.message ?? '', 'direct_messages')) {
      const fallbackResult = await admin
        .from('direct_messages')
        .select('body,sender_id,recipient_id')
        .eq('id', targetMessageId)
        .maybeSingle();
      data = fallbackResult.data;
    } else if (primaryResult.error) {
      throw new Error(primaryResult.error.message || 'Failed to load message.');
    } else {
      data = primaryResult.data;
    }

    if (!data) {
      return { ok: false, message: 'Message not found.', status: 404 };
    }

    const senderId = typeof data.sender_id === 'string' ? data.sender_id : '';
    const recipientId = typeof data.recipient_id === 'string' ? data.recipient_id : '';
    if (reporterUserId !== senderId && reporterUserId !== recipientId) {
      return { ok: false, message: 'Not allowed to report this message.', status: 403 };
    }

    const derivedTargetUserId = senderId === reporterUserId ? recipientId : senderId;
    targetLabel = await loadUserLabel(derivedTargetUserId);
    messagePreview = trimString(decodeLegacyReplyBody(data?.body, data?.reply_to_id), 400);
  }

  let groupLabel = '';
  if (kind === 'group_message' && targetMessageId) {
    let data:
      | { body?: string | null; group_id?: string | null; sender_id?: string | null; reply_to_id?: string | null }
      | null = null;
    const primaryResult = await admin
      .from('watch_group_messages')
      .select('body,group_id,sender_id,reply_to_id')
      .eq('id', targetMessageId)
      .maybeSingle();
    if (primaryResult.error && isMissingReplyColumnError(primaryResult.error.message ?? '', 'watch_group_messages')) {
      const fallbackResult = await admin
        .from('watch_group_messages')
        .select('body,group_id,sender_id')
        .eq('id', targetMessageId)
        .maybeSingle();
      data = fallbackResult.data;
    } else if (primaryResult.error) {
      throw new Error(primaryResult.error.message || 'Failed to load message.');
    } else {
      data = primaryResult.data;
    }

    if (!data) {
      return { ok: false, message: 'Message not found.', status: 404 };
    }

    messagePreview = trimString(decodeLegacyReplyBody(data?.body, data?.reply_to_id), 400);
    if (!groupId && typeof data?.group_id === 'string') {
      groupId = data.group_id;
    }

    const resolvedGroupId = typeof data?.group_id === 'string' ? data.group_id : groupId;
    groupId = resolvedGroupId;
    const { data: membership } = await admin
      .from('watch_group_members')
      .select('user_id')
      .eq('group_id', resolvedGroupId)
      .eq('user_id', reporterUserId)
      .maybeSingle();
    if (!membership) {
      return { ok: false, message: 'Not allowed to report this group message.', status: 403 };
    }

    const senderId = typeof data.sender_id === 'string' ? data.sender_id : '';
    targetLabel = await loadUserLabel(senderId);
  }

  if (groupId) {
    const { data } = await admin
      .from('watch_groups')
      .select('name')
      .eq('id', groupId)
      .maybeSingle();
    groupLabel = trimString(data?.name, 120) || groupId;
  }

  return { ok: true, targetLabel, messagePreview, groupLabel };
}

export async function POST(request: Request) {
  try {
    if (!unosendApiKey || !unosendFrom || !supportInbox) {
      return NextResponse.json({ message: REPORTING_UNAVAILABLE_MESSAGE }, { status: 503 });
    }

    const authedUser = await getAuthedRequestUser(request);
    if (!authedUser?.id) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    if (!isReportKind(body?.kind)) {
      return NextResponse.json({ message: 'Invalid report type.' }, { status: 400 });
    }

    const kind = body.kind;
    const targetUserId = trimString(body?.targetUserId, 120);
    const targetMessageId = trimString(body?.targetMessageId, 120);
    const groupId = trimString(body?.groupId, 120);
    const reason = trimString(body?.reason, 80);
    const details = trimString(body?.details, 1000);

    if (!reason) {
      return NextResponse.json({ message: 'Please choose a reason for this report.' }, { status: 400 });
    }
    if (kind === 'user' && !targetUserId) {
      return NextResponse.json({ message: 'A user report must include a target user.' }, { status: 400 });
    }
    if ((kind === 'direct_message' || kind === 'group_message') && !targetMessageId) {
      return NextResponse.json({ message: 'A message report must include a target message.' }, { status: 400 });
    }

    let targetLabel = '';
    let messagePreview = '';
    let groupLabel = '';
    try {
      const targetContext = await loadTargetContext(
        authedUser.id,
        kind,
        targetUserId,
        targetMessageId,
        groupId,
      );
      if (!targetContext.ok) {
        return NextResponse.json({ message: targetContext.message }, { status: targetContext.status });
      }
      ({ targetLabel, messagePreview, groupLabel } = targetContext);
    } catch (error) {
      if (error instanceof Error && error.message === 'User blocking is unavailable right now.') {
        console.error('[reports] admin context unavailable', error);
        return NextResponse.json({ message: REPORTING_UNAVAILABLE_MESSAGE }, { status: 503 });
      }
      throw error;
    }

    const title =
      kind === 'user'
        ? `Safety report: user profile`
        : kind === 'group_message'
          ? `Safety report: group message`
          : `Safety report: direct message`;

    const html = buildBibEmailTemplate({
      siteUrl,
      preheader: `New BiB safety report: ${reason}`,
      recipientName: 'BiB support',
      title,
      intro: `${authedUser.name?.trim() || authedUser.email || 'A user'} submitted a safety report from the app.`,
      spotlightLabel: 'Report reason',
      spotlightValue: reason,
      messageLabel: 'Report details',
      messageValue: [
        `Reporter: ${authedUser.name?.trim() || 'Unknown'} (${authedUser.email || authedUser.id})`,
        `Kind: ${kind}`,
        targetLabel ? `Target: ${targetLabel}` : '',
        groupLabel ? `Group: ${groupLabel}` : '',
        messagePreview ? `Message preview: ${messagePreview}` : '',
        details ? `Additional details: ${details}` : '',
      ].filter(Boolean).join('\n'),
      ctaLabel: 'Open BiB support',
      ctaUrl: `${String(siteUrl).replace(/\/+$/, '')}/support`,
      footerNote: 'Review this report and take action if the content violates BiB policies.',
      inboxTip: 'You can reply directly to the support inbox if follow-up is needed.',
    });

    await unosendRequest({
      from: unosendFrom,
      to: [supportInbox],
      ...(unosendReplyTo ? { reply_to: unosendReplyTo } : {}),
      subject: `[BiB] Safety report: ${reason}`,
      html,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[reports] failed to submit report', error);
    return NextResponse.json({ message: 'Failed to submit report.' }, { status: 500 });
  }
}
