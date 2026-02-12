// TMDB API Integration
// Get your API key from: https://www.themoviedb.org/settings/api

import type { OTTLink } from '@/types';

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || '';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  original_language: string;
  popularity: number;
  adult: boolean;
  video: boolean;
}

export interface TMDBTV {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  original_language: string;
  popularity: number;
}

export interface TMDBTVDetails extends TMDBTV {
  genres: { id: number; name: string }[];
  episode_run_time: number[];
  number_of_seasons: number;
  number_of_episodes: number;
  status: string;
  tagline: string;
  spoken_languages: { iso_639_1: string; name: string; english_name: string }[];
}

export interface TMDBMovieDetails extends TMDBMovie {
  genres: { id: number; name: string }[];
  runtime: number;
  status: string;
  tagline: string;
  budget: number;
  revenue: number;
  production_companies: { id: number; name: string; logo_path: string | null }[];
  spoken_languages: { iso_639_1: string; name: string; english_name: string }[];
}

export interface TMDBSearchResult {
  page: number;
  results: TMDBMovie[];
  total_pages: number;
  total_results: number;
}

export interface TMDBTVSearchResult {
  page: number;
  results: TMDBTV[];
  total_pages: number;
  total_results: number;
}

export interface TMDBWatchProviders {
  results: {
    [countryCode: string]: {
      link: string;
      flatrate?: { provider_id: number; provider_name: string; logo_path: string }[];
      rent?: { provider_id: number; provider_name: string; logo_path: string }[];
      buy?: { provider_id: number; provider_name: string; logo_path: string }[];
    };
  };
}

// Genre mapping (ID -> name)
const GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};

/** Genre list for filter UIs (id, name) */
export const GENRE_LIST: { id: number; name: string }[] = Object.entries(GENRE_MAP)
  .map(([id, name]) => ({ id: Number(id), name }))
  .sort((a, b) => a.name.localeCompare(b.name));

export type OTTProvider = {
  key: string;
  name: string;
  ids: { US?: number; IN?: number };
  languages?: string[];
};

/** OTT / watch providers for filter (TMDB provider_id). USA + India relevant. */
export const OTT_PROVIDERS: OTTProvider[] = [
  { key: 'netflix', name: 'Netflix', ids: { US: 8, IN: 8 } },
  { key: 'prime', name: 'Prime Video', ids: { US: 9, IN: 119 } },
  { key: 'apple_tv', name: 'Apple TV+', ids: { US: 350, IN: 350 } },
  { key: 'disney_plus', name: 'Disney+', ids: { US: 337 } },
  { key: 'jio_hotstar', name: 'JioHotstar', ids: { IN: 2336 } },
  { key: 'sonyliv', name: 'SonyLiv', ids: { IN: 237 } },
  { key: 'zee5', name: 'Zee5', ids: { IN: 232 } },
  { key: 'aha', name: 'Aha', ids: { IN: 532 }, languages: ['te', 'ta'] },
  { key: 'youtube', name: 'YouTube', ids: { US: 192, IN: 192 } },
  { key: 'hulu', name: 'Hulu', ids: { US: 15 } },
  { key: 'peacock', name: 'Peacock', ids: { US: 386 } },
  { key: 'paramount', name: 'Paramount+', ids: { US: 531 } },
];

/** OTT providers that only have specific languages (numeric provider_id mapping). */
export const OTT_TO_LANGUAGES: Record<number, string[]> = {
  532: ['te', 'ta'], // Aha: Telugu, Tamil only
};

const LEGACY_OTT_ID_TO_KEY: Record<number, string> = {
  122: 'jio_hotstar', // Disney+ Hotstar (legacy)
  283: 'aha', // Aha (legacy)
  220: 'jio_hotstar', // Jio Cinema (not in TMDB list anymore)
  2: 'apple_tv', // Apple TV Store (legacy)
};

export function resolveOttProvider(selectedOtt: string): OTTProvider | null {
  if (!selectedOtt) return null;
  const byKey = OTT_PROVIDERS.find((p) => p.key === selectedOtt);
  if (byKey) return byKey;
  const numeric = Number(selectedOtt);
  if (!Number.isNaN(numeric)) {
    const legacyKey = LEGACY_OTT_ID_TO_KEY[numeric];
    if (legacyKey) {
      return OTT_PROVIDERS.find((p) => p.key === legacyKey) || null;
    }
    return OTT_PROVIDERS.find((p) => Object.values(p.ids).includes(numeric)) || null;
  }
  return null;
}

