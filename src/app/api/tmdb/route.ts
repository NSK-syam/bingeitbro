import { NextRequest, NextResponse } from 'next/server';

const TMDB_HOST = 'api.themoviedb.org';
const SERVER_TMDB_API_KEY = (process.env.TMDB_API_KEY ?? process.env.NEXT_PUBLIC_TMDB_API_KEY ?? '').trim();
const TMDB_REVALIDATE_SECONDS = 900;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const preferredRegion = ['bom1', 'sin1', 'iad1'];

function decodeBase64Url(input: string): string | null {
  try {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

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

function canonicalizeTmdbUrl(url: URL): string {
  const canonical = new URL(url.toString());
  canonical.searchParams.delete('api_key');
  const sorted = [...canonical.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  canonical.search = '';
  for (const [key, value] of sorted) {
    canonical.searchParams.append(key, value);
  }
  return canonical.toString();
}

export async function GET(request: NextRequest) {
  const encodedUrl = request.nextUrl.searchParams.get('u')?.trim();
  const decodedUrl = encodedUrl ? decodeBase64Url(encodedUrl) : null;
  const rawUrl = decodedUrl ?? request.nextUrl.searchParams.get('url')?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  const tmdbUrl = isAllowedTmdbUrl(rawUrl);
  if (!tmdbUrl) {
    return NextResponse.json({ error: 'Invalid TMDB URL' }, { status: 400 });
  }

  const upstreamUrl = new URL(canonicalizeTmdbUrl(tmdbUrl));
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
      next: { revalidate: TMDB_REVALIDATE_SECONDS },
    });

    const body = await upstream.text();
    const isSuccess = upstream.ok;
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': isSuccess
          ? `public, max-age=0, s-maxage=${TMDB_REVALIDATE_SECONDS}, stale-while-revalidate=86400`
          : 'no-store',
        'CDN-Cache-Control': isSuccess
          ? `public, s-maxage=${TMDB_REVALIDATE_SECONDS}, stale-while-revalidate=86400`
          : 'no-store',
        'Surrogate-Control': isSuccess
          ? `max-age=${TMDB_REVALIDATE_SECONDS}, stale-while-revalidate=86400`
          : 'no-store',
        Vary: 'Accept-Encoding',
      },
    });
  } catch {
    return NextResponse.json({ error: 'TMDB fetch failed' }, { status: 502 });
  }
}
