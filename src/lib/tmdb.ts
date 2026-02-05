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

// Genre mapping
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

// OTT Provider mapping
const PROVIDER_MAP: Record<number, { name: string; platform: string }> = {
  8: { name: 'Netflix', platform: 'Netflix' },
  9: { name: 'Amazon Prime Video', platform: 'Prime Video' },
  122: { name: 'Disney+ Hotstar', platform: 'Hotstar' },
  237: { name: 'Sony LIV', platform: 'SonyLiv' },
  232: { name: 'ZEE5', platform: 'Zee5' },
  121: { name: 'Jio Cinema', platform: 'Jio Cinema' },
  // Aha doesn't have a standard TMDB ID, you'd need to add manually
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

export async function getWatchProviders(movieId: number, region: string = 'IN'): Promise<TMDBWatchProviders | null> {
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

// Indian languages to fetch (ISO 639-1 codes)
const INDIAN_LANGUAGES = ['te', 'hi', 'ta', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu'];

// Fetch genuinely new releases on streaming in India (last 14 days)
export async function getNewReleasesOnStreaming(): Promise<NewRelease[]> {
  if (!TMDB_API_KEY) {
    console.warn('TMDB API key not configured');
    return [];
  }

  try {
    const today = getTodayDate();
    const fourteenDaysAgo = getDateDaysAgo(14);
    const sixtyDaysAgo = getDateDaysAgo(60); // Fallback range

    // First try: Movies released in last 14 days on streaming
    const recentUrl = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&watch_region=IN&with_watch_monetization_types=flatrate&primary_release_date.gte=${fourteenDaysAgo}&primary_release_date.lte=${today}&sort_by=primary_release_date.desc&page=1`;

    // Indian language content from last 14 days
    const indianRecentUrl = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&watch_region=IN&with_watch_monetization_types=flatrate&with_original_language=${INDIAN_LANGUAGES.join('|')}&primary_release_date.gte=${fourteenDaysAgo}&primary_release_date.lte=${today}&sort_by=primary_release_date.desc&page=1`;

    let [allResponse, indianResponse] = await Promise.all([
      fetch(recentUrl),
      fetch(indianRecentUrl)
    ]);

    let allData = allResponse.ok ? await allResponse.json() : { results: [] };
    let indianData = indianResponse.ok ? await indianResponse.json() : { results: [] };

    // If not enough results, expand to 60 days
    if (allData.results.length + indianData.results.length < 5) {
      const expandedUrl = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&watch_region=IN&with_watch_monetization_types=flatrate&primary_release_date.gte=${sixtyDaysAgo}&primary_release_date.lte=${today}&sort_by=primary_release_date.desc&page=1`;
      const expandedIndianUrl = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&watch_region=IN&with_watch_monetization_types=flatrate&with_original_language=${INDIAN_LANGUAGES.join('|')}&primary_release_date.gte=${sixtyDaysAgo}&primary_release_date.lte=${today}&sort_by=primary_release_date.desc&page=1`;

      [allResponse, indianResponse] = await Promise.all([
        fetch(expandedUrl),
        fetch(expandedIndianUrl)
      ]);

      allData = allResponse.ok ? await allResponse.json() : { results: [] };
      indianData = indianResponse.ok ? await indianResponse.json() : { results: [] };
    }

    // Combine: Indian content first, then others (sorted by release date)
    const allMovies = [...indianData.results, ...allData.results];
    const uniqueMovies = allMovies.reduce((acc: NewRelease[], movie: NewRelease) => {
      if (!acc.find(m => m.id === movie.id)) {
        acc.push(movie);
      }
      return acc;
    }, []);

    // Sort by release date (newest first)
    uniqueMovies.sort((a: NewRelease, b: NewRelease) =>
      new Date(b.release_date).getTime() - new Date(a.release_date).getTime()
    );

    const movies: NewRelease[] = uniqueMovies.slice(0, 15);

    // Fetch watch providers for each movie
    const moviesWithProviders = await Promise.all(
      movies.map(async (movie: NewRelease) => {
        const providers = await getWatchProviders(movie.id, 'IN');
        const inProviders = providers?.results?.IN?.flatrate || [];
        return { ...movie, providers: inProviders };
      })
    );

    // Filter to only movies that have streaming providers, limit to 10
    return moviesWithProviders.filter(m => m.providers && m.providers.length > 0).slice(0, 10);
  } catch (error) {
    console.error('Error fetching new releases:', error);
    return [];
  }
}

// Get what's currently popular on streaming in India (recent movies only)
export async function getTrendingToday(): Promise<NewRelease[]> {
  if (!TMDB_API_KEY) {
    console.warn('TMDB API key not configured');
    return [];
  }

  try {
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;

    // Get movies from current & last year that are on streaming in India, sorted by popularity
    // This gives us "what's hot on OTT right now" - recent movies people are actually watching
    const recentPopularUrl = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&watch_region=IN&with_watch_monetization_types=flatrate&primary_release_date.gte=${lastYear}-01-01&sort_by=popularity.desc&vote_count.gte=50&page=1`;

    // Indian language movies currently popular on streaming
    const indianPopularUrl = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&watch_region=IN&with_watch_monetization_types=flatrate&with_original_language=${INDIAN_LANGUAGES.join('|')}&primary_release_date.gte=${lastYear}-01-01&sort_by=popularity.desc&page=1`;

    const [recentResponse, indianResponse] = await Promise.all([
      fetch(recentPopularUrl),
      fetch(indianPopularUrl)
    ]);

    if (!recentResponse.ok) {
      throw new Error(`TMDB API error: ${recentResponse.status}`);
    }

    const recentData = await recentResponse.json();
    const indianData = indianResponse.ok ? await indianResponse.json() : { results: [] };

    // Prioritize Indian content, then mix with global popular
    const allMovies = [...indianData.results.slice(0, 6), ...recentData.results];
    const uniqueMovies = allMovies.reduce((acc: NewRelease[], movie: NewRelease) => {
      if (!acc.find(m => m.id === movie.id)) {
        acc.push(movie);
      }
      return acc;
    }, []);

    const movies: NewRelease[] = uniqueMovies.slice(0, 15);

    // Fetch watch providers for each movie (for India)
    const moviesWithProviders = await Promise.all(
      movies.map(async (movie: NewRelease) => {
        const providers = await getWatchProviders(movie.id, 'IN');
        const inProviders = providers?.results?.IN?.flatrate || [];
        return { ...movie, providers: inProviders };
      })
    );

    // Return movies that have streaming providers in India, limit to 10
    return moviesWithProviders.filter(m => m.providers && m.providers.length > 0).slice(0, 10);
  } catch (error) {
    console.error('Error fetching trending movies:', error);
    return [];
  }
}
