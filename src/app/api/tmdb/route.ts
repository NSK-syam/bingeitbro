import { NextRequest, NextResponse } from 'next/server';

const TMDB_HOST = 'api.themoviedb.org';
const SERVER_TMDB_API_KEY = (process.env.TMDB_API_KEY ?? process.env.NEXT_PUBLIC_TMDB_API_KEY ?? '').trim();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const preferredRegion = ['bom1', 'sin1', 'iad1'];

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

  const upstreamUrl = new URL(tmdbUrl.toString());
  if (SERVER_TMDB_API_KEY) {
    // Always use server-side key so stale client bundles / key mismatches
    // cannot break movie loading in specific regions/countries.
    upstreamUrl.searchParams.set('api_key', SERVER_TMDB_API_KEY);
  }

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        // Avoid route-level cache key issues across query variations.
        // Correctness is prioritized over cache hit rate here.
        'Cache-Control': 'no-store',
        'CDN-Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'TMDB fetch failed' }, { status: 502 });
  }
}
