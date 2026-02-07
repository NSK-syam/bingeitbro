// TMDB API Integration
// Get your API key from: https://www.themoviedb.org/settings/api

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
  { key: 'jio_hotstar', name: 'JioHotstar', ids: { US: 337, IN: 2336 } },
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
