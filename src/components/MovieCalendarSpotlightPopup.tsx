'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MOVIE_CALENDAR_EVENTS, type MovieCalendarEvent } from '@/data/movie-calendar-events';
import { fetchTmdbWithProxy } from '@/lib/tmdb-fetch';
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/safe-storage';

type SpotlightMovie = {
  id: number;
  title: string;
  releaseDate: string | null;
  posterPath: string | null;
  voteAverage: number;
  popularity: number;
  originalLanguage: string;
};

const STORAGE_KEY_PREFIX = 'bib-movie-calendar-spotlight';
const OPEN_DELAY_MS = 1300;

function getTodayMonthDay(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

function getTodayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getStorageKey(userId: string | null | undefined, todayKey: string, eventId: string): string {
  const identity = userId?.trim() || 'guest';
  return `${STORAGE_KEY_PREFIX}:${identity}:${todayKey}:${eventId}`;
}

function toYear(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  const year = parsed.getFullYear();
  return Number.isFinite(year) ? String(year) : '—';
}

function normalizeResults(input: unknown): SpotlightMovie[] {
  const list = Array.isArray((input as { results?: unknown[] } | null)?.results)
    ? ((input as { results?: unknown[] }).results || [])
    : [];

  return list.flatMap((item): SpotlightMovie[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'number' ? row.id : Number(row.id);
    const title =
      typeof row.title === 'string'
        ? row.title.trim()
        : typeof row.name === 'string'
          ? row.name.trim()
          : '';
    if (!Number.isFinite(id) || !title) return [];

    return [
      {
        id,
        title,
        releaseDate:
          typeof row.release_date === 'string'
            ? row.release_date
            : typeof row.first_air_date === 'string'
              ? row.first_air_date
              : null,
        posterPath: typeof row.poster_path === 'string' ? row.poster_path : null,
        voteAverage: typeof row.vote_average === 'number' ? row.vote_average : 0,
        popularity: typeof row.popularity === 'number' ? row.popularity : 0,
        originalLanguage: typeof row.original_language === 'string' ? row.original_language : '',
      },
    ];
  });
}

type SpotlightMediaType = 'movie' | 'tv';

function getEventQuery(event: MovieCalendarEvent, mediaType: SpotlightMediaType): string {
  if (mediaType === 'tv') {
    return event.showSearchQuery || `${event.movieSearchQuery} series`;
  }
  return event.movieSearchQuery;
}

async function fetchRelatedTitles(
  apiKey: string,
  event: MovieCalendarEvent,
  mediaType: SpotlightMediaType,
): Promise<SpotlightMovie[]> {
  const maxItems = event.id === 'valentines-day' ? 18 : 6;
  if (event.id === 'valentines-day') {
    const discoverPath = mediaType === 'tv' ? 'discover/tv' : 'discover/movie';
    const baseParams = `api_key=${apiKey}&language=en-US&with_genres=10749&sort_by=popularity.desc&vote_count.gte=80&include_adult=false&page=1`;

    const englishUrl = `https://api.themoviedb.org/3/${discoverPath}?${baseParams}&with_original_language=en`;
    const englishRes = await fetchTmdbWithProxy(englishUrl);
    const englishData = await englishRes.json().catch(() => ({}));
    const englishOnly = normalizeResults(englishData)
      .filter((m) => !!m.posterPath && m.originalLanguage === 'en')
      .slice(0, maxItems);

    const regionalLangs = ['te', 'hi', 'ta', 'kn'] as const;
    const regionalLists = await Promise.all(
      regionalLangs.map(async (lang) => {
        const url = `https://api.themoviedb.org/3/${discoverPath}?${baseParams}&with_original_language=${lang}`;
        const res = await fetchTmdbWithProxy(url);
        const data = await res.json().catch(() => ({}));
        return normalizeResults(data)
          .filter((m) => !!m.posterPath && m.originalLanguage === lang)
          .slice(0, 8);
      }),
    );

    const mixedRegional: SpotlightMovie[] = [];
    const maxRegional = maxItems;
    for (let i = 0; i < 8 && mixedRegional.length < maxRegional; i += 1) {
      for (const list of regionalLists) {
        const item = list[i];
        if (item) mixedRegional.push(item);
        if (mixedRegional.length >= maxRegional) break;
      }
    }

    const valentinePack = [...englishOnly, ...mixedRegional];
    if (valentinePack.length > 0) return valentinePack;
  }

  const query = getEventQuery(event, mediaType);
  const searchPath = mediaType === 'tv' ? 'search/tv' : 'search/movie';
  const searchUrl = `https://api.themoviedb.org/3/${searchPath}?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=en-US&include_adult=false&page=1`;
  const searchRes = await fetchTmdbWithProxy(searchUrl);
  const searchData = await searchRes.json().catch(() => ({}));
  let movies = normalizeResults(searchData)
    .sort((a, b) => {
      if (b.voteAverage !== a.voteAverage) return b.voteAverage - a.voteAverage;
      return b.popularity - a.popularity;
    })
    .filter((m) => !!m.posterPath)
    .slice(0, maxItems);

  if (movies.length > 0) return movies;

  const fallbackPath = mediaType === 'tv' ? 'tv/popular' : 'movie/popular';
  const fallbackUrl = `https://api.themoviedb.org/3/${fallbackPath}?api_key=${apiKey}&language=en-US&page=1`;
  const fallbackRes = await fetchTmdbWithProxy(fallbackUrl);
  const fallbackData = await fallbackRes.json().catch(() => ({}));
  movies = normalizeResults(fallbackData)
    .filter((m) => !!m.posterPath)
    .slice(0, maxItems);

  return movies;
}

export function MovieCalendarSpotlightPopup({
  userId,
  mediaType = 'movie',
  openSignal = 0,
  onOpenChange,
}: {
  userId?: string | null;
  mediaType?: SpotlightMediaType;
  openSignal?: number;
  onOpenChange?: (open: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [movies, setMovies] = useState<SpotlightMovie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [todayMonthDay, setTodayMonthDay] = useState(getTodayMonthDay);
  const tmdbApiKey = (process.env.NEXT_PUBLIC_TMDB_API_KEY || '').trim();

  const todayEvent = useMemo(() => {
    return MOVIE_CALENDAR_EVENTS.find((event) => event.monthDay === todayMonthDay) || null;
  }, [todayMonthDay]);

  useEffect(() => {
    const tick = () => setTodayMonthDay(getTodayMonthDay());
    const interval = window.setInterval(tick, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const spotlightQuote = useMemo(() => {
    if (!todayEvent?.quotes || todayEvent.quotes.length === 0) return '';
    const hour = new Date().getHours();
    const idx = hour % todayEvent.quotes.length;
    return todayEvent.quotes[idx] || '';
  }, [todayEvent]);
  const isValentineEvent = todayEvent?.id === 'valentines-day';
  const railA = useMemo(() => {
    if (movies.length === 0) return [] as SpotlightMovie[];
    if (isValentineEvent) {
      const english = movies.filter((m) => m.originalLanguage === 'en');
      return english.length > 0 ? english : movies;
    }
    const everyOther = movies.filter((_, idx) => idx % 2 === 0);
    return everyOther.length > 0 ? everyOther : movies;
  }, [movies, isValentineEvent]);
  const railB = useMemo(() => {
    if (movies.length === 0) return [] as SpotlightMovie[];
    if (isValentineEvent) {
      const regional = movies.filter((m) => ['te', 'hi', 'ta', 'kn'].includes(m.originalLanguage));
      if (regional.length > 0) return regional;
    }
    const everyOther = movies.filter((_, idx) => idx % 2 === 1);
    return everyOther.length > 0 ? everyOther : [...movies].reverse();
  }, [movies, isValentineEvent]);

  useEffect(() => {
    if (!todayEvent) return;
    const todayKey = getTodayKey();
    const storageKey = getStorageKey(userId, todayKey, `${todayEvent.id}:${mediaType}`);
    const shouldPersistSeen = todayEvent.id === 'valentines-day' ? true : !todayEvent.showAllDay;
    if (shouldPersistSeen && safeLocalStorageGet(storageKey)) return;

    const timer = window.setTimeout(() => {
      setIsOpen(true);
      if (shouldPersistSeen) {
        safeLocalStorageSet(storageKey, '1');
      }
    }, OPEN_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [todayEvent, userId, mediaType]);

  useEffect(() => {
    if (!todayEvent) return;
    if (!openSignal) return;
    setIsOpen(true);
  }, [openSignal, todayEvent]);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen || !todayEvent) return;
    if (!tmdbApiKey) {
      setError('TMDB key missing. Add NEXT_PUBLIC_TMDB_API_KEY.');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    void (async () => {
      try {
        const list = await fetchRelatedTitles(tmdbApiKey, todayEvent, mediaType);
        if (!cancelled) {
          setMovies(list);
        }
      } catch {
        if (!cancelled) {
          setError('Could not load related movies right now.');
          setMovies([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, todayEvent, tmdbApiKey, mediaType]);

  if (!todayEvent || !isOpen) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setIsOpen(false)} />

      <div
        className="relative isolate w-full max-w-5xl max-h-[86vh] overflow-y-auto rounded-3xl border border-amber-300/25 bg-[#10131d] p-5 sm:p-7 shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Close calendar spotlight"
        >
          <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <p className="text-[11px] uppercase tracking-[0.25em] text-amber-200/80">
          {mediaType === 'tv' ? 'Series Calendar Spotlight' : 'Movie Calendar Spotlight'}
        </p>
        <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
          {mediaType === 'tv' ? todayEvent.title.replace('Movie', 'Series') : todayEvent.title}
        </h2>
        <p className="mt-1 text-base text-amber-100/85">{todayEvent.subtitle}</p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{todayEvent.description}</p>
        {spotlightQuote && (
          <div className="mt-3 rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2">
            <p className="text-xs uppercase tracking-[0.16em] text-rose-200/80">Valentine Quote</p>
            <p className="mt-1 text-sm italic text-rose-100">&ldquo;{spotlightQuote}&rdquo;</p>
          </div>
        )}

        {loading && (
          <div className="mt-6 flex items-center gap-3 text-sm text-[var(--text-muted)]">
            <div className="w-4 h-4 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
            Loading related movies...
          </div>
        )}

        {!loading && error && (
          <p className="mt-5 text-sm text-red-300">{error}</p>
        )}

        {!loading && !error && movies.length === 0 && (
          <p className="mt-5 text-sm text-[var(--text-muted)]">No related movies found today.</p>
        )}

        {!loading && movies.length > 0 && (
          <>
            {isValentineEvent ? (
              <div className="mt-6 space-y-3">
                <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
                  <div
                    className="flex w-max gap-3"
                    style={{ animation: 'bib-love-scroll-left 45s linear infinite' }}
                  >
                    {[...railA, ...railA].map((movie, idx) => {
                      const poster = movie.posterPath ? `https://image.tmdb.org/t/p/w300${movie.posterPath}` : '';
                      return (
                        <Link
                          key={`rail-a-${movie.id}-${idx}`}
                          href={mediaType === 'tv' ? `/show/tmdbtv-${movie.id}` : `/movie/tmdb-${movie.id}`}
                          prefetch={false}
                          className="w-[170px] sm:w-[180px] rounded-xl overflow-hidden border border-white/10 bg-[var(--bg-secondary)] hover:border-rose-300/55 transition-colors"
                          onClick={() => setIsOpen(false)}
                        >
                          <div className="aspect-[2/3] bg-black/30">
                            {poster ? <img src={poster} alt={movie.title} className="w-full h-full object-cover" /> : null}
                          </div>
                          <div className="p-2.5">
                            <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2">{movie.title}</p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-1">
                              {toYear(movie.releaseDate)} ·  {movie.voteAverage.toFixed(1)}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>

                <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
                  <div
                    className="flex w-max gap-3"
                    style={{ animation: 'bib-love-scroll-right 48s linear infinite' }}
                  >
                    {[...railB, ...railB].map((movie, idx) => {
                      const poster = movie.posterPath ? `https://image.tmdb.org/t/p/w300${movie.posterPath}` : '';
                      return (
                        <Link
                          key={`rail-b-${movie.id}-${idx}`}
                          href={mediaType === 'tv' ? `/show/tmdbtv-${movie.id}` : `/movie/tmdb-${movie.id}`}
                          prefetch={false}
                          className="w-[170px] sm:w-[180px] rounded-xl overflow-hidden border border-white/10 bg-[var(--bg-secondary)] hover:border-rose-300/55 transition-colors"
                          onClick={() => setIsOpen(false)}
                        >
                          <div className="aspect-[2/3] bg-black/30">
                            {poster ? <img src={poster} alt={movie.title} className="w-full h-full object-cover" /> : null}
                          </div>
                          <div className="p-2.5">
                            <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2">{movie.title}</p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-1">
                              {toYear(movie.releaseDate)} ·  {movie.voteAverage.toFixed(1)}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {movies.map((movie) => {
                  const poster = movie.posterPath ? `https://image.tmdb.org/t/p/w300${movie.posterPath}` : '';
                  return (
                    <Link
                      key={movie.id}
                      href={mediaType === 'tv' ? `/show/tmdbtv-${movie.id}` : `/movie/tmdb-${movie.id}`}
                      prefetch={false}
                      className="rounded-xl overflow-hidden border border-white/10 bg-[var(--bg-secondary)] hover:border-amber-300/45 transition-colors"
                      onClick={() => setIsOpen(false)}
                    >
                      <div className="aspect-[2/3] bg-black/30">
                        {poster ? (
                          <img src={poster} alt={movie.title} className="w-full h-full object-cover" />
                        ) : null}
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2">{movie.title}</p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-1">
                          {toYear(movie.releaseDate)} ·  {movie.voteAverage.toFixed(1)}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="mt-6 flex items-center justify-between gap-2">
          <p className="text-xs text-[var(--text-muted)]">Shows once per day on matching calendar dates.</p>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-[#1d1605] bg-gradient-to-r from-amber-300 to-orange-300"
          >
            Got it
          </button>
        </div>
        <style jsx global>{`
          @keyframes bib-love-scroll-left {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          @keyframes bib-love-scroll-right {
            0% { transform: translateX(-50%); }
            100% { transform: translateX(0); }
          }
        `}</style>
      </div>
    </div>
  );
}
