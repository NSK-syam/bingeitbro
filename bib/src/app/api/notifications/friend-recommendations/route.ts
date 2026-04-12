import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildBibEmailTemplate } from '@/lib/email-template';
import { fetchWithTimeoutRetry } from '@/lib/fetch-with-retry';

export const runtime = 'nodejs';

type RecommendationInput = {
  recipient_id: string;
  movie_title: string;
  movie_year?: number | null;
  movie_poster?: string | null;
  tmdb_id?: number | string | null;
  recommendation_id?: string | null;
  personal_message?: string | null;
};

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const unosendApiKey = (process.env.UNOSEND_API_KEY ?? '').trim();
const tmdbApiKey = (process.env.TMDB_API_KEY ?? process.env.NEXT_PUBLIC_TMDB_API_KEY ?? '').trim();
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

  if (EMAIL_RE.test(cleaned)) {
    return cleaned;
  }

  const parts = cleaned.split(/\s+/);
  const last = parts[parts.length - 1];
  if (EMAIL_RE.test(last)) {
    const name = parts.slice(0, -1).join(' ').trim().replace(/^["']+|["']+$/g, '');
    return name ? `${name} <${last}>` : last;
  }

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
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  if (/^http:\/\//i.test(trimmed)) return trimmed;
  if (normalizedSiteUrl && trimmed.startsWith(`${normalizedSiteUrl}/`)) return trimmed;
  return '';
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

const unosendBaseUrl = 'https://www.unosend.co/api/v1';
const UNOSEND_FETCH_OPTIONS = {
  timeoutMs: 12000,
  retries: 2,
  retryDelayMs: 350,
} as const;
const TMDB_FETCH_OPTIONS = {
  timeoutMs: 5000,
  retries: 1,
  retryDelayMs: 200,
} as const;

async function fetchTmdbPosterById(tmdbId: number): Promise<string> {
  if (!tmdbApiKey || !Number.isFinite(tmdbId) || tmdbId <= 0) return '';

  const encodedApiKey = encodeURIComponent(tmdbApiKey);
  const endpoints = [`movie/${tmdbId}`, `tv/${tmdbId}`];

  for (const endpoint of endpoints) {
    const response = await fetchWithTimeoutRetry(
      `https://api.themoviedb.org/3/${endpoint}?api_key=${encodedApiKey}&language=en-US`,
      { method: 'GET' },
      TMDB_FETCH_OPTIONS,
    );
    if (!response.ok) continue;

    const data = (await response.json().catch(() => null)) as { poster_path?: unknown } | null;
    const posterPath = typeof data?.poster_path === 'string' ? data.poster_path : '';
    if (posterPath) {
      return `https://image.tmdb.org/t/p/w500${posterPath}`;
    }
  }

  return '';
}

async function unosendRequest(path: string, payload: unknown) {
  const response = await fetchWithTimeoutRetry(`${unosendBaseUrl}${path}`, {
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
    return { ok: false, message };
  }

  return { ok: true, data };
}

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  }
  if (!unosendApiKey) {
    return NextResponse.json({ error: 'Email provider is not configured.' }, { status: 500 });
  }
  if (!unosendFrom) {
    return NextResponse.json({ error: 'Email "from" address is missing or invalid.' }, { status: 500 });
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
      movie_poster: sanitizePosterUrl(rec.movie_poster),
      tmdb_id:
        typeof rec.tmdb_id === 'number'
          ? rec.tmdb_id
          : typeof rec.tmdb_id === 'string' && /^\d+$/.test(rec.tmdb_id.trim())
            ? Number(rec.tmdb_id.trim())
            : null,
      recommendation_id:
        typeof rec.recommendation_id === 'string'
          ? rec.recommendation_id.trim().slice(0, 120) || null
          : null,
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

  const recommendationPosterMap = new Map<string, string>();
  const recommendationIds = [
    ...new Set(filtered.map((rec) => rec.recommendation_id).filter(Boolean) as string[]),
  ];
  if (recommendationIds.length > 0) {
    const { data: recommendationRows } = await supabase
      .from('recommendations')
      .select('id,poster')
      .in('id', recommendationIds);

    for (const row of recommendationRows ?? []) {
      if (typeof row.id !== 'string') continue;
      const poster = sanitizePosterUrl(
        typeof row.poster === 'string' || row.poster == null ? row.poster : null,
      );
      if (poster) {
        recommendationPosterMap.set(row.id, poster);
      }
    }
  }

  const tmdbPosterCache = new Map<number, string>();
  const resolvedRecommendations = await Promise.all(
    filtered.map(async (rec) => {
      let resolvedPoster = rec.movie_poster;

      if (!resolvedPoster && rec.recommendation_id) {
        resolvedPoster = recommendationPosterMap.get(rec.recommendation_id) ?? '';
      }

      if (!resolvedPoster && rec.tmdb_id != null) {
        if (tmdbPosterCache.has(rec.tmdb_id)) {
          resolvedPoster = tmdbPosterCache.get(rec.tmdb_id) ?? '';
        } else {
          const fetchedPoster = sanitizePosterUrl(await fetchTmdbPosterById(rec.tmdb_id));
          tmdbPosterCache.set(rec.tmdb_id, fetchedPoster);
          resolvedPoster = fetchedPoster;
        }
      }

      return {
        ...rec,
        movie_poster: resolvedPoster,
      };
    }),
  );

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

  const emails = resolvedRecommendations.flatMap((rec) => {
    const recipient = recipientMap.get(rec.recipient_id);
    if (!recipient?.email) return [];

    const movieLabel = rec.movie_year ? `${rec.movie_title} (${rec.movie_year})` : rec.movie_title;
    const message = rec.personal_message?.trim();
    const link = `${siteUrl}/?view=friends`;

    const subject = `${senderName} sent you a movie recommendation`;
    const textParts = [
      `Hi ${recipient.name || 'there'},`,
      '',
      `${senderName} sent you a recommendation: ${movieLabel}.`,
      message ? `Message: "${message}"` : null,
      '',
      `View it: ${link}`,
      '',
      `Inbox tip: If this email lands in Spam, click "Report not spam" and move it to Primary.`,
    ].filter(Boolean);

    const html = buildBibEmailTemplate({
      siteUrl,
      preheader: `${senderName} recommended ${movieLabel}`,
      recipientName: recipient.name || 'there',
      title: `${senderName} sent you a recommendation`,
      intro: 'Your friend thinks this one is worth your time.',
      posterUrl: rec.movie_poster || undefined,
      spotlightLabel: 'Movie Pick',
      spotlightValue: movieLabel,
      messageLabel: message ? 'Personal Note' : undefined,
      messageValue: message || undefined,
      ctaLabel: 'View on Binge it bro',
      ctaUrl: link,
      footerNote: 'If you did not expect this, you can ignore this email.',
      inboxTip: 'If this lands in Spam, click "Report not spam" and move future BiB emails to Primary.',
    });

    return [
      {
        from: unosendFrom,
        to: recipient.email,
        subject,
        html,
        text: textParts.join('\n'),
        ...(unosendReplyTo ? { reply_to: unosendReplyTo } : {}),
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
  if (batchResult.ok) {
    return NextResponse.json({ sent: emails.length, skipped: filtered.length - emails.length }, { status: 200 });
  }

  let sent = 0;
  const failedDetails: string[] = [];
  failedDetails.push(`batch:${batchResult.message}`);
  for (const email of emails) {
    const single = await unosendRequest('/emails', email);
    if (single.ok) {
      sent += 1;
    } else {
      failedDetails.push(`single:${single.message}`);
    }
  }

  return NextResponse.json(
    {
      sent,
      skipped: filtered.length - sent,
      failed: emails.length - sent,
      failedDetails: failedDetails.slice(0, 10),
    },
    { status: sent > 0 ? 200 : 500 },
  );
}
