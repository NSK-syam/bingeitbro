import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 10;

type AppleSong = { artworkUrl100?: string | null };

function toBiggerArtwork(url: string): string {
  return url.replace(/\/100x100bb\.jpg$/i, '/300x300bb.jpg');
}

async function fetchAppleMostPlayed(country: string, limit: number): Promise<string[]> {
  const safeCountry = country.toLowerCase().trim();
  const safeLimit = Math.max(10, Math.min(100, Math.floor(limit)));
  const url = `https://rss.marketingtools.apple.com/api/v2/${safeCountry}/music/most-played/${safeLimit}/songs.json`;
  const res = await fetch(url, { next: { revalidate: 60 * 60 } }); // 1h
  if (!res.ok) return [];
  const json = (await res.json().catch(() => null)) as any;
  const results = json?.feed?.results;
  const list: AppleSong[] = Array.isArray(results) ? results : [];
  const out: string[] = [];
  for (const s of list) {
    const raw = String(s?.artworkUrl100 || '').trim();
    if (!raw) continue;
    out.push(toBiggerArtwork(raw));
  }
  return out;
}

function interleave(lists: Record<string, string[]>): string[] {
  const keys = Object.keys(lists);
  const maxLen = Math.max(0, ...keys.map((k) => lists[k]?.length || 0));
  const seen = new Set<string>();
  const merged: string[] = [];
  for (let i = 0; i < maxLen; i += 1) {
    for (const k of keys) {
      const url = lists[k]?.[i];
      if (!url) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      merged.push(url);
    }
  }
  return merged;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const countriesParam = (searchParams.get('countries') || '').trim();
  const limitParam = Number(searchParams.get('limit') || '100');

  // Defaults designed to cover: English + India (Hindi/Telugu/Tamil mix) + Spanish markets.
  const countries =
    countriesParam.length > 0
      ? countriesParam
          .split(',')
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 8)
      : (['us', 'gb', 'in', 'es', 'mx'] as const);

  const limit = Number.isFinite(limitParam) ? Math.max(20, Math.min(100, Math.floor(limitParam))) : 100;

  const settled = await Promise.allSettled(countries.map((c) => fetchAppleMostPlayed(c, limit)));
  const lists: Record<string, string[]> = {};
  for (let i = 0; i < countries.length; i += 1) {
    const r = settled[i];
    lists[countries[i]] = r.status === 'fulfilled' ? r.value : [];
  }

  const merged = interleave(lists);
  return NextResponse.json(
    { countries, count: merged.length, artworks: merged },
    {
      headers: {
        // Cache at the edge for 1 hour, allow stale for a day.
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}