// Language mapping
const LANGUAGE_MAP: Record<string, string> = {
  en: 'English',
  te: 'Telugu',
  hi: 'Hindi',
  ta: 'Tamil',
  ml: 'Malayalam',
  kn: 'Kannada',
  bn: 'Bengali',
  mr: 'Marathi',
  ko: 'Korean',
  ja: 'Japanese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  zh: 'Chinese',
};

export function getImageUrl(path: string | null, size: 'w500' | 'w780' | 'original' = 'w500'): string {
  if (!path) return '';
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function getGenreNames(genreIds: number[]): string[] {
  return genreIds.map((id) => GENRE_MAP[id] || 'Unknown').filter(Boolean);
}

export function getLanguageName(code: string): string {
  return LANGUAGE_MAP[code] || code.toUpperCase();
}

export function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export function formatEpisodeRuntime(runTimes: number[] | null | undefined): string {
  const list = Array.isArray(runTimes) ? runTimes.filter((n) => typeof n === 'number' && n > 0) : [];
  const minutes = list.length > 0 ? list[0] : 0;
  return minutes > 0 ? formatRuntime(minutes) : '';
}

export async function searchMovies(query: string, page: number = 1): Promise<TMDBSearchResult | null> {
  if (!TMDB_API_KEY) {
    console.warn('TMDB API key not configured');
    return null;
  }

  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`
    );

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error searching movies:', error);
    return null;
  }
}

export async function searchTV(query: string, page: number = 1): Promise<TMDBTVSearchResult | null> {
  if (!TMDB_API_KEY) {
    console.warn('TMDB API key not configured');
    return null;
  }

  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`
    );

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error searching TV shows:', error);
    return null;
  }
}

export async function getMovieDetails(movieId: number): Promise<TMDBMovieDetails | null> {
  if (!TMDB_API_KEY) {
    console.warn('TMDB API key not configured');
    return null;
  }

  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching movie details:', error);
    return null;
  }
}

export async function getTVDetails(tvId: number): Promise<TMDBTVDetails | null> {
  if (!TMDB_API_KEY) {
    console.warn('TMDB API key not configured');
    return null;
  }

  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/tv/${tvId}?api_key=${TMDB_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching TV details:', error);
    return null;
  }
}

export async function getWatchProviders(movieId: number): Promise<TMDBWatchProviders | null> {
  if (!TMDB_API_KEY) {
    console.warn('TMDB API key not configured');
    return null;
  }

  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/${movieId}/watch/providers?api_key=${TMDB_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching watch providers:', error);
    return null;
  }
}

export async function getTVWatchProviders(tvId: number): Promise<TMDBWatchProviders | null> {
  if (!TMDB_API_KEY) {
    console.warn('TMDB API key not configured');
    return null;
  }

  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/tv/${tvId}/watch/providers?api_key=${TMDB_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching TV watch providers:', error);
    return null;
  }
}

// Convert TMDB movie to our recommendation format
export function tmdbToRecommendation(
  movie: TMDBMovieDetails,
  recommendedBy: { id: string; name: string; avatar: string },
  personalNote: string,
  ottLinks: { platform: string; url: string; availableIn?: string }[] = []
): {
  id: string;
  title: string;
  originalTitle: string | undefined;
  year: number;
  type: 'movie';
  poster: string;
  backdrop: string;
  genres: string[];
  language: string;
  duration: string;
  rating: number;
  recommendedBy: { id: string; name: string; avatar: string };
  personalNote: string;
  mood: string[];
  watchWith: string;
  ottLinks: { platform: string; url: string; availableIn?: string }[];
  addedOn: string;
} {
  return {
    id: `tmdb-${movie.id}`,
    title: movie.title,
    originalTitle: movie.original_title !== movie.title ? movie.original_title : undefined,
    year: new Date(movie.release_date).getFullYear(),
    type: 'movie',
    poster: getImageUrl(movie.poster_path),
    backdrop: getImageUrl(movie.backdrop_path, 'original'),
    genres: movie.genres.map((g) => g.name),
    language: getLanguageName(movie.original_language),
    duration: formatRuntime(movie.runtime),
    rating: Math.round(movie.vote_average * 10) / 10,
    recommendedBy,
    personalNote,
    mood: [] as string[],
    watchWith: '',
    ottLinks,
    addedOn: new Date().toISOString(),
  };
}

