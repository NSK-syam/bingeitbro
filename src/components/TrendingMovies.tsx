'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { SendToFriendModal } from './SendToFriendModal';
import { useAuth } from './AuthProvider';
import { getWatchProviders, GENRE_LIST, OTT_PROVIDERS, OTT_TO_LANGUAGES, normalizeWatchProviderKey, resolveOttProvider, type TMDBWatchProviders } from '@/lib/tmdb';
import { fetchTmdbWithProxy } from '@/lib/tmdb-fetch';
import { WatchlistPlusButton } from './WatchlistPlusButton';

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
const providerCache = new Map<string, { logos: ProviderLogoItem[]; link?: string; hasOtt: boolean; ts: number }>();
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

const normalizeProviderKey = (name: string) => normalizeWatchProviderKey(name);

const dedupeLogos = (items: ProviderLogoItem[]) => {
  const out: ProviderLogoItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const key = normalizeProviderKey(it.name) || it.url || it.name;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
};

const extractProviderMeta = (
  providers: TMDBWatchProviders | null | undefined,
  country: 'IN' | 'US',
): { logos: ProviderLogoItem[]; link?: string; hasOtt: boolean } => {
  if (!providers?.results) return { logos: [], hasOtt: false };
  const region = (country === 'IN' ? providers.results?.IN : providers.results?.US) as ProviderRegion | undefined;
  const allProviders = collectProviders(region);
  const link = region?.link;
  // Include streaming (flatrate/free/ads) and rent/buy so more movies get at least one OTT logo
  const streamingProviders = [
    ...collectStreamingProviders(region),
  ];
  const rentBuyProviders = [
    ...(region?.rent ?? []),
    ...(region?.buy ?? []),
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

  return { logos: dedupeLogos(logos), link, hasOtt: allProviders.length > 0 };
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
  country?: 'IN' | 'US';
}

export function TrendingMovies({ searchQuery = '', country = 'IN' }: TrendingMoviesProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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
  const [heroIndex, setHeroIndex] = useState(0);
  const [pauseHeroAutoSlide, setPauseHeroAutoSlide] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Country affects watch providers; reset derived states so UI updates immediately.
    setProviderLogos({});
    setStreamingStatus({});
  }, [country]);

  // Filter params from URL
  const selectedLang = searchParams.get('lang') || '';
  const selectedGenre = searchParams.get('genre') || '';
  const selectedYear = searchParams.get('year') || '';
  const selectedOtt = searchParams.get('ott') || '';
  const sortParam = searchParams.get('sort') || 'date'; // date | rating | popularity

  const resolvedOttProvider = useMemo(() => resolveOttProvider(selectedOtt), [selectedOtt]);
  const activeOttKey = resolvedOttProvider?.key ?? selectedOtt;

  const updateFilters = useCallback((updates: { lang?: string; genre?: string; year?: string; sort?: string; ott?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (updates.lang !== undefined) (updates.lang ? params.set('lang', updates.lang) : params.delete('lang'));
    if (updates.genre !== undefined) (updates.genre ? params.set('genre', updates.genre) : params.delete('genre'));
    if (updates.year !== undefined) (updates.year ? params.set('year', updates.year) : params.delete('year'));
    if (updates.sort !== undefined) (updates.sort ? params.set('sort', updates.sort) : params.delete('sort'));
    if (updates.ott !== undefined) (updates.ott ? params.set('ott', updates.ott) : params.delete('ott'));
    // Keep filters on the current page (pushing to "/" drops them due to home redirects/default hub).
    const qs = params.toString();
    const base = pathname && pathname.startsWith('/') ? pathname : '/movies';
    router.push(qs ? `${base}?${qs}` : base, { scroll: false });
  }, [searchParams, pathname, router]);

  useEffect(() => {
    if (!selectedOtt) return;
    const selectedProvider = resolveOttProvider(selectedOtt);
    if (!selectedProvider) return;
    const availableInCountry = country === 'US'
      ? Boolean(selectedProvider.ids.US)
      : Boolean(selectedProvider.ids.IN);

    // If user switches country and current OTT is unavailable there,
    // clear the OTT filter so results do not disappear unexpectedly.
    if (!availableInCountry) {
      updateFilters({ ott: '' });
    }
  }, [country, selectedOtt, updateFilters]);

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
          country,
          searchQuery.trim(),
          selectedLang,
          selectedGenre,
          selectedYear,
          selectedOtt,
          sortParam,
        ].join('|');
        const cached = trendingCache.get(cacheKey);
        if (
          cached &&
          Date.now() - cached.ts < CACHE_TTL_MS &&
          cached.movies.length > 0
        ) {
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
          const response = await fetchTmdbWithProxy(searchUrl, { signal: controller.signal });
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
                  fetchTmdbWithProxy(`${releasedBaseUrlUS}&with_original_language=${lang}&page=${page}`, { signal: controller.signal })
                );
              }
              if (releasedBaseUrlIN) {
                releasedPromises.push(
                  fetchTmdbWithProxy(`${releasedBaseUrlIN}&with_original_language=${lang}&page=${page}`, { signal: controller.signal })
                );
              }
            }
            for (const page of upcomingPagesToFetch) {
              if (upcomingBaseUrl) {
                upcomingPromises.push(
                  fetchTmdbWithProxy(`${upcomingBaseUrl}&with_original_language=${lang}&page=${page}`, { signal: controller.signal })
                );
              }
            }
            for (const page of [1, 2]) {
              if (releasedThisYearUS) {
                yearPromises.push(
                  fetchTmdbWithProxy(`${releasedThisYearUS}&with_original_language=${lang}&page=${page}`, { signal: controller.signal })
                );
              }
              if (releasedThisYearIN) {
                yearPromises.push(
                  fetchTmdbWithProxy(`${releasedThisYearIN}&with_original_language=${lang}&page=${page}`, { signal: controller.signal })
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
          allUpcoming = allUpcoming.filter(m => !releasedIds.has(m.id));

          const hasAnyFilters = Boolean(selectedLang || selectedGenre || selectedYear || selectedOtt);
          if (allMovies.length === 0 && !hasAnyFilters) {
            // Safety fallback: if discover+OTT returns empty due transient upstream/caching
            // conditions, show a stable popular list so the page still works.
            const fallbackUrl =
              `https://api.themoviedb.org/3/discover/movie` +
              `?api_key=${apiKey}` +
              `&sort_by=popularity.desc` +
              `&primary_release_date.lte=${today}` +
              `&vote_count.gte=50` +
              `&include_adult=false` +
              `&watch_region=${country}` +
              `&page=1`;

            const fallbackResponse = await fetchTmdbWithProxy(fallbackUrl, { signal: controller.signal });
            const fallbackData = await fallbackResponse.json();
            const fallbackMovies = (fallbackData.results || []).filter(
              (movie: TrendingMovie) => movie.poster_path && typeof movie.vote_average === 'number' && movie.vote_average > 0
            );
            if (fallbackMovies.length > 0) {
              allMovies = fallbackMovies;
            }
          }

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
  }, [country, selectedLang, selectedGenre, selectedYear, selectedOtt, sortParam, searchQuery]);

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
        const cacheKey = `${country}:${movie.id}`;
        const cached = providerCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < PROVIDER_CACHE_TTL_MS) {
          next[movie.id] = cached.hasOtt ? 'ott' : 'soon';
          continue;
        }
        try {
          const providers = await getWatchProviders(movie.id);
          const region = country === 'IN' ? providers?.results?.IN : providers?.results?.US;
          const hasOtt = (region?.flatrate?.length ?? 0) > 0;
          next[movie.id] = hasOtt ? 'ott' : 'soon';
          const { logos, link, hasOtt: metaHasOtt } = extractProviderMeta(providers, country);
          providerCache.set(cacheKey, { logos, link, hasOtt: metaHasOtt, ts: Date.now() });
          setProviderLogos((prev) => (prev[movie.id] ? prev : { ...prev, [movie.id]: { logos, link } }));
        } catch {
          next[movie.id] = 'soon';
          setProviderLogos((prev) => (prev[movie.id] ? prev : { ...prev, [movie.id]: { logos: [] } }));
        }
      }
      if (!controller.signal.aborted) setStreamingStatus((prev) => ({ ...prev, ...next }));
    })();
    return () => controller.abort();
  }, [searchQuery, movies, country]);

  useEffect(() => {
    if (loading || movies.length === 0) return;
    let cancelled = false;
    const limit = searchQuery ? 36 : 60;
    const targets = movies.slice(0, limit).map((m) => m.id);

    const hydrateFromCache = () => {
      const fromCache: Record<number, { logos: ProviderLogoItem[]; link?: string }> = {};
      for (const id of targets) {
        const cached = providerCache.get(`${country}:${id}`);
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
            const providers = await getWatchProviders(id);
            if (cancelled) return;
            const { logos, link, hasOtt } = extractProviderMeta(providers, country);
            providerCache.set(`${country}:${id}`, { logos, link, hasOtt, ts: Date.now() });
            setProviderLogos((prev) => (prev[id] ? prev : { ...prev, [id]: { logos, link } }));
          } catch {
            providerCache.set(`${country}:${id}`, { logos: [], hasOtt: false, ts: Date.now() });
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
  }, [movies, loading, searchQuery, country]);

  const handleLanguageClick = (code: string) => {
    updateFilters({ lang: selectedLang === code ? '' : code });
  };

  const getLangInfo = (code: string) => {
    return LANGUAGES.find(l => l.code === code) || { name: code.toUpperCase() };
  };

  const currentLang = selectedLang ? getLangInfo(selectedLang) : null;
  const topHeroMovies = useMemo(() => movies.slice(0, 5), [movies]);
  const showHeroCarousel = !searchQuery.trim() && topHeroMovies.length > 0;
  const activeHeroIndex = topHeroMovies.length > 0 ? heroIndex % topHeroMovies.length : 0;

  useEffect(() => {
    if (!showHeroCarousel || pauseHeroAutoSlide || topHeroMovies.length < 2) return;

    const intervalId = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % topHeroMovies.length);
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [showHeroCarousel, pauseHeroAutoSlide, topHeroMovies.length]);

  const goToPrevHero = () => {
    if (topHeroMovies.length < 2) return;
    setHeroIndex((prev) => (prev - 1 + topHeroMovies.length) % topHeroMovies.length);
  };

  const goToNextHero = () => {
    if (topHeroMovies.length < 2) return;
    setHeroIndex((prev) => (prev + 1) % topHeroMovies.length);
  };


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
              {OTT_PROVIDERS.filter((p) => Boolean(p.ids[country])).map((p) => (
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

      {showHeroCarousel && (
        <section
          className="relative mb-10 overflow-hidden rounded-3xl border border-white/10 bg-[var(--bg-secondary)]/40 shadow-[0_18px_60px_rgba(0,0,0,0.45)]"
          aria-label="Top 5 latest and trending movies"
          onMouseEnter={() => setPauseHeroAutoSlide(true)}
          onMouseLeave={() => setPauseHeroAutoSlide(false)}
        >
          <div
            className="flex transition-transform duration-700 ease-out"
            style={{ transform: `translateX(-${activeHeroIndex * 100}%)` }}
          >
            {topHeroMovies.map((movie) => {
              const heroImage = movie.backdrop_path
                ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}`
                : movie.poster_path
                  ? `https://image.tmdb.org/t/p/w780${movie.poster_path}`
                  : '';
              const releaseYear = movie.release_date?.split('-')[0] || 'TBA';
              const langInfo = getLangInfo(movie.original_language);

              return (
                <article key={`hero-${movie.id}`} className="relative min-w-full h-[52vw] min-h-[280px] max-h-[540px]">
                  {heroImage ? (
                    <img
                      src={heroImage}
                      alt={movie.title}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[var(--bg-card)]" />
                  )}
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_35%,rgba(0,0,0,0.12),transparent_40%),linear-gradient(90deg,rgba(2,6,23,0.95)_0%,rgba(2,6,23,0.72)_38%,rgba(2,6,23,0.2)_78%,rgba(2,6,23,0.55)_100%)]" />

                  <div className="relative z-10 h-full flex items-end sm:items-center px-5 sm:px-10 pb-7 sm:pb-0">
                    <div className="max-w-2xl">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/85 mb-3">
                        <span>Top 5</span>
                        <span className="opacity-60">•</span>
                        <span>Latest + Trending</span>
                      </div>
                      <h2 className="text-3xl sm:text-5xl font-black text-white leading-tight drop-shadow-[0_10px_22px_rgba(0,0,0,0.45)]">
                        {movie.title}
                      </h2>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                        <span className="px-2.5 py-1 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] font-semibold">
                          {movie.vote_average > 0 ? `★ ${movie.vote_average.toFixed(1)}` : 'Unrated'}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-white/15 text-white">{releaseYear}</span>
                        <span className="px-2.5 py-1 rounded-full bg-white/15 text-white">{langInfo.name}</span>
                      </div>
                      <p className="mt-3 text-sm sm:text-lg text-white/90 max-w-xl line-clamp-3">
                        {movie.overview || 'No synopsis available yet.'}
                      </p>
                      <div className="mt-4 flex items-center gap-3">
                        <Link
                          href={`/movie/tmdb-${movie.id}${selectedLang ? `?from=${selectedLang}` : ''}`}
                          className="inline-flex items-center gap-2 rounded-xl bg-white/92 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white"
                        >
                          More details
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                        <div className="hidden sm:block">
                          <WatchlistPlusButton
                            movieId={`tmdb-${movie.id}`}
                            title={movie.title}
                            poster={movie.poster_path ? `https://image.tmdb.org/t/p/w300${movie.poster_path}` : ''}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {topHeroMovies.length > 1 && (
            <>
              <button
                type="button"
                onClick={goToPrevHero}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-black/45 border border-white/20 text-white grid place-items-center hover:bg-black/65"
                aria-label="Previous movie"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={goToNextHero}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-black/45 border border-white/20 text-white grid place-items-center hover:bg-black/65"
                aria-label="Next movie"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                {topHeroMovies.map((movie, index) => (
                  <button
                    key={`hero-dot-${movie.id}`}
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

                          {/* Quick watchlist + */}
                          <div className="absolute top-2 left-2 z-10">
                            <WatchlistPlusButton
                              movieId={`tmdb-${movie.id}`}
                              title={movie.title}
                              poster={movie.poster_path ? `https://image.tmdb.org/t/p/w300${movie.poster_path}` : ''}
                            />
                          </div>

                          {/* Coming Soon Badge */}
                          <div className="absolute top-2 left-12 right-2">
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

                  {/* Quick watchlist + */}
                  <div className="absolute top-3 left-3 z-10">
                    <WatchlistPlusButton
                      movieId={`tmdb-${movie.id}`}
                      title={movie.title}
                      poster={movie.poster_path ? `https://image.tmdb.org/t/p/w300${movie.poster_path}` : ''}
                    />
                  </div>

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
                      dedupeLogos(providerLogos[movie.id].logos).slice(0, 3).map((item, idx) => {
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

                  <div className="absolute top-3 left-14 flex flex-col gap-1">
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
          {(selectedLang || selectedGenre || selectedYear || selectedOtt || searchQuery.trim()) && (
            <button
              type="button"
              onClick={() => {
                setExpandedDecade(null);
                updateFilters({ lang: '', genre: '', year: '', ott: '', sort: 'date' });
              }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--bg-primary)] font-semibold hover:bg-[var(--accent-hover)] transition-all"
            >
              Clear filters
            </button>
          )}
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
