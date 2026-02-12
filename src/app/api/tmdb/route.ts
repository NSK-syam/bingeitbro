import { NextRequest, NextResponse } from 'next/server';

const TMDB_HOST = 'api.themoviedb.org';

function isAllowedTmdbUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.hostname !== TMDB_HOST) return null;
    if (!parsed.pathname.startsWith('/3/')) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url')?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  const tmdbUrl = isAllowedTmdbUrl(rawUrl);
  if (!tmdbUrl) {
    return NextResponse.json({ error: 'Invalid TMDB URL' }, { status: 400 });
  }

  try {
    const upstream = await fetch(tmdbUrl.toString(), {
      headers: {
        Accept: 'application/json',
      },
      next: { revalidate: 60 },
    });

    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        // Cache briefly to reduce retries from regions with poor connectivity to TMDB.
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch {
    return NextResponse.json({ error: 'TMDB fetch failed' }, { status: 502 });
  }
}