export function tmdbTVToRecommendation(
  tv: TMDBTVDetails,
  recommendedBy: { id: string; name: string; avatar: string },
  personalNote: string,
  ottLinks: { platform: string; url: string; availableIn?: string }[] = []
): {
  id: string;
  title: string;
  originalTitle: string | undefined;
  year: number;
  type: 'series';
  poster: string;
  backdrop: string;
  genres: string[];
  language: string;
  duration: string;
  rating: number;
  recommendedBy: { id: string; name: string; avatar: string };
  personalNote: string;
  mood: string[];
  watchWith: string;
  ottLinks: { platform: string; url: string; availableIn?: string }[];
  addedOn: string;
} {
  const year = tv.first_air_date ? new Date(tv.first_air_date).getFullYear() : new Date().getFullYear();
  return {
    id: `tmdbtv-${tv.id}`,
    title: tv.name,
    originalTitle: tv.original_name !== tv.name ? tv.original_name : undefined,
    year,
    type: 'series',
    poster: getImageUrl(tv.poster_path),
    backdrop: getImageUrl(tv.backdrop_path, 'original'),
    genres: tv.genres.map((g) => g.name),
    language: getLanguageName(tv.original_language),
    duration: formatEpisodeRuntime(tv.episode_run_time),
    rating: Math.round(tv.vote_average * 10) / 10,
    recommendedBy,
    personalNote,
    mood: [] as string[],
    watchWith: '',
    ottLinks,
    addedOn: new Date().toISOString(),
  };
}

// Check if TMDB is configured
export function isTMDBConfigured(): boolean {
  return !!TMDB_API_KEY;
}

// Get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// Get date X days ago in YYYY-MM-DD format
function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

export interface NewRelease {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  overview: string;
  genre_ids: number[];
  original_language: string;
  providers?: { provider_id: number; provider_name: string; logo_path: string }[];
}

