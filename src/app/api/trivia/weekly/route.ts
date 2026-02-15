import { NextResponse } from 'next/server';
import { fetchTmdbWithProxy } from '@/lib/tmdb-fetch';

type TriviaLanguage = 'en' | 'te' | 'hi' | 'ta';

const LANGUAGE_LABEL: Record<TriviaLanguage, string> = {
  en: 'English',
  te: 'Telugu',
  hi: 'Hindi',
  ta: 'Tamil',
};

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function xorshift32(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

function isoWeekKeyUTC(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday of this week decides the year.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function pickYearOptions(correct: number, rand: () => number): { options: number[]; correctIndex: number } {
  const minYear = 2000;
  const maxYear = 2026;
  const years = new Set<number>([correct]);

  const deltas = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  while (years.size < 4) {
    const delta = deltas[Math.floor(rand() * deltas.length)] ?? 3;
    const dir = rand() > 0.5 ? 1 : -1;
    const candidate = Math.min(maxYear, Math.max(minYear, correct + dir * delta));
    years.add(candidate);
  }

  const arr = Array.from(years);
  // Fisher-Yates shuffle
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j]!;
    arr[j] = tmp!;
  }

  return { options: arr, correctIndex: arr.indexOf(correct) };
}

function normalizeLanguage(input: string | null): TriviaLanguage {
  const v = String(input || '').trim().toLowerCase();
  if (v === 'en' || v === 'te' || v === 'hi' || v === 'ta') return v;
  return 'en';
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const language = normalizeLanguage(url.searchParams.get('lang'));
  const weekKey = (url.searchParams.get('week') || '').trim() || isoWeekKeyUTC();

  const apiKey = (process.env.NEXT_PUBLIC_TMDB_API_KEY || '').trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'TMDB is not configured.' }, { status: 500 });
  }

  const seed = fnv1a32(`${weekKey}:${language}`);
  const rand = xorshift32(seed || 1);
  const pageA = (Math.floor(rand() * 10) % 10) + 1;
  let pageB = (Math.floor(rand() * 10) % 10) + 1;
  if (pageB === pageA) pageB = ((pageB % 10) + 1);

  const base = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}` +
    `&with_original_language=${language}` +
    `&primary_release_date.gte=2000-01-01&primary_release_date.lte=2026-12-31` +
    `&vote_count.gte=200&include_adult=false&sort_by=popularity.desc`;

  const [r1, r2] = await Promise.all([
    fetchTmdbWithProxy(`${base}&page=${pageA}`),
    fetchTmdbWithProxy(`${base}&page=${pageB}`),
  ]);
  const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = [...(d1?.results || []), ...(d2?.results || [])];

  const seen = new Set<number>();
  const candidates = results
    .filter((m) => m && typeof m.id === 'number' && !seen.has(m.id) && typeof m.title === 'string' && typeof m.release_date === 'string')
    .filter((m) => {
      const year = Number(String(m.release_date).slice(0, 4));
      return Number.isFinite(year) && year >= 2000 && year <= 2026;
    })
    .filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

  // Seeded shuffle candidates to avoid always same top 10.
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
  }

  const picked = candidates.slice(0, 10);
  const questions = picked.map((m, idx) => {
    const year = Number(String(m.release_date).slice(0, 4));
    const { options, correctIndex } = pickYearOptions(year, rand);
    const posterPath = typeof m.poster_path === 'string' ? m.poster_path : null;
    const poster = posterPath ? `https://image.tmdb.org/t/p/w342${posterPath}` : null;
    return {
      id: `${weekKey}:${language}:${m.id}:${idx}`,
      tmdbId: m.id,
      title: m.title,
      year,
      poster,
      question: `In which year was "${m.title}" released?`,
      options: options.map(String),
      correctIndex,
    };
  });

  return NextResponse.json(
    {
      weekKey,
      language,
      languageLabel: LANGUAGE_LABEL[language],
      questions,
    },
    {
      headers: {
        // Cache per week+language. Safe to share.
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}

