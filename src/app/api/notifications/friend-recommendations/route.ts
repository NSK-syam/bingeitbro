import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type RecommendationInput = {
  recipient_id: string;
  movie_title: string;
  movie_year?: number | null;
  personal_message?: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const unosendApiKey = process.env.UNOSEND_API_KEY ?? '';
const unosendFrom = process.env.UNOSEND_FROM ?? '';
const unosendReplyTo = process.env.UNOSEND_REPLY_TO ?? '';
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://bingeitbro.com');

function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const unosendBaseUrl = 'https://www.unosend.co/api/v1';

async function unosendRequest(path: string, payload: unknown) {
  const response = await fetch(`${unosendBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${unosendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

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
    return { ok: false, message };
  }

  return { ok: true, data };
}

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  }
  if (!unosendApiKey || !unosendFrom) {
    return NextResponse.json({ error: 'Email is not configured.' }, { status: 500 });
  }

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { recommendations?: RecommendationInput[] } | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const incoming = Array.isArray(body?.recommendations) ? body!.recommendations : [];
  const recommendations = incoming
    .filter((rec) => rec && typeof rec.recipient_id === 'string' && typeof rec.movie_title === 'string')
    .map((rec) => ({
      recipient_id: rec.recipient_id,
      movie_title: rec.movie_title,
      movie_year: rec.movie_year ?? null,
      personal_message: rec.personal_message ?? null,
    }))
    .slice(0, 50);

  if (recommendations.length === 0) {
    return NextResponse.json({ sent: 0, skipped: incoming.length }, { status: 200 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const sender = userData?.user ?? null;
  if (userError || !sender) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const recipientIds = [...new Set(recommendations.map((rec) => rec.recipient_id))];
  const { data: friends, error: friendsError } = await supabase
    .from('friends')
    .select('friend_id')
    .eq('user_id', sender.id)
    .in('friend_id', recipientIds);

  if (friendsError) {
    return NextResponse.json({ error: friendsError.message }, { status: 500 });
  }

  const allowedRecipients = new Set((friends ?? []).map((row) => row.friend_id));
  const filtered = recommendations.filter((rec) => allowedRecipients.has(rec.recipient_id));
  if (filtered.length === 0) {
    return NextResponse.json({ sent: 0, skipped: recommendations.length }, { status: 200 });
  }

  const { data: senderProfile } = await supabase
    .from('users')
    .select('name')
    .eq('id', sender.id)
    .single();
  const senderName = senderProfile?.name || 'Someone';

  const { data: recipients, error: recipientsError } = await supabase
    .from('users')
    .select('id,name,email')
    .in('id', filtered.map((rec) => rec.recipient_id));

  if (recipientsError) {
    return NextResponse.json({ error: recipientsError.message }, { status: 500 });
  }

  const recipientMap = new Map(
    (recipients ?? []).map((recipient) => [recipient.id, recipient]),
  );

  const emails = filtered.flatMap((rec) => {
    const recipient = recipientMap.get(rec.recipient_id);
    if (!recipient?.email) return [];

    const movieLabel = rec.movie_year ? `${rec.movie_title} (${rec.movie_year})` : rec.movie_title;
    const message = rec.personal_message?.trim();
    const safeMessage = message ? escapeHtml(message) : '';
    const safeMovie = escapeHtml(movieLabel);
    const safeSender = escapeHtml(senderName);
    const safeRecipient = escapeHtml(recipient.name || 'there');
    const link = `${siteUrl}/?view=friends`;

    const subject = `${senderName} sent you a movie recommendation`;
    const textParts = [
      `Hi ${recipient.name || 'there'},`,
      '',
      `${senderName} sent you a recommendation: ${movieLabel}.`,
      message ? `Message: "${message}"` : null,
      '',
      `View it: ${link}`,
    ].filter(Boolean);

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
        <p>Hi ${safeRecipient},</p>
        <p><strong>${safeSender}</strong> sent you a recommendation:</p>
        <p style="font-size:16px;"><strong>${safeMovie}</strong></p>
        ${safeMessage ? `<p style="margin-top:12px;">Message: “${safeMessage}”</p>` : ''}
        <p style="margin-top:16px;"><a href="${link}" style="color:#2563eb">View it on Binge it bro</a></p>
      </div>
    `;

    return [
      {
        from: unosendFrom,
        to: recipient.email,
        subject,
        html,
        text: textParts.join('\n'),
        ...(unosendReplyTo ? { reply_to: unosendReplyTo } : {}),
        tags: {
          email_type: 'friend_recommendation',
          sender_id: sender.id,
          recipient_id: recipient.id,
        },
      },
    ];
  });

  if (emails.length === 0) {
    return NextResponse.json({ sent: 0, skipped: filtered.length }, { status: 200 });
  }

  if (emails.length === 1) {
    const result = await unosendRequest('/emails', emails[0]);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }
    return NextResponse.json({ sent: 1, skipped: filtered.length - 1 }, { status: 200 });
  }

  const batchResult = await unosendRequest('/emails/batch', emails);
  if (!batchResult.ok) {
    return NextResponse.json({ error: batchResult.message }, { status: 500 });
  }

  return NextResponse.json({ sent: emails.length, skipped: filtered.length - emails.length }, { status: 200 });
}
