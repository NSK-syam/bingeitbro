'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { SendToFriendModal } from './SendToFriendModal';
import { ScheduleWatchButton } from './ScheduleWatchButton';
import { WatchlistPlusButton } from './WatchlistPlusButton';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';
import { fetchTmdbWithProxy } from '@/lib/tmdb-fetch';
import { OTT_PROVIDERS, getImageUrl, getLanguageName, getTVWatchProviders, normalizeWatchProviderKey, resolveOttProvider, tmdbWatchProvidersToOttLinks, type TMDBTV, type TMDBTVSearchResult } from '@/lib/tmdb';


type TrendingShow = TMDBTV;

const showCache = new Map<string, { items: TrendingShow[]; ts: number }>();

type ProviderLogoItem = { name: string; url: string };
const PROVIDER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const providerCache = new Map<string, { logos: ProviderLogoItem[]; link?: string; ts: number }>();

const TV_GENRES: Array<{ id: number; name: string }> = [
  { id: 10759, name: 'Action & Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 9648, name: 'Mystery' },
  { id: 10765, name: 'Sci-Fi & Fantasy' },
  { id: 10768, name: 'War & Politics' },
];

async function fetchShows(args: {
  searchQuery: string;
  country: 'IN' | 'US';
  lang: string;
  genre: string;
  year: string;
  ott: string;
  sort: string;
}): Promise<TrendingShow[]> {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey) return [];

  const key = [
    `q:${args.searchQuery || ''}`,
    `c:${args.country}`,
    `lang:${args.lang || ''}`,
    `genre:${args.genre || ''}`,
    `year:${args.year || ''}`,
    `ott:${args.ott || ''}`,
    `sort:${args.sort || ''}`,
  ].join('|');
  const cached = showCache.get(key);
  if (cached && Date.now() - cached.ts < 5 * 60_000) return cached.items;

  const base = 'https://api.themoviedb.org/3';
  const q = args.searchQuery.trim();
  const hasFilters = Boolean(args.lang || args.genre || args.year || args.ott || args.sort);
  const sortParam = args.sort || 'date';
  const sortByMap: Record<string, string> = {
    date: 'first_air_date.desc',
    rating: 'vote_average.desc',
    popularity: 'popularity.desc',
  };
  const sortBy = sortByMap[sortParam] || sortByMap.date;

  const resolvedOtt = resolveOttProvider(args.ott);
  const numericOtt = args.ott && /^\d+$/.test(args.ott) ? Number(args.ott) : null;
  const ottId = resolvedOtt?.ids[args.country] ?? (resolvedOtt ? undefined : numericOtt ?? undefined);
  if (args.ott && !ottId) {
    showCache.set(key, { items: [], ts: Date.now() });
    return [];
  }

  const genrePart = args.genre ? `&with_genres=${args.genre}` : '';
  const yearPart = args.year ? `&first_air_date_year=${args.year}` : '';
  const ottPart = ottId ? `&with_watch_providers=${ottId}` : '';

  const urls = q
    ? [
      `${base}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(q)}&page=1&include_adult=false`,
    ]
    : (() => {
      if (!hasFilters) {
        return [
          `${base}/tv/popular?api_key=${apiKey}&language=en-US&page=1`,
          `${base}/tv/top_rated?api_key=${apiKey}&language=en-US&page=1`,
          `${base}/discover/tv?api_key=${apiKey}&with_original_language=te&sort_by=popularity.desc&page=1`,
          `${base}/discover/tv?api_key=${apiKey}&with_original_language=hi&sort_by=popularity.desc&page=1`,
          `${base}/discover/tv?api_key=${apiKey}&with_original_language=ta&sort_by=popularity.desc&page=1`,
          `${base}/discover/tv?api_key=${apiKey}&with_original_language=ml&sort_by=popularity.desc&page=1`,
          `${base}/discover/tv?api_key=${apiKey}&with_original_language=kn&sort_by=popularity.desc&page=1`,
          `${base}/discover/tv?api_key=${apiKey}&with_original_language=ko&sort_by=popularity.desc&page=1`,
          `${base}/discover/tv?api_key=${apiKey}&with_original_language=ja&sort_by=popularity.desc&page=1`,
        ];
      }

      const defaultLangs = ['en', 'hi', 'te', 'ta', 'kn'];
      const langs = args.lang ? [args.lang] : defaultLangs;
      const maxPages = 4;
      const pages = Array.from({ length: maxPages }, (_, i) => i + 1);
      const discoverBase = `${base}/discover/tv?api_key=${apiKey}&sort_by=${sortBy}&watch_region=${args.country}&with_watch_monetization_types=flatrate${genrePart}${yearPart}${ottPart}`;
      const out: string[] = [];
      for (const lang of langs) {
        for (const page of pages) {
          out.push(`${discoverBase}&with_original_language=${lang}&page=${page}`);
        }
      }
      return out;
    })();

  const responses = await Promise.all(urls.map((u) => fetchTmdbWithProxy(u)));
  const payloads = await Promise.all(responses.map((r) => r.json().catch(() => null)));
  const flat: TrendingShow[] = [];

  for (const p of payloads) {
    const results = (p as TMDBTVSearchResult | null)?.results;
    if (!Array.isArray(results)) continue;
    for (const s of results) {
      if (!s?.poster_path) continue;
      flat.push(s);
    }
  }

  let list = flat;
  if (q) {
    // Client-side filters for search results (OTT filter is not applied for search).
    if (args.lang) list = list.filter((s) => s.original_language === args.lang);
    if (args.genre) {
      const g = Number(args.genre);
      if (Number.isFinite(g)) list = list.filter((s) => Array.isArray(s.genre_ids) && s.genre_ids.includes(g));
    }
    if (args.year) {
      const y = String(args.year);
      list = list.filter((s) => (s.first_air_date || '').startsWith(y));
    }
  }

  // Dedup by id and shuffle slightly
  const byId = new Map<number, TrendingShow>();
  for (const s of list) byId.set(s.id, s);
  const deduped = Array.from(byId.values()).filter((s) => (s.vote_average ?? 0) > 0);

  const sorted = (() => {
    if (!hasFilters && !q) return deduped.sort(() => Math.random() - 0.5);
    if (sortParam === 'rating') return [...deduped].sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));
    if (sortParam === 'popularity') return [...deduped].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    return [...deduped].sort((a, b) => new Date(b.first_air_date || '1900-01-01').getTime() - new Date(a.first_air_date || '1900-01-01').getTime());
  })();

  showCache.set(key, { items: sorted, ts: Date.now() });
  return sorted;
}

