import { NextResponse } from 'next/server';
import { fetchTmdbWithProxy } from '@/lib/tmdb-fetch';

export const runtime = 'edge';

type TriviaLanguage = 'en' | 'te' | 'hi' | 'ta';
type TriviaQuestionType = 'year' | 'director' | 'actor' | 'genre' | 'runtime';

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

async function fetchDiscoverMovies(params: {
  apiKey: string;
  language: TriviaLanguage;
  page: number;
  voteCountMin: number;
  origin?: string;
}): Promise<{ results: unknown[]; totalPages: number }> {
  const base = `https://api.themoviedb.org/3/discover/movie?api_key=${params.apiKey}` +
    `&with_original_language=${params.language}` +
    `&primary_release_date.gte=2000-01-01&primary_release_date.lte=2026-12-31` +
    `&vote_count.gte=${params.voteCountMin}` +
    `&include_adult=false&sort_by=popularity.desc` +
    `&page=${params.page}`;

  try {
    const res = await fetchTmdbWithProxy(base, undefined, { preferProxy: true, origin: params.origin });
    if (!res.ok) return { results: [], totalPages: 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    const totalPages = Number.isFinite(Number(json?.total_pages)) ? Number(json.total_pages) : 0;
    return { results, totalPages };
  } catch {
    return { results: [], totalPages: 0 };
  }
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

function pickRuntimeOptions(correct: number, rand: () => number): { options: string[]; correctIndex: number } {
  const min = 45;
  const max = 240;
  const minutes = new Set<number>([Math.min(max, Math.max(min, Math.round(correct)))]);
  const deltas = [5, 10, 15, 20, 25, 30, 35, 40];
  while (minutes.size < 4) {
    const delta = deltas[Math.floor(rand() * deltas.length)] ?? 15;
    const dir = rand() > 0.5 ? 1 : -1;
    const candidate = Math.min(max, Math.max(min, correct + dir * delta));
    minutes.add(Math.round(candidate));
  }
  const arr = Array.from(minutes).map((m) => `${m} min`);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j]!;
    arr[j] = tmp!;
  }
  return { options: arr, correctIndex: arr.indexOf(`${Math.round(correct)} min`) };
}

