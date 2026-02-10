'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SendToFriendModal } from './SendToFriendModal';
import { useAuth } from './AuthProvider';
import { getWatchProviders, GENRE_LIST, OTT_PROVIDERS, OTT_TO_LANGUAGES, resolveOttProvider, type TMDBWatchProviders } from '@/lib/tmdb';

interface TrendingMovie {
  id: number;
  title: string;
  original_title: string;
  poster_path: string;
  backdrop_path: string;
  vote_average: number;
  release_date: string;
  overview: string;
  original_language: string;
  popularity: number;
  adult?: boolean;
  genre_ids?: number[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const trendingCache = new Map<string, { movies: TrendingMovie[]; upcoming: Record<string, TrendingMovie[]>; ts: number }>();
const PROVIDER_CACHE_TTL_MS = 60 * 60 * 1000;
export type ProviderLogoItem = { url: string; name: string };
const providerCache = new Map<number, { logos: ProviderLogoItem[]; link?: string; hasOtt: boolean; ts: number }>();
const TMDB_LOGO_BASE = 'https://image.tmdb.org/t/p/w45';

type ProviderEntry = { provider_id?: number; provider_name?: string; logo_path?: string | null };
type ProviderRegion = {
  link?: string;
  flatrate?: ProviderEntry[];
  free?: ProviderEntry[];
  ads?: ProviderEntry[];
  rent?: ProviderEntry[];
  buy?: ProviderEntry[];
};

const collectProviders = (regionData?: ProviderRegion) => [
  ...(regionData?.flatrate ?? []),
  ...(regionData?.free ?? []),
  ...(regionData?.ads ?? []),
  ...(regionData?.rent ?? []),
  ...(regionData?.buy ?? []),
];

const collectStreamingProviders = (regionData?: ProviderRegion) => [
  ...(regionData?.flatrate ?? []),
  ...(regionData?.free ?? []),
  ...(regionData?.ads ?? []),
];

const normalizeProviderKey = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('netflix')) return 'netflix';
  if (lower.includes('prime')) return 'prime video';
  if (lower.includes('amazon video')) return 'prime video';
  if (lower.includes('disney') || lower.includes('hotstar')) return 'jiohotstar';
  if (lower.includes('apple')) return 'apple tv';
  if (lower.includes('aha')) return 'aha';
  if (lower.includes('sonyliv')) return 'sonyliv';
  if (lower.includes('zee5')) return 'zee5';
  if (lower.includes('youtube')) return 'youtube';
  if (lower.includes('hulu')) return 'hulu';
  if (lower.includes('peacock')) return 'peacock';
  if (lower.includes('paramount')) return 'paramount+';
  return lower.replace(/\s+with\s+ads/g, '').replace(/\s+/g, ' ').trim();
};

const extractProviderMeta = (providers?: TMDBWatchProviders | null): { logos: ProviderLogoItem[]; link?: string; hasOtt: boolean } => {
  if (!providers?.results) return { logos: [], hasOtt: false };
  const inRegion = providers.results?.IN as ProviderRegion | undefined;
  const usRegion = providers.results?.US as ProviderRegion | undefined;
  const inProviders = collectProviders(inRegion);
  const usProviders = collectProviders(usRegion);
  const allProviders = [...inProviders, ...usProviders];
  const link = inRegion?.link ?? usRegion?.link;
  // Include streaming (flatrate/free/ads) and rent/buy so more movies get at least one OTT logo
  const streamingProviders = [
    ...collectStreamingProviders(inRegion),
    ...collectStreamingProviders(usRegion),
  ];
  const rentBuyProviders = [
    ...(inRegion?.rent ?? []),
    ...(inRegion?.buy ?? []),
    ...(usRegion?.rent ?? []),
    ...(usRegion?.buy ?? []),
  ];
  const providersForLogos = [...streamingProviders, ...rentBuyProviders];

  const logos: ProviderLogoItem[] = [];
  const seen = new Set<string>();

  for (const provider of providersForLogos) {
    const name = provider?.provider_name?.trim();
    if (!name) continue;
    const key = normalizeProviderKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (provider.logo_path) {
      logos.push({ url: `${TMDB_LOGO_BASE}${provider.logo_path}`, name });
    }
  }

  return { logos, link, hasOtt: allProviders.length > 0 };
};

