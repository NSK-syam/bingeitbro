import { NextRequest, NextResponse } from 'next/server';

type YoutubeTrailerItem = {
  key: string;
  name: string;
  kind: 'trailer' | 'teaser';
  watchUrl: string;
  embedUrl: string;
  thumb: string;
  source: 'youtube-search';
};

function readBalancedJsonObject(input: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < input.length; i += 1) {
    const char = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;

    if (depth === 0) {
      return input.slice(startIndex, i + 1);
    }
  }

  return null;
}

function extractInitialData(html: string): Record<string, unknown> | null {
  const markers = ['var ytInitialData = ', 'window["ytInitialData"] = ', 'ytInitialData = '];

  for (const marker of markers) {
    const markerIndex = html.indexOf(marker);
    if (markerIndex === -1) continue;

    const firstBrace = html.indexOf('{', markerIndex + marker.length);
    if (firstBrace === -1) continue;

    const jsonText = readBalancedJsonObject(html, firstBrace);
    if (!jsonText) continue;

    try {
      return JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      continue;
    }
  }

  return null;
}

function pickText(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const value = raw as Record<string, unknown>;

  if (typeof value.simpleText === 'string') return value.simpleText;
  if (Array.isArray(value.runs)) {
    return value.runs
      .map((run) => (run && typeof run === 'object' && typeof (run as { text?: unknown }).text === 'string'
        ? (run as { text: string }).text
        : ''))
      .join('');
  }
  return '';
}

const BLOCKED_TERMS = [
  'reaction',
  'review',
  'breakdown',
  'explained',
  'fanmade',
  'fan made',
  'mashup',
  'edit',
  'spoiler',
  'recap',
  'ending',
  'scene',
  'clip',
  'interview',
];

function classifyOfficialKind(title: string): 'trailer' | 'teaser' | null {
  const t = title.toLowerCase();
  const hasOfficial = t.includes('official');
  const hasTrailer = t.includes('trailer');
  const hasTeaser = t.includes('teaser');
  const hasBlockedTerm = BLOCKED_TERMS.some((term) => t.includes(term));

  if (!hasOfficial || hasBlockedTerm) return null;
  if (hasTrailer) return 'trailer';
  if (hasTeaser) return 'teaser';
  return null;
}

function extractVideoRenderers(root: Record<string, unknown>): YoutubeTrailerItem[] {
  const stack: unknown[] = [root];
  const byId = new Map<string, YoutubeTrailerItem>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    const obj = current as Record<string, unknown>;
    const videoRenderer = obj.videoRenderer;

    if (videoRenderer && typeof videoRenderer === 'object' && !Array.isArray(videoRenderer)) {
      const video = videoRenderer as Record<string, unknown>;
      const videoId = typeof video.videoId === 'string' ? video.videoId : '';

      if (videoId && !byId.has(videoId)) {
        const title = pickText(video.title) || 'Trailer';
        const kind = classifyOfficialKind(title);

        if (kind) {
          byId.set(videoId, {
            key: videoId,
            name: title,
            kind,
            watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
            embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&mute=0&rel=0`,
            thumb: `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
            source: 'youtube-search',
          });
        }
      }
    }

    for (const value of Object.values(obj)) stack.push(value);
  }

  return Array.from(byId.values()).sort((a, b) => {
    const aScore = a.kind === 'trailer' ? 1 : 0;
    const bScore = b.kind === 'trailer' ? 1 : 0;
    return bScore - aScore;
  });
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();

  if (!q) {
    return NextResponse.json({ error: 'Missing q query parameter', items: [] }, { status: 400 });
  }

  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 60 * 60 * 6 },
    });

    if (!response.ok) {
      return NextResponse.json({ items: [] });
    }

    const html = await response.text();
    const initialData = extractInitialData(html);

    if (!initialData) {
      return NextResponse.json({ items: [] });
    }

    const items = extractVideoRenderers(initialData).slice(0, 8);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