function normalizeLanguage(input: string | null): TriviaLanguage {
  const v = String(input || '').trim().toLowerCase();
  if (v === 'en' || v === 'te' || v === 'hi' || v === 'ta') return v;
  return 'en';
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const idx = nextIndex;
      nextIndex += 1;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]!, idx);
    }
  };
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const language = normalizeLanguage(url.searchParams.get('lang'));
  const weekKey = (url.searchParams.get('week') || '').trim() || isoWeekKeyUTC();
  const origin = url.origin;

  const apiKey = (process.env.NEXT_PUBLIC_TMDB_API_KEY || '').trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'TMDB is not configured.' }, { status: 500 });
  }

  const seed = fnv1a32(`${weekKey}:${language}`);
  const rand = xorshift32(seed || 1);

  // Build a stable weekly set, but always include page 1 to avoid empty results
  // when TMDB has only a few pages for a language+filters.
  const collectCandidates = async (voteCountMin: number, pagesWanted: number) => {
    const page1 = await fetchDiscoverMovies({ apiKey, language, page: 1, voteCountMin, origin });
    const maxPages = Math.max(1, Math.min(12, page1.totalPages || 1));
    const pagePool = Array.from({ length: Math.max(0, maxPages - 1) }, (_, i) => i + 2);
    // Seeded shuffle page pool.
    for (let i = pagePool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = pagePool[i];
      pagePool[i] = pagePool[j]!;
      pagePool[j] = tmp!;
    }
    const pages = [1, ...pagePool.slice(0, Math.max(0, pagesWanted - 1))];
    const settled = await Promise.all(
      pages.map((page) => fetchDiscoverMovies({ apiKey, language, page, voteCountMin, origin })),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged: any[] = [];
    for (const s of settled) merged.push(...(Array.isArray(s.results) ? s.results : []));

    const seenIds = new Set<number>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates = merged
      .filter((m: any) => m && typeof m.id === 'number' && typeof m.title === 'string' && typeof m.release_date === 'string')
      .filter((m: any) => {
        const year = Number(String(m.release_date).slice(0, 4));
        return Number.isFinite(year) && year >= 2000 && year <= 2026;
      })
      .filter((m: any) => {
        if (seenIds.has(m.id)) return false;
        seenIds.add(m.id);
        return true;
      });

    // Seeded shuffle candidates to avoid always the same top 10.
    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }
    return candidates;
  };

  // Try strict first; relax if this language has fewer qualifying titles.
  let candidates = await collectCandidates(200, 3);
  if (candidates.length < 10) candidates = await collectCandidates(50, 4);
  if (candidates.length < 10) candidates = await collectCandidates(10, 6);

  const picked = candidates.slice(0, 10);

  type PickedBase = {
    id: number;
    title: string;
    release_date: string;
    poster_path: string | null;
  };
  const basePicked: PickedBase[] = picked
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => ({
      id: m.id as number,
      title: m.title as string,
      release_date: m.release_date as string,
      poster_path: typeof m.poster_path === 'string' ? m.poster_path : null,
    }));

  const details = await mapWithConcurrency(basePicked, 4, async (m) => {
    const detailUrl = `https://api.themoviedb.org/3/movie/${m.id}?api_key=${apiKey}&append_to_response=credits`;
    const res = await fetchTmdbWithProxy(detailUrl, undefined, { preferProxy: true, origin });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = res.ok ? await res.json() : null;
    const year = Number(String(m.release_date).slice(0, 4));
    const poster = m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null;

    const genres: string[] = Array.isArray(json?.genres)
      ? json.genres.map((g: any) => String(g?.name || '')).filter(Boolean)
      : [];

    const runtime = Number.isFinite(Number(json?.runtime)) ? Number(json.runtime) : null;

    const director = Array.isArray(json?.credits?.crew)
      ? (json.credits.crew.find((c: any) => c?.job === 'Director')?.name as string | undefined)
      : undefined;

    const cast: string[] = Array.isArray(json?.credits?.cast)
      ? json.credits.cast.slice(0, 8).map((c: any) => String(c?.name || '')).filter(Boolean)
      : [];

    return {
      tmdbId: m.id,
      title: m.title,
      year,
      poster,
      genres,
      runtime,
      director: director && String(director).trim() ? String(director).trim() : null,
      cast,
    };
  });

  const directorPool = [...new Set(details.map((d) => d.director).filter(Boolean))] as string[];
  const actorPool = [...new Set(details.flatMap((d) => d.cast).filter(Boolean))] as string[];
  const genrePool = [...new Set(details.flatMap((d) => d.genres).filter(Boolean))] as string[];

  const desiredTypes: TriviaQuestionType[] = ['director', 'actor', 'genre', 'runtime', 'year', 'director', 'actor', 'genre', 'runtime', 'year'];
  for (let i = desiredTypes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = desiredTypes[i];
    desiredTypes[i] = desiredTypes[j]!;
    desiredTypes[j] = tmp!;
  }

  const questions = details.map((d, idx) => {
    const type = desiredTypes[idx] ?? 'year';

    const buildYear = () => {
      const { options, correctIndex } = pickYearOptions(d.year, rand);
      return {
        question: `In which year was "${d.title}" released?`,
        options: options.map(String),
        correctIndex,
      };
    };

    const buildDirector = () => {
      if (!d.director) return null;
      const other = directorPool.filter((n) => n !== d.director);
      if (other.length < 3) return null;
      const opts = new Set<string>([d.director]);
      while (opts.size < 4) {
        const pick = other[Math.floor(rand() * other.length)];
        if (pick) opts.add(pick);
      }
      const arr = Array.from(opts);
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j]!;
        arr[j] = tmp!;
      }
      return {
        question: `Who directed "${d.title}"?`,
        options: arr,
        correctIndex: arr.indexOf(d.director),
      };
    };

    const buildActor = () => {
      if (!d.cast.length) return null;
      const correct = d.cast[Math.floor(rand() * Math.min(5, d.cast.length))]!;
      const other = actorPool.filter((n) => n !== correct);
      if (other.length < 3) return null;
      const opts = new Set<string>([correct]);
      while (opts.size < 4) {
        const pick = other[Math.floor(rand() * other.length)];
        if (pick) opts.add(pick);
      }
      const arr = Array.from(opts);
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j]!;
        arr[j] = tmp!;
      }
      return {
        question: `Which actor appears in "${d.title}"?`,
        options: arr,
        correctIndex: arr.indexOf(correct),
      };
    };

    const buildGenre = () => {
      const correct = d.genres[0];
      if (!correct) return null;
      const other = genrePool.filter((g) => g !== correct);
      if (other.length < 3) return null;
      const opts = new Set<string>([correct]);
      while (opts.size < 4) {
        const pick = other[Math.floor(rand() * other.length)];
        if (pick) opts.add(pick);
      }
      const arr = Array.from(opts);
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j]!;
        arr[j] = tmp!;
      }
      return {
        question: `Which genre best fits "${d.title}"?`,
        options: arr,
        correctIndex: arr.indexOf(correct),
      };
    };

    const buildRuntime = () => {
      if (!d.runtime || d.runtime < 30) return null;
      const { options, correctIndex } = pickRuntimeOptions(d.runtime, rand);
      if (correctIndex < 0) return null;
      return {
        question: `About how long is "${d.title}"?`,
        options,
        correctIndex,
      };
    };

    const built =
      (type === 'director' ? buildDirector() : null) ??
      (type === 'actor' ? buildActor() : null) ??
      (type === 'genre' ? buildGenre() : null) ??
      (type === 'runtime' ? buildRuntime() : null) ??
      null;

    const finalBuilt =
      built ??
      buildDirector() ??
      buildActor() ??
      buildGenre() ??
      buildRuntime() ??
      buildYear();

    return {
      id: `${weekKey}:${language}:${d.tmdbId}:${idx}`,
      tmdbId: d.tmdbId,
      title: d.title,
      year: d.year,
      poster: d.poster,
      question: finalBuilt.question,
      options: finalBuilt.options,
      correctIndex: finalBuilt.correctIndex,
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