const LANGUAGES = [
  { name: 'English', code: 'en' },
  { name: 'Hindi', code: 'hi' },
  { name: 'Telugu', code: 'te' },
  { name: 'Tamil', code: 'ta' },
  { name: 'Malayalam', code: 'ml' },
  { name: 'Korean', code: 'ko' },
  { name: 'Japanese', code: 'ja' },
  { name: 'Chinese', code: 'zh' },
  { name: 'French', code: 'fr' },
  { name: 'Spanish', code: 'es' },
];
interface TrendingMoviesProps {
  searchQuery?: string;
}

export function TrendingMovies({ searchQuery = '' }: TrendingMoviesProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const [movies, setMovies] = useState<TrendingMovie[]>([]);
  const [comingSoonByLang, setComingSoonByLang] = useState<Record<string, TrendingMovie[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sendModalMovie, setSendModalMovie] = useState<TrendingMovie | null>(null);
  const [streamingStatus, setStreamingStatus] = useState<Record<number, 'ott' | 'soon'>>({});
  const [providerLogos, setProviderLogos] = useState<Record<number, { logos: ProviderLogoItem[]; link?: string }>>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedDecade, setExpandedDecade] = useState<number | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Filter params from URL
  const selectedLang = searchParams.get('lang') || '';
  const selectedGenre = searchParams.get('genre') || '';
  const selectedYear = searchParams.get('year') || '';
  const selectedOtt = searchParams.get('ott') || '';
  const sortParam = searchParams.get('sort') || 'date'; // date | rating | popularity

  const resolvedOttProvider = useMemo(() => resolveOttProvider(selectedOtt), [selectedOtt]);
  const activeOttKey = resolvedOttProvider?.key ?? selectedOtt;

  const updateFilters = (updates: { lang?: string; genre?: string; year?: string; sort?: string; ott?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (updates.lang !== undefined) (updates.lang ? params.set('lang', updates.lang) : params.delete('lang'));
    if (updates.genre !== undefined) (updates.genre ? params.set('genre', updates.genre) : params.delete('genre'));
    if (updates.year !== undefined) (updates.year ? params.set('year', updates.year) : params.delete('year'));
    if (updates.sort !== undefined) (updates.sort ? params.set('sort', updates.sort) : params.delete('sort'));
    if (updates.ott !== undefined) (updates.ott ? params.set('ott', updates.ott) : params.delete('ott'));
    router.push(`/?${params.toString()}`, { scroll: false });
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

  useEffect(() => {
    const controller = new AbortController();

    async function loadMovies() {
      const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
      if (!apiKey) {
        setError('API key missing');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const cacheKey = [
          searchQuery.trim(),
          selectedLang,
          selectedGenre,
          selectedYear,
          selectedOtt,
          sortParam,
        ].join('|');
        const cached = trendingCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
          setMovies(cached.movies);
          setComingSoonByLang(cached.upcoming);
          setLoading(false);
          return;
        }

        let allMovies: TrendingMovie[] = [];
        let allUpcoming: TrendingMovie[] = [];
        let upcomingByLang: Record<string, TrendingMovie[]> = {};

        // If there's a search query, use the search API instead of discover
        if (searchQuery && searchQuery.trim()) {
          const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(searchQuery)}&page=1&include_adult=false`;
          const response = await fetch(searchUrl, { signal: controller.signal });
          const data = await response.json();

          let searchResults = (data.results || []).filter((movie: TrendingMovie) => movie.poster_path && movie.vote_average > 0);

          // Client-side filter by genre and year when set
          if (selectedGenre) {
            const gId = parseInt(selectedGenre, 10);
            searchResults = searchResults.filter((m: TrendingMovie) => Array.isArray(m.genre_ids) && m.genre_ids.includes(gId));
          }
          if (selectedYear) {
            const y = parseInt(selectedYear, 10);
            searchResults = searchResults.filter((m: TrendingMovie) => m.release_date && m.release_date.startsWith(String(y)));
          }
          const sortByMap: Record<string, (a: TrendingMovie, b: TrendingMovie) => number> = {
            date: (a, b) => new Date(b.release_date || '').getTime() - new Date(a.release_date || '').getTime(),
            rating: (a, b) => (b.vote_average || 0) - (a.vote_average || 0),
            popularity: (a, b) => (b.popularity || 0) - (a.popularity || 0),
          };
          const sortFn = sortByMap[sortParam] || sortByMap.date;
          searchResults.sort(sortFn);
          allMovies = searchResults;

          upcomingByLang = {};
          setComingSoonByLang(upcomingByLang);
        } else {
          // Original discover logic when no search query
          const today = new Date().toISOString().split('T')[0];
          const sixMonthsFromNow = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const currentYear = new Date().getFullYear();
          const selectedYearNum = selectedYear ? parseInt(selectedYear, 10) : null;
          const hasValidYear = Number.isFinite(selectedYearNum);
          const yearEnd = `${currentYear}-12-31`;
          const upcomingWindow = !hasValidYear
            ? { start: today, end: sixMonthsFromNow }
            : selectedYearNum! > currentYear
              ? { start: `${selectedYearNum}-01-01`, end: `${selectedYearNum}-12-31` }
              : selectedYearNum === currentYear
                ? { start: today, end: yearEnd }
                : null;

          const sortByMap: Record<string, string> = {
            date: 'primary_release_date.desc',
            rating: 'vote_average.desc',
            popularity: 'popularity.desc',
          };
          const sortBy = sortByMap[sortParam] || 'primary_release_date.desc';
          const genrePart = selectedGenre ? `&with_genres=${selectedGenre}` : '';
          const yearPart = selectedYear ? `&primary_release_year=${selectedYear}` : '';
          const numericOtt = selectedOtt && /^\d+$/.test(selectedOtt) ? Number(selectedOtt) : null;
          const ottIdUS = resolvedOttProvider?.ids.US ?? (resolvedOttProvider ? undefined : numericOtt ?? undefined);
          const ottIdIN = resolvedOttProvider?.ids.IN ?? (resolvedOttProvider ? undefined : numericOtt ?? undefined);
          const includeUS = !selectedOtt || !!ottIdUS;
          const includeIN = !selectedOtt || !!ottIdIN;
          const ottPartUS = ottIdUS ? `&with_watch_providers=${ottIdUS}` : '';
          const ottPartIN = ottIdIN ? `&with_watch_providers=${ottIdIN}` : '';

          // Released: only movies on OTT (USA or India), optionally by provider
          const releasedBase = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&sort_by=${sortBy}&primary_release_date.lte=${today}&with_watch_monetization_types=flatrate${genrePart}${yearPart}`;
          const releasedBaseUrlUS = includeUS ? `${releasedBase}&watch_region=US${ottPartUS}` : '';
          const releasedBaseUrlIN = includeIN ? `${releasedBase}&watch_region=IN${ottPartIN}` : '';
          const upcomingBaseUrl = upcomingWindow
            ? `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&sort_by=primary_release_date.asc&primary_release_date.gte=${upcomingWindow.start}&primary_release_date.lte=${upcomingWindow.end}${genrePart}${selectedYear ? `&primary_release_year=${selectedYear}` : ''}`
            : '';

          const hasFilters = Boolean(selectedLang || selectedGenre || selectedYear || selectedOtt);
          const maxPages = hasFilters ? 4 : 2;
          const pagesToFetch = Array.from({ length: maxPages }, (_, i) => i + 1);
          // Fetch more upcoming pages when filtering by language or future year so we get more "Coming Soon" titles (e.g. 2026 Telugu)
          const upcomingMaxPages = (selectedLang || (selectedYearNum && selectedYearNum > currentYear)) ? 10 : 2;
          const upcomingPagesToFetch = Array.from({ length: upcomingMaxPages }, (_, i) => i + 1);
          const yearStart = `${currentYear}-01-01`;
          const releasedThisYearUS = includeUS
            ? `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&sort_by=${sortBy}&primary_release_date.gte=${yearStart}&primary_release_date.lte=${today}&with_watch_monetization_types=flatrate&watch_region=US${genrePart}${ottPartUS}`
            : '';
          const releasedThisYearIN = includeIN
            ? `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&sort_by=${sortBy}&primary_release_date.gte=${yearStart}&primary_release_date.lte=${today}&with_watch_monetization_types=flatrate&watch_region=IN${genrePart}${ottPartIN}`
            : '';

          // When an OTT has a language restriction (e.g. Aha = Telugu + Tamil only), use only those languages
          const ottRestrictedLangs = resolvedOttProvider?.languages ?? (numericOtt ? OTT_TO_LANGUAGES[numericOtt] : null);
          const defaultLangs = ['en', 'hi', 'te', 'ta'];
          const langCodesToFetch: string[] = ottRestrictedLangs
            ? (selectedLang && ottRestrictedLangs.includes(selectedLang) ? [selectedLang] : ottRestrictedLangs)
            : (selectedLang ? [selectedLang] : defaultLangs);

          const releasedPromises: Promise<Response>[] = [];
          const upcomingPromises: Promise<Response>[] = [];
          const yearPromises: Promise<Response>[] = [];

          for (const lang of langCodesToFetch) {
            for (const page of pagesToFetch) {
              if (releasedBaseUrlUS) {
                releasedPromises.push(
                  fetch(`${releasedBaseUrlUS}&with_original_language=${lang}&page=${page}`, { signal: controller.signal })
                );
              }
              if (releasedBaseUrlIN) {
                releasedPromises.push(
                  fetch(`${releasedBaseUrlIN}&with_original_language=${lang}&page=${page}`, { signal: controller.signal })
                );
              }
            }
            for (const page of upcomingPagesToFetch) {
              if (upcomingBaseUrl) {
                upcomingPromises.push(
                  fetch(`${upcomingBaseUrl}&with_original_language=${lang}&page=${page}`, { signal: controller.signal })
                );
              }
            }
            for (const page of [1, 2]) {
              if (releasedThisYearUS) {
                yearPromises.push(
                  fetch(`${releasedThisYearUS}&with_original_language=${lang}&page=${page}`, { signal: controller.signal })
                );
              }
              if (releasedThisYearIN) {
                yearPromises.push(
                  fetch(`${releasedThisYearIN}&with_original_language=${lang}&page=${page}`, { signal: controller.signal })
                );
              }
            }
          }

          const [releasedResponses, upcomingResponses, yearResponses] = await Promise.all([
            Promise.all(releasedPromises),
            Promise.all(upcomingPromises),
            Promise.all(yearPromises)
          ]);

          const releasedData = await Promise.all(releasedResponses.map(r => r.json()));
          const upcomingData = await Promise.all(upcomingResponses.map(r => r.json()));
          const yearData = await Promise.all(yearResponses.map(r => r.json()));

          const releasedFlat = releasedData.flatMap(d => d.results || []);
          const yearFlat = selectedYear ? [] : yearData.flatMap(d => d.results || []);
          const seenIds = new Set<number>();
          allMovies = [];
          releasedFlat.forEach(m => { if (!seenIds.has(m.id)) { seenIds.add(m.id); allMovies.push(m); } });
          yearFlat.forEach(m => { if (!seenIds.has(m.id)) { seenIds.add(m.id); allMovies.push(m); } });
          allMovies.sort((a, b) =>
            new Date(b.release_date || '1900-01-01').getTime() -
            new Date(a.release_date || '1900-01-01').getTime()
          );
          allUpcoming = upcomingData.flatMap(d => d.results || []);

          // Filter: need poster and at least some rating (no unrated movies)
          allMovies = allMovies.filter(movie => movie.poster_path && typeof movie.vote_average === 'number' && movie.vote_average > 0);
          // Upcoming: allow unrated titles so future releases show up
          allUpcoming = allUpcoming.filter(movie => movie.poster_path);

          // Ensure no movie appears in both Released and Coming Soon (dedupe by id)
          const releasedIds = new Set(allMovies.map(m => m.id));
          const upcomingIds = new Set(allUpcoming.map(m => m.id));
          allMovies = allMovies.filter(m => !upcomingIds.has(m.id));
          allUpcoming = allUpcoming.filter(m => !releasedIds.has(m.id));

          // Group upcoming movies by language
          upcomingByLang = {};
          for (const movie of allUpcoming) {
            const lang = movie.original_language;
            if (!upcomingByLang[lang]) {
              upcomingByLang[lang] = [];
            }
            upcomingByLang[lang].push(movie);
          }

          // Sort each language's movies by release date (soonest first)
          for (const lang in upcomingByLang) {
            upcomingByLang[lang].sort((a, b) =>
              new Date(a.release_date || '2099-01-01').getTime() -
              new Date(b.release_date || '2099-01-01').getTime()
            );
          }

          setComingSoonByLang(upcomingByLang);
        }

        setMovies(allMovies);

        if (allMovies.length === 0) {
          setError('No results');
        }

        trendingCache.set(cacheKey, { movies: allMovies, upcoming: upcomingByLang, ts: Date.now() });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError('Failed to fetch');
        }
      }

      setLoading(false);
    }

    loadMovies();

    return () => controller.abort();
  }, [selectedLang, selectedGenre, selectedYear, selectedOtt, sortParam, searchQuery]);

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

  // For search results: determine OTT vs streaming soon (USA/India) (USA/India)
  useEffect(() => {
    if (!searchQuery.trim() || movies.length === 0) {
      setStreamingStatus({});
      return;
    }
    const controller = new AbortController();
    const limit = 15;
    (async () => {
      const next: Record<number, 'ott' | 'soon'> = {};
      for (const movie of movies.slice(0, limit)) {
        const cached = providerCache.get(movie.id);
        if (cached && Date.now() - cached.ts < PROVIDER_CACHE_TTL_MS) {
          next[movie.id] = cached.hasOtt ? 'ott' : 'soon';
          continue;
        }
        try {
          const providers = await getWatchProviders(movie.id);
          const hasOtt =
            (providers?.results?.IN?.flatrate?.length ?? 0) > 0 ||
            (providers?.results?.US?.flatrate?.length ?? 0) > 0;
          next[movie.id] = hasOtt ? 'ott' : 'soon';
          const { logos, link, hasOtt: metaHasOtt } = extractProviderMeta(providers);
          providerCache.set(movie.id, { logos, link, hasOtt: metaHasOtt, ts: Date.now() });
          setProviderLogos((prev) => (prev[movie.id] ? prev : { ...prev, [movie.id]: { logos, link } }));
        } catch {
          next[movie.id] = 'soon';
          setProviderLogos((prev) => (prev[movie.id] ? prev : { ...prev, [movie.id]: { logos: [] } }));
        }
      }
      if (!controller.signal.aborted) setStreamingStatus((prev) => ({ ...prev, ...next }));
    })();
    return () => controller.abort();
  }, [searchQuery, movies]);

  useEffect(() => {
    if (loading || movies.length === 0) return;
    let cancelled = false;
    const limit = searchQuery ? 36 : 60;
    const targets = movies.slice(0, limit).map((m) => m.id);

    const hydrateFromCache = () => {
      const fromCache: Record<number, { logos: ProviderLogoItem[]; link?: string }> = {};
      for (const id of targets) {
        const cached = providerCache.get(id);
        if (cached && Date.now() - cached.ts < PROVIDER_CACHE_TTL_MS && cached.logos.length > 0) {
          fromCache[id] = { logos: cached.logos, link: cached.link };
        }
      }
      if (Object.keys(fromCache).length > 0) {
        setProviderLogos((prev) => ({ ...fromCache, ...prev }));
      }
    };

    hydrateFromCache();

    const queue = targets.filter((id) => {
      const cached = providerCache.get(id);
      return !(cached && Date.now() - cached.ts < PROVIDER_CACHE_TTL_MS);
    });

    const concurrency = 6;

    const runQueue = async () => {
      const workers = Array.from({ length: concurrency }).map(async () => {
        while (queue.length > 0 && !cancelled) {
          const id = queue.shift();
          if (!id) break;
          try {
            const providers = await getWatchProviders(id);
            if (cancelled) return;
            const { logos, link, hasOtt } = extractProviderMeta(providers);
            providerCache.set(id, { logos, link, hasOtt, ts: Date.now() });
            setProviderLogos((prev) => (prev[id] ? prev : { ...prev, [id]: { logos, link } }));
          } catch {
            providerCache.set(id, { logos: [], hasOtt: false, ts: Date.now() });
            setProviderLogos((prev) => (prev[id] ? prev : { ...prev, [id]: { logos: [] } }));
          }
        }
      });
      await Promise.all(workers);
    };

    runQueue();

    return () => {
      cancelled = true;
    };
  }, [movies, loading, searchQuery]);

  const handleLanguageClick = (code: string) => {
    updateFilters({ lang: selectedLang === code ? '' : code });
  };

  const getLangInfo = (code: string) => {
    return LANGUAGES.find(l => l.code === code) || { name: code.toUpperCase() };
  };

  const currentLang = selectedLang ? getLangInfo(selectedLang) : null;


  return (
    <div>
      {/* Filter button + dropdown */}
      <div ref={filterRef} className="relative mb-6">
        <button
          type="button"
          onClick={() => setFilterOpen((o) => !o)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all border ${
            filterOpen
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
              {selectedLang && (
                <button
                  onClick={() => updateFilters({ lang: '' })}
                  className="px-3 py-1.5 text-xs rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                >
                  Clear
                </button>
              )}
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageClick(lang.code)}
                  className={`px-3 py-1.5 text-sm rounded-full transition-all flex items-center gap-1.5 ${selectedLang === lang.code
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
                className={`px-3 py-1.5 text-sm rounded-full transition-all ${!selectedGenre ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'}`}
              >
                All
              </button>
              {GENRE_LIST.slice(0, 12).map((g) => (
                <button
                  key={g.id}
                  onClick={() => updateFilters({ genre: selectedGenre === String(g.id) ? '' : String(g.id) })}
                  className={`px-3 py-1.5 text-sm rounded-full transition-all ${selectedGenre === String(g.id) ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'}`}
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
                  className={`px-3 py-1.5 text-sm rounded-full transition-all ${!selectedYear ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'}`}
                >
                  Any
                </button>
                {DECADES.map((decade) => (
                  <button
                    key={decade}
                    onClick={() => setExpandedDecade((prev) => (prev === decade ? null : decade))}
                    className={`px-3 py-1.5 text-sm rounded-full transition-all ${expandedDecade === decade ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-primary)]' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'}`}
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
                      className={`px-3 py-1.5 text-sm rounded-full transition-all ${selectedYear === String(y) ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'}`}
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
                className={`px-3 py-1.5 text-sm rounded-full transition-all ${!selectedOtt ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'}`}
              >
                All
              </button>
              {OTT_PROVIDERS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => updateFilters({ ott: activeOttKey === p.key ? '' : p.key })}
                  className={`px-3 py-1.5 text-sm rounded-full transition-all ${activeOttKey === p.key ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'}`}
                >
                  {p.name}
                </button>
              ))}
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
                  className={`px-3 py-1.5 text-sm rounded-full transition-all ${sortParam === opt.value ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Coming Soon Sections - Only show when a language is selected */}
      {!loading && selectedLang && Object.keys(comingSoonByLang).length > 0 && (
        <div className="mb-10 space-y-8">
          {LANGUAGES.filter(lang =>
            comingSoonByLang[lang.code]?.length > 0 &&
            selectedLang === lang.code
          ).map((lang) => (
            <div key={`coming-soon-${lang.code}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <span className="text-purple-400">🎬 Coming Soon</span>
                  <span className="text-[var(--text-muted)]">•</span>
                  <span>{lang.name}</span>
                  <span className="text-xs font-normal text-[var(--text-muted)]">(Streaming soon)</span>
                </h3>
                <span className="text-xs text-[var(--text-muted)]">
                  {comingSoonByLang[lang.code]?.length || 0} upcoming
                </span>
              </div>

              {/* Horizontal Scrolling Container */}
              <div className="relative">
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-[var(--bg-card)] scrollbar-track-transparent">
                  {comingSoonByLang[lang.code]?.map((movie) => {
                    const releaseDate = movie.release_date ? new Date(movie.release_date) : null;
                    const formattedDate = releaseDate
                      ? releaseDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : 'TBA';

                    return (
                      <Link
                        key={`upcoming-${movie.id}`}
                        href={`/movie/tmdb-${movie.id}?from=${lang.code}`}
                        scroll={false}
                        prefetch={false}
                        className="group flex-shrink-0 w-36 sm:w-40 bg-[var(--bg-card)] rounded-xl overflow-hidden card-hover"
                      >
                        <div className="relative aspect-[2/3] overflow-hidden">
                          {movie.poster_path ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w300${movie.poster_path}`}
                              alt={movie.title}
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <div className="absolute inset-0 bg-[var(--bg-secondary)] flex items-center justify-center">
                              <span className="text-3xl">🎬</span>
                            </div>
                          )}

                          <div className="absolute inset-0 bg-gradient-to-t from-purple-900/90 via-transparent to-transparent" />

                          {/* Coming Soon Badge */}
                          <div className="absolute top-2 left-2 right-2">
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-500 rounded text-white">
                              STREAMING SOON
                            </span>
                          </div>

                          {/* Release Date */}
                          <div className="absolute bottom-2 left-2 right-2">
                            <div className="flex items-center gap-1 text-white">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className="text-xs font-semibold">{formattedDate}</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-2">
                          <h4 className="font-medium text-[var(--text-primary)] line-clamp-1 group-hover:text-purple-400 transition-colors text-sm">
                            {movie.title}
                          </h4>
                        </div>
                      </Link>
                    );
                  })}
                </div>
                {/* Scroll fade effect */}
                <div className="absolute right-0 top-0 bottom-4 w-12 bg-gradient-to-l from-[var(--bg-primary)] to-transparent pointer-events-none" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Section title */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          {searchQuery ? (
            <>
              🔍 <span>Search: &quot;{searchQuery}&quot;</span>
            </>
          ) : currentLang ? (
            <span>{currentLang.name} Movies</span>
          ) : (
            <>
              🔥 <span>Latest & Trending</span>
            </>
          )}
        </h3>
        <span className="text-sm text-[var(--text-muted)]">
          {loading ? '...' : `${movies.length} movies`}
        </span>
      </div>

      {/* Error message */}
      {error && (
        <div className="text-center py-4 text-red-400 text-sm">{error}</div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : movies.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {movies.map((movie) => {
            const langInfo = getLangInfo(movie.original_language);
            return (
              <Link
                key={movie.id}
                href={`/movie/tmdb-${movie.id}${selectedLang ? `?from=${selectedLang}` : ''}`}
                scroll={false}
                prefetch={false}
                className="group block bg-[var(--bg-card)] rounded-xl overflow-hidden card-hover"
              >
                <div className="relative aspect-[2/3] overflow-hidden">
                  {movie.poster_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w300${movie.poster_path}`}
                      alt={movie.title}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[var(--bg-secondary)] flex items-center justify-center">
                      <span className="text-4xl">🎬</span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent opacity-80" />

                  {movie.vote_average > 0 && (
                    <div className="absolute top-3 right-3">
                      <span className="flex items-center gap-1 px-2 py-1 text-xs font-bold bg-[var(--accent)]/90 backdrop-blur-sm rounded-md text-[var(--bg-primary)]">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        {movie.vote_average.toFixed(1)}
                      </span>
                    </div>
                  )}

                  <div className="absolute bottom-12 right-3 flex items-center gap-1">
                    {providerLogos[movie.id]?.logos?.length > 0 ? (
                      providerLogos[movie.id].logos.slice(0, 3).map((item, idx) => {
                        const watchLink = providerLogos[movie.id].link ?? `https://www.themoviedb.org/movie/${movie.id}/watch`;
                        const content = (
                          <div
                            className="w-8 h-8 rounded-xl bg-[var(--bg-primary)]/90 border-2 border-white/20 flex items-center justify-center overflow-hidden shadow-lg transition-all duration-200 hover:scale-110 hover:border-[var(--accent)]/50 hover:shadow-[var(--accent)]/20 hover:shadow-md active:scale-95"
                            title={`Watch on ${item.name} (opens in new tab)`}
                          >
                            <img src={item.url} alt={item.name} className="w-5 h-5 object-contain" />
                          </div>
                        );
                        return (
                          <a
                            key={`${movie.id}-logo-${idx}`}
                            href={watchLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1 focus:ring-offset-[var(--bg-primary)] rounded-xl"
                          >
                            {content}
                          </a>
                        );
                      })
                    ) : providerLogos[movie.id] && providerLogos[movie.id].logos?.length === 0 ? (
                      <span className="text-[10px] text-[var(--text-muted)] px-1.5 py-0.5 bg-[var(--bg-primary)]/60 rounded-lg">—</span>
                    ) : null}
                  </div>

                  <div className="absolute top-3 left-3 flex flex-col gap-1">
                    <span className="px-2 py-1 text-xs font-medium bg-[var(--bg-primary)]/80 backdrop-blur-sm rounded-md text-[var(--text-secondary)]">
                      {langInfo.name}
                    </span>
                    {searchQuery && (streamingStatus[movie.id] === 'soon' || streamingStatus[movie.id] === undefined) && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/90 rounded text-[var(--bg-primary)]">
                        Streaming soon
                      </span>
                    )}
                    {movie.adult && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-red-600/90 backdrop-blur-sm rounded-md text-white">
                        18+
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3">
                  <h4 className="font-semibold text-[var(--text-primary)] line-clamp-1 group-hover:text-[var(--accent)] transition-colors text-sm">
                    {movie.title}
                  </h4>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {movie.release_date?.split('-')[0] || 'TBA'} • {langInfo.name}
                  </p>
                  {/* Send to Friend button - only for authenticated users */}
                  {user && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSendModalMovie(movie);
                      }}
                      className="mt-2 w-full text-xs px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                      title="Send to friend"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Send
                    </button>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🎬</div>
          <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
            No movies found
          </h3>
          <p className="text-[var(--text-secondary)] max-w-sm mx-auto">
            Try a different language, OTT platform, or year — or clear filters to see more.
          </p>
        </div>
      )}

      {/* Send to Friend Modal */}
      {sendModalMovie && (
        <SendToFriendModal
          isOpen={!!sendModalMovie}
          onClose={() => setSendModalMovie(null)}
          movieId={`tmdb-${sendModalMovie.id}`}
          movieTitle={sendModalMovie.title}
          moviePoster={sendModalMovie.poster_path ? `https://image.tmdb.org/t/p/w300${sendModalMovie.poster_path}` : ''}
          movieYear={parseInt(sendModalMovie.release_date?.split('-')[0] || '0')}
          tmdbId={String(sendModalMovie.id)}
        />
      )}
    </div>
  );
}