interface TrendingShowsProps {
  searchQuery?: string;
  country?: 'IN' | 'US';
}

export function TrendingShows({ searchQuery = '', country = 'IN' }: TrendingShowsProps) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [items, setItems] = useState<TrendingShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [providerLogos, setProviderLogos] = useState<Record<number, { logos: ProviderLogoItem[]; link?: string }>>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedDecade, setExpandedDecade] = useState<number | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [pauseHeroAutoSlide, setPauseHeroAutoSlide] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const [sendModal, setSendModal] = useState<{
    title: string;
    poster: string;
    year?: number;
    recommendationId: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const selectedLang = searchParams.get('lang') || '';
        const selectedGenre = searchParams.get('genre') || '';
        const selectedYear = searchParams.get('year') || '';
        const selectedOtt = searchParams.get('ott') || '';
        const sortParam = searchParams.get('sort') || 'date';

        const res = await fetchShows({
          searchQuery,
          country,
          lang: selectedLang,
          genre: selectedGenre,
          year: selectedYear,
          ott: selectedOtt,
          sort: sortParam,
        });
        if (!cancelled) setItems(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load shows');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchQuery, searchParams, country]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    if (filterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [filterOpen]);

  const selectedLang = searchParams.get('lang') || '';
  const selectedGenre = searchParams.get('genre') || '';
  const selectedYear = searchParams.get('year') || '';
  const selectedOtt = searchParams.get('ott') || '';
  const sortParam = searchParams.get('sort') || 'date';

  const resolvedOttProvider = useMemo(() => resolveOttProvider(selectedOtt), [selectedOtt]);
  const activeOttKey = resolvedOttProvider?.key ?? selectedOtt;

  const updateFilters = (updates: { lang?: string; genre?: string; year?: string; sort?: string; ott?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (updates.lang !== undefined) {
      if (updates.lang) params.set('lang', updates.lang); else params.delete('lang');
    }
    if (updates.genre !== undefined) {
      if (updates.genre) params.set('genre', updates.genre); else params.delete('genre');
    }
    if (updates.year !== undefined) {
      if (updates.year) params.set('year', updates.year); else params.delete('year');
    }
    if (updates.sort !== undefined) {
      if (updates.sort) params.set('sort', updates.sort); else params.delete('sort');
    }
    if (updates.ott !== undefined) {
      if (updates.ott) params.set('ott', updates.ott); else params.delete('ott');
    }
    const qs = params.toString();
    const base = pathname && pathname.startsWith('/') ? pathname : '/shows';
    router.push(qs ? `${base}?${qs}` : base, { scroll: false });
  };

  const currentYear = new Date().getFullYear();
  const MIN_YEAR = 1980;
  const MAX_YEAR = 2026;
  const DECADES = useMemo(() => {
    const list: number[] = [];
    for (let d = Math.min(currentYear, MAX_YEAR); d >= MIN_YEAR; d -= 10) {
      list.push(Math.floor(d / 10) * 10);
    }
    return [...new Set(list)].sort((a, b) => b - a);
  }, [currentYear]);
  const getYearsInDecade = (decade: number) => {
    const start = decade;
    const end = Math.min(decade + 9, MAX_YEAR);
    return Array.from({ length: end - start + 1 }, (_, i) => end - i);
  };

  const ensureSeriesRecommendationId = useCallback(
    async (show: TrendingShow): Promise<string> => {
      if (!user) throw new Error('Not signed in');
      if (!isSupabaseConfigured()) throw new Error('Server is not configured');
      const supabase = createClient();

      const { data: existing } = await supabase
        .from('recommendations')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', 'series')
        .eq('tmdb_id', show.id)
        .limit(1);

      if (Array.isArray(existing) && existing[0]?.id) return existing[0].id as string;

      const year = show.first_air_date ? new Date(show.first_air_date).getFullYear() : new Date().getFullYear();
      const poster = getImageUrl(show.poster_path);
      const backdrop = getImageUrl(show.backdrop_path, 'original');

      const { data: inserted, error: insertError } = await supabase
        .from('recommendations')
        .insert({
          user_id: user.id,
          title: show.name,
          original_title: show.original_name && show.original_name !== show.name ? show.original_name : null,
          year,
          type: 'series',
          poster,
          backdrop,
          genres: [],
          language: getLanguageName(show.original_language),
          duration: null,
          rating: show.vote_average ? Math.round(show.vote_average * 10) / 10 : null,
          personal_note: 'Recommended',
          mood: [],
          watch_with: null,
          ott_links: [],
          tmdb_id: show.id,
        })
        .select('id')
        .single();

      if (insertError || !inserted?.id) {
        throw new Error(insertError?.message || 'Failed to create recommendation');
      }
      return inserted.id as string;
    },
    [user],
  );

  const visible = useMemo(() => items.slice(0, 48), [items]);
  const topHeroShows = useMemo(() => items.slice(0, 5), [items]);
  const showHeroCarousel = !searchQuery.trim() && topHeroShows.length > 0;
  const activeHeroIndex = topHeroShows.length > 0 ? heroIndex % topHeroShows.length : 0;

  useEffect(() => {
    if (!showHeroCarousel || pauseHeroAutoSlide || topHeroShows.length < 2) return;

    const intervalId = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % topHeroShows.length);
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [showHeroCarousel, pauseHeroAutoSlide, topHeroShows.length]);

  const goToPrevHero = () => {
    if (topHeroShows.length < 2) return;
    setHeroIndex((prev) => (prev - 1 + topHeroShows.length) % topHeroShows.length);
  };

  const goToNextHero = () => {
    if (topHeroShows.length < 2) return;
    setHeroIndex((prev) => (prev + 1) % topHeroShows.length);
  };

  useEffect(() => {
    // Country affects watch providers; reset derived state for a clean switch.
    setProviderLogos({});
  }, [country]);

  useEffect(() => {
    if (loading || visible.length === 0) return;

    let cancelled = false;
    const targets = visible.map((s) => s.id);
    const showById = new Map<number, TrendingShow>(visible.map((s) => [s.id, s]));

    const hydrateFromCache = () => {
      const fromCache: Record<number, { logos: ProviderLogoItem[]; link?: string }> = {};
      for (const id of targets) {
        const cached = providerCache.get(`${country}:${id}`);
        if (cached && Date.now() - cached.ts < PROVIDER_CACHE_TTL_MS) {
          fromCache[id] = { logos: cached.logos, link: cached.link };
        }
      }
      if (Object.keys(fromCache).length > 0) {
        setProviderLogos((prev) => ({ ...fromCache, ...prev }));
      }
    };

    hydrateFromCache();

    const queue = targets.filter((id) => {
      const cached = providerCache.get(`${country}:${id}`);
      return !(cached && Date.now() - cached.ts < PROVIDER_CACHE_TTL_MS);
    });

    const concurrency = 6;

    const runQueue = async () => {
      const workers = Array.from({ length: concurrency }).map(async () => {
        while (queue.length > 0 && !cancelled) {
          const id = queue.shift();
          if (!id) break;
          try {
            const show = showById.get(id);
            const providers = await getTVWatchProviders(id);
            if (cancelled) return;

            const region = (country === 'IN' ? providers?.results?.IN : providers?.results?.US) as Record<string, unknown> | undefined;
            const link = (region?.link as string | undefined) ?? undefined;
            const ottLinksAll = tmdbWatchProvidersToOttLinks(providers, show?.name || 'TV', id, 'tv');
            const want = country === 'IN' ? 'india' : 'usa';
            const ottLinks = (ottLinksAll || []).filter((l) => {
              const ai = (l.availableIn || '').toLowerCase();
              if (!ai) return true;
              return ai.includes(want);
            });

            const byProvider = new Map<string, ProviderLogoItem>();
            for (const l of ottLinks) {
              if (!l.logoPath) continue;
              const k = normalizeWatchProviderKey(l.platform);
              if (!k || byProvider.has(k)) continue;
              byProvider.set(k, {
                name: l.platform,
                url: `https://image.tmdb.org/t/p/w92${l.logoPath}`,
              });
            }
            const logos: ProviderLogoItem[] = Array.from(byProvider.values()).slice(0, 8);

            providerCache.set(`${country}:${id}`, { logos, link, ts: Date.now() });
            setProviderLogos((prev) => (prev[id] ? prev : { ...prev, [id]: { logos, link } }));
          } catch {
            providerCache.set(`${country}:${id}`, { logos: [], ts: Date.now() });
            setProviderLogos((prev) => (prev[id] ? prev : { ...prev, [id]: { logos: [] } }));
          }
        }
      });
      await Promise.all(workers);
    };

    void runQueue();
    return () => {
      cancelled = true;
    };
  }, [visible, loading, country]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[var(--bg-card)] border border-white/10 rounded-2xl p-4 text-sm text-red-300">
        {error}
      </div>
    );
  }

  return (
    <>
      {/* Filter button + dropdown (same as Movies) */}
      <div ref={filterRef} className="relative mb-6">
        <button
          type="button"
          onClick={() => setFilterOpen((o) => !o)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all border ${filterOpen
            ? 'bg-[var(--accent)] text-[var(--bg-primary)] border-[var(--accent)]'
            : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-white/10 hover:bg-[var(--bg-card)] hover:border-white/20'
            }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          {(selectedLang || selectedGenre || selectedYear || selectedOtt) && (
            <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[var(--bg-primary)]/20 text-xs">
              {[selectedLang, selectedGenre, selectedYear, selectedOtt].filter(Boolean).length}
            </span>
          )}
          <svg className={`w-4 h-4 transition-transform ${filterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {filterOpen && (
          <div className="absolute left-0 top-full mt-2 z-50 w-[min(100%,420px)] max-h-[80vh] overflow-y-auto bg-[var(--bg-secondary)] rounded-2xl border border-white/10 shadow-xl p-4 space-y-4">
            {(selectedLang || selectedGenre || selectedYear || selectedOtt) && (
              <button
                type="button"
                onClick={() => {
                  setExpandedDecade(null);
                  updateFilters({ lang: '', genre: '', year: '', ott: '', sort: 'date' });
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all border border-red-500/30"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear all filters
              </button>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--text-muted)] w-20">Language:</span>
              {[
                { name: 'English', code: 'en' },
                { name: 'Hindi', code: 'hi' },
                { name: 'Telugu', code: 'te' },
                { name: 'Tamil', code: 'ta' },
                { name: 'Malayalam', code: 'ml' },
                { name: 'Kannada', code: 'kn' },
                { name: 'Korean', code: 'ko' },
                { name: 'Japanese', code: 'ja' },
              ].map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => updateFilters({ lang: selectedLang === lang.code ? '' : lang.code })}
                  className={`px-3 py-1.5 text-sm rounded-full transition-all ${selectedLang === lang.code
                    ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                    : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                    }`}
                >
                  {lang.name}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--text-muted)] w-20">Genre:</span>
              <button
                onClick={() => updateFilters({ genre: '' })}
                className={`px-3 py-1.5 text-sm rounded-full transition-all ${!selectedGenre
                  ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                  }`}
              >
                All
              </button>
              {TV_GENRES.slice(0, 12).map((g) => (
                <button
                  key={g.id}
                  onClick={() => updateFilters({ genre: selectedGenre === String(g.id) ? '' : String(g.id) })}
                  className={`px-3 py-1.5 text-sm rounded-full transition-all ${selectedGenre === String(g.id)
                    ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                    : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                    }`}
                >
                  {g.name}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--text-muted)] w-20">Year:</span>
                <button
                  onClick={() => updateFilters({ year: '' })}
                  className={`px-3 py-1.5 text-sm rounded-full transition-all ${!selectedYear
                    ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                    : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                    }`}
                >
                  Any
                </button>
                {DECADES.map((decade) => (
                  <button
                    key={decade}
                    onClick={() => setExpandedDecade((prev) => (prev === decade ? null : decade))}
                    className={`px-3 py-1.5 text-sm rounded-full transition-all ${expandedDecade === decade
                      ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-primary)]'
                      : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                      }`}
                  >
                    {decade}s
                  </button>
                ))}
              </div>
              {expandedDecade !== null && (
                <div className="flex flex-wrap items-center gap-2 pl-20">
                  {getYearsInDecade(expandedDecade).map((y) => (
                    <button
                      key={y}
                      onClick={() => updateFilters({ year: selectedYear === String(y) ? '' : String(y) })}
                      className={`px-3 py-1.5 text-sm rounded-full transition-all ${selectedYear === String(y)
                        ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                        : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--text-muted)] w-20">OTT:</span>
              <button
                onClick={() => updateFilters({ ott: '' })}
                className={`px-3 py-1.5 text-sm rounded-full transition-all ${!selectedOtt
                  ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                  }`}
              >
                All
              </button>
              {OTT_PROVIDERS.map((p) => {
                const availableInCountry = Boolean(p.ids[country]);
                const availabilityHint = !availableInCountry
                  ? (p.ids.IN ? 'IN only' : p.ids.US ? 'US only' : '')
                  : '';

                return (
                  <button
                    key={p.key}
                    onClick={() => {
                      if (!availableInCountry) return;
                      updateFilters({ ott: activeOttKey === p.key ? '' : p.key });
                    }}
                    disabled={!availableInCountry}
                    title={!availableInCountry ? `Available in ${availabilityHint.replace(' only', '')}` : undefined}
                    className={`px-3 py-1.5 text-sm rounded-full transition-all inline-flex items-center gap-1.5 ${!availableInCountry
                      ? 'bg-[var(--bg-card)]/60 text-[var(--text-muted)]/55 border border-white/10 cursor-not-allowed'
                      : activeOttKey === p.key
                        ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                        : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                      }`}
                  >
                    <span>{p.name}</span>
                    {availabilityHint && <span className="text-[10px] uppercase tracking-wide">{availabilityHint}</span>}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--text-muted)] w-20">Sort:</span>
              {[
                { value: 'date', label: 'Newest' },
                { value: 'rating', label: 'Rating' },
                { value: 'popularity', label: 'Popularity' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateFilters({ sort: opt.value })}
                  className={`px-3 py-1.5 text-sm rounded-full transition-all ${sortParam === opt.value
                    ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                    : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {showHeroCarousel && (
        <section
          className="relative mb-8 overflow-hidden rounded-3xl border border-white/10 bg-[var(--bg-secondary)]/40 shadow-[0_18px_60px_rgba(0,0,0,0.45)]"
          aria-label="Top 5 latest and trending shows"
          onMouseEnter={() => setPauseHeroAutoSlide(true)}
          onMouseLeave={() => setPauseHeroAutoSlide(false)}
        >
          <div
            className="flex transition-transform duration-700 ease-out"
            style={{ transform: `translateX(-${activeHeroIndex * 100}%)` }}
          >
            {topHeroShows.map((show, index) => {
              const heroImage = show.backdrop_path
                ? getImageUrl(show.backdrop_path, 'original')
                : getImageUrl(show.poster_path, 'w780');
              const firstAirYear = show.first_air_date?.split('-')[0] || 'TBA';
              const langLabel = getLanguageName(show.original_language);
              const poster = getImageUrl(show.poster_path);

              return (
                <article key={`show-hero-${show.id}`} className="relative min-w-full h-[52vw] min-h-[280px] max-h-[540px]">
                  {heroImage ? (
                    <Image
                      src={heroImage}
                      alt={show.name}
                      fill
                      priority={index === 0}
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[var(--bg-card)]" />
                  )}

                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_30%,rgba(30,64,175,0.25),transparent_42%),linear-gradient(90deg,rgba(2,6,23,0.96)_0%,rgba(2,6,23,0.75)_38%,rgba(2,6,23,0.2)_78%,rgba(2,6,23,0.6)_100%)]" />

                  <div className="relative z-10 h-full flex items-end sm:items-center px-5 sm:px-10 pb-7 sm:pb-0">
                    <div className="max-w-2xl">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/85 mb-3">
                        <span>Top 5</span>
                        <span className="opacity-60">•</span>
                        <span>Latest + Trending</span>
                      </div>

                      <h2 className="text-3xl sm:text-5xl font-black text-white leading-tight drop-shadow-[0_10px_22px_rgba(0,0,0,0.45)]">
                        {show.name}
                      </h2>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                        <span className="px-2.5 py-1 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] font-semibold">
                          {show.vote_average > 0 ? ` ${show.vote_average.toFixed(1)}` : 'Unrated'}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-white/15 text-white">{firstAirYear}</span>
                        <span className="px-2.5 py-1 rounded-full bg-white/15 text-white">{langLabel}</span>
                      </div>

                      <p className="mt-3 text-sm sm:text-lg text-white/90 max-w-xl line-clamp-3">
                        {show.overview || 'No synopsis available yet.'}
                      </p>

                      <div className="mt-4 flex items-center gap-3">
                        <Link
                          href={`/show/tmdbtv-${show.id}`}
                          className="inline-flex items-center gap-2 rounded-xl bg-white/92 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
                        >
                          More details
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                        <div className="rounded-full bg-black/35 border border-white/20 p-1">
                          <WatchlistPlusButton
                            movieId={`tmdbtv-${show.id}`}
                            title={show.name}
                            poster={poster}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {topHeroShows.length > 1 && (
            <>
              <button
                type="button"
                onClick={goToPrevHero}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-12 w-12 rounded-full border border-white/25 bg-black/35 text-white hover:bg-black/55"
                aria-label="Previous show"
              >
                <svg className="mx-auto h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={goToNextHero}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-12 w-12 rounded-full border border-white/25 bg-black/35 text-white hover:bg-black/55"
                aria-label="Next show"
              >
                <svg className="mx-auto h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                {topHeroShows.map((show, index) => (
                  <button
                    key={`show-hero-dot-${show.id}`}
                    type="button"
                    onClick={() => setHeroIndex(index)}
                    className={`h-2.5 rounded-full transition-all ${activeHeroIndex === index ? 'w-8 bg-[var(--accent)]' : 'w-2.5 bg-white/55 hover:bg-white/75'}`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {visible.map((show, idx) => {
          const href = `/show/tmdbtv-${show.id}`;
          const poster = getImageUrl(show.poster_path);
          const year = show.first_air_date ? new Date(show.first_air_date).getFullYear() : undefined;
          return (
            <Link
              key={show.id}
              href={href}
              prefetch={false}
              className="group relative bg-[var(--bg-card)] rounded-xl overflow-hidden border border-white/10 hover:border-white/20 transition-colors"
              style={{ animationDelay: `${Math.min(idx, 12) * 45}ms` }}
            >
              <div className="relative aspect-[2/3] overflow-hidden">
                <Image
                  src={poster}
                  alt={show.name}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

                <div className="absolute top-2 left-2 z-10">
                  <WatchlistPlusButton movieId={`tmdbtv-${show.id}`} title={show.name} poster={poster} />
                </div>

                <div className="absolute bottom-12 right-3 flex items-center gap-1">
                  {providerLogos[show.id]?.logos?.length > 0 ? (
                    providerLogos[show.id].logos.slice(0, 3).map((item, idx2) => {
                      const watchLink = providerLogos[show.id].link ?? `https://www.themoviedb.org/tv/${show.id}/watch`;
                      return (
                        <a
                          key={`${show.id}-logo-${idx2}`}
                          href={watchLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1 focus:ring-offset-black/40 rounded-xl"
                          title={`Watch on ${item.name}`}
                        >
                          <div className="w-8 h-8 rounded-xl bg-[var(--bg-primary)]/90 border-2 border-white/20 flex items-center justify-center overflow-hidden shadow-lg transition-all duration-200 hover:scale-110 hover:border-[var(--accent)]/50 active:scale-95">
                            <Image src={item.url} alt={item.name} width={20} height={20} className="object-contain" />
                          </div>
                        </a>
                      );
                    })
                  ) : providerLogos[show.id] && providerLogos[show.id].logos?.length === 0 ? (
                    <span className="text-[10px] text-[var(--text-muted)] px-1.5 py-0.5 bg-[var(--bg-primary)]/60 rounded-lg">—</span>
                  ) : null}
                </div>

                <button
                  type="button"
                  className="absolute top-2 right-2 z-10 h-9 w-9 rounded-full bg-black/55 border border-white/10 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Send to friend"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!user) return;
                    try {
                      const recommendationId = await ensureSeriesRecommendationId(show);
                      setSendModal({ title: show.name, poster, year, recommendationId });
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>

              <div className="p-3">
                <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{show.name}</div>
                <div className="mt-1 text-xs text-[var(--text-muted)] flex items-center justify-between gap-2">
                  <span className="truncate">{year ?? 'Series'} • {getLanguageName(show.original_language)}</span>
                  <span className="text-[var(--accent)] font-semibold">{(show.vote_average ?? 0).toFixed(1)}</span>
                </div>
                {/* Send to Friend button - visible (mobile-friendly) */}
                {user && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          const recommendationId = await ensureSeriesRecommendationId(show);
                          setSendModal({ title: show.name, poster, year, recommendationId });
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      className="flex-1 text-xs px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                      title="Send to friend"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Send to Friend
                    </button>
                    <ScheduleWatchButton
                      movieId={`show::tmdbtv-${show.id}`}
                      movieTitle={show.name}
                      moviePoster={poster}
                      movieYear={year}
                      size="sm"
                    />
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {sendModal && (
        <SendToFriendModal
          isOpen={true}
          onClose={() => setSendModal(null)}
          movieId={sendModal.recommendationId}
          movieTitle={sendModal.title}
          moviePoster={sendModal.poster}
          movieYear={sendModal.year}
          recommendationId={sendModal.recommendationId}
        />
      )}
    </>
  );
}