// Languages for "New Today": English + Indian (Telugu, Hindi, Tamil, etc.)
const NEW_TODAY_LANGUAGES = ['en', 'te', 'hi', 'ta', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu'];

// Indian languages (for trending / other features)
const INDIAN_LANGUAGES = ['te', 'hi', 'ta', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu'];

// Focus: OTT releases only (no theatrical). Regions: USA + India.
const WATCH_REGIONS = ['US', 'IN'] as const;
type WatchRegion = (typeof WATCH_REGIONS)[number];

function mergeFlatrateProviders(
  providers: TMDBWatchProviders | null,
  regions: readonly WatchRegion[]
): { provider_id: number; provider_name: string; logo_path: string }[] {
  if (!providers?.results) return [];
  const seen = new Set<number>();
  const merged: { provider_id: number; provider_name: string; logo_path: string }[] = [];
  for (const region of regions) {
    const flat = providers.results[region]?.flatrate || [];
    for (const p of flat) {
      if (!seen.has(p.provider_id)) {
        seen.add(p.provider_id);
        merged.push(p);
      }
    }
  }
  return merged;
}

// New releases on OTT only (USA + India). 10-day window.
export async function getNewReleasesOnStreaming(): Promise<NewRelease[]> {
  if (!TMDB_API_KEY) {
    console.warn('TMDB API key not configured');
    return [];
  }

  try {
    const today = getTodayDate();
    const tenDaysAgo = getDateDaysAgo(10);

    const baseParamsNoRegion = `api_key=${TMDB_API_KEY}&with_watch_monetization_types=flatrate&sort_by=primary_release_date.desc&primary_release_date.gte=${tenDaysAgo}&primary_release_date.lte=${today}`;

    // Fetch page 1 and 2 for both USA and India (OTT only) to get more new movies
    const urls = [
      `${TMDB_BASE_URL}/discover/movie?${baseParamsNoRegion}&watch_region=US&with_original_language=${NEW_TODAY_LANGUAGES.join(',')}&page=1`,
      `${TMDB_BASE_URL}/discover/movie?${baseParamsNoRegion}&watch_region=US&with_original_language=${NEW_TODAY_LANGUAGES.join(',')}&page=2`,
      `${TMDB_BASE_URL}/discover/movie?${baseParamsNoRegion}&watch_region=US&page=1`,
      `${TMDB_BASE_URL}/discover/movie?${baseParamsNoRegion}&watch_region=US&page=2`,
      `${TMDB_BASE_URL}/discover/movie?${baseParamsNoRegion}&watch_region=IN&with_original_language=${NEW_TODAY_LANGUAGES.join(',')}&page=1`,
      `${TMDB_BASE_URL}/discover/movie?${baseParamsNoRegion}&watch_region=IN&with_original_language=${NEW_TODAY_LANGUAGES.join(',')}&page=2`,
      `${TMDB_BASE_URL}/discover/movie?${baseParamsNoRegion}&watch_region=IN&page=1`,
      `${TMDB_BASE_URL}/discover/movie?${baseParamsNoRegion}&watch_region=IN&page=2`,
    ];
    const responses = await Promise.all(urls.map(u => fetch(u)));
    const collect = async (res: Response) => (res.ok ? (await res.json()).results || [] : []);
    const results = await Promise.all(responses.map(collect));
    const flat = results.flat();

    const byId = new Map<number, NewRelease>();
    flat.forEach((m: NewRelease) => byId.set(m.id, m));
    const allMovies = Array.from(byId.values());
    allMovies.sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime());

    const movies: NewRelease[] = allMovies.slice(0, 35);

    // Fetch watch providers: include if streaming in USA or India
    const moviesWithProviders = await Promise.all(
      movies.map(async (movie: NewRelease) => {
        const providers = await getWatchProviders(movie.id);
        const merged = mergeFlatrateProviders(providers, WATCH_REGIONS);
        return { ...movie, providers: merged };
      })
    );

    return moviesWithProviders.filter((m) => m.providers && m.providers.length > 0).slice(0, 15);
  } catch (error) {
    console.error('Error fetching new releases:', error);
    return [];
  }
}

// Normalizes watch provider names so the UI doesn't show duplicates like
// "Prime Video" + "Amazon Prime Video" as two separate logos.
export function normalizeWatchProviderKey(name: string): string {
  const raw = (name || '').toLowerCase().trim();
  if (!raw) return '';
  const lower = raw
    .replace(/\s+with\s+ads/g, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (lower.includes('netflix')) return 'netflix';
  if (lower.includes('prime')) return 'prime video';
  if (lower.includes('amazon video')) return 'prime video';
  // Important: don't merge Disney+ (US) with Hotstar/JioHotstar (India).
  if (lower.includes('hotstar')) return 'jiohotstar';
  if (lower.includes('jiohotstar')) return 'jiohotstar';
  if (lower.includes('jio') && lower.includes('cinema')) return 'jiohotstar';
  if (lower.includes('disney')) return 'disney+';
  if (lower.includes('apple')) return 'apple tv';
  if (lower.includes('aha')) return 'aha';
  if (lower.includes('sonyliv')) return 'sonyliv';
  if (lower.includes('zee5')) return 'zee5';
  if (lower.includes('youtube')) return 'youtube';
  if (lower.includes('hulu')) return 'hulu';
  if (lower.includes('peacock')) return 'peacock';
  if (lower.includes('paramount')) return 'paramount+';
  if (lower.includes('crunchyroll')) return 'crunchyroll';
  return lower;
}

function getDirectOttLink(platformName: string, title: string): string | null {
  const encodedTitle = encodeURIComponent((title || '').trim());
  if (!encodedTitle) return null;
  const lowerName = platformName.toLowerCase();

  // Prime's app-oriented universal domain. This has better odds of opening
  // the installed Prime Video app on mobile than www.primevideo.com.
  if (lowerName.includes('prime') || lowerName.includes('amazon')) {
    return `https://app.primevideo.com/search?phrase=${encodedTitle}`;
  }

  return null;
}

type ProviderEntryAny = { provider_name?: string; logo_path?: string | null };
type ProviderRegionAny = {
  link?: string;
  flatrate?: ProviderEntryAny[];
  free?: ProviderEntryAny[];
  ads?: ProviderEntryAny[];
  rent?: ProviderEntryAny[];
  buy?: ProviderEntryAny[];
};

export function tmdbWatchProvidersToOttLinks(
  providers: TMDBWatchProviders | null,
  title: string,
  tmdbId?: number,
  mediaType: 'movie' | 'tv' = 'movie',
): OTTLink[] {
  const results = (providers as unknown as { results?: Record<string, ProviderRegionAny> } | null)?.results;
  if (!results) return [];

  const regionLabels: Record<string, string> = { IN: 'India', US: 'USA' };
  const byPlatform = new Map<string, { platform: string; logoPath?: string; url?: string; regions: Set<string> }>();

  const fallbackUrl =
    typeof tmdbId === 'number'
      ? `https://www.themoviedb.org/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}/watch`
      : `https://www.themoviedb.org/search?query=${encodeURIComponent(title)}`;

  for (const [region, label] of Object.entries(regionLabels)) {
    const r = results[region];
    if (!r) continue;
    const list: ProviderEntryAny[] = [
      ...(r.flatrate ?? []),
      ...(r.free ?? []),
      ...(r.ads ?? []),
      ...(r.rent ?? []),
      ...(r.buy ?? []),
    ];
    for (const p of list) {
      const name = (p.provider_name ?? '').trim();
      if (!name) continue;
      const key = normalizeWatchProviderKey(name);
      if (!key) continue;
      const providerDeepLink = getDirectOttLink(name, title);
      const prev =
        byPlatform.get(key) ?? { platform: name, regions: new Set<string>(), url: providerDeepLink ?? r.link ?? fallbackUrl };
      prev.regions.add(label);
      if (!prev.logoPath && p.logo_path) prev.logoPath = p.logo_path;
      if (providerDeepLink) {
        prev.url = providerDeepLink;
      } else if (!prev.url && r.link) {
        prev.url = r.link;
      }
      // Prefer the "cleaner" display name if we see multiple variants.
      if (prev.platform.length > name.length) prev.platform = name;
      byPlatform.set(key, prev);
    }
  }

  const links: OTTLink[] = [];
  for (const [, meta] of byPlatform.entries()) {
    links.push({
      platform: meta.platform,
      url: meta.url ?? fallbackUrl,
      availableIn: Array.from(meta.regions).join(' & '),
      logoPath: meta.logoPath,
    });
  }
  return links;
}

// OTT only. Popular on streaming in USA + India (recent movies).
export async function getTrendingToday(): Promise<NewRelease[]> {
  if (!TMDB_API_KEY) {
    console.warn('TMDB API key not configured');
    return [];
  }

  try {
    const lastYear = new Date().getFullYear() - 1;
    const base = `api_key=${TMDB_API_KEY}&with_watch_monetization_types=flatrate&primary_release_date.gte=${lastYear}-01-01&sort_by=popularity.desc`;

    const [usRecent, usIndian, inRecent, inIndian] = await Promise.all([
      fetch(`${TMDB_BASE_URL}/discover/movie?${base}&watch_region=US&vote_count.gte=50&page=1`),
      fetch(`${TMDB_BASE_URL}/discover/movie?${base}&watch_region=US&with_original_language=${INDIAN_LANGUAGES.join('|')}&page=1`),
      fetch(`${TMDB_BASE_URL}/discover/movie?${base}&watch_region=IN&vote_count.gte=50&page=1`),
      fetch(`${TMDB_BASE_URL}/discover/movie?${base}&watch_region=IN&with_original_language=${INDIAN_LANGUAGES.join('|')}&page=1`),
    ]);

    const collect = async (res: Response) => (res.ok ? (await res.json()).results || [] : []);
    const [usR, usI, inR, inI] = await Promise.all([
      collect(usRecent), collect(usIndian), collect(inRecent), collect(inIndian),
    ]);

    const byId = new Map<number, NewRelease>();
    [...inI.slice(0, 6), ...inR, ...usI.slice(0, 6), ...usR].forEach((m: NewRelease) => byId.set(m.id, m));
    const movies: NewRelease[] = Array.from(byId.values()).slice(0, 15);

    const moviesWithProviders = await Promise.all(
      movies.map(async (movie: NewRelease) => {
        const providers = await getWatchProviders(movie.id);
        return { ...movie, providers: mergeFlatrateProviders(providers, WATCH_REGIONS) };
      })
    );

    return moviesWithProviders.filter(m => m.providers && m.providers.length > 0).slice(0, 10);
  } catch (error) {
    console.error('Error fetching trending movies:', error);
    return [];
  }
}
