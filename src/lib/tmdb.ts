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
) {
  return {
    id: `tmdb-${movie.id}`,
    title: movie.title,
    originalTitle: movie.original_title !== movie.title ? movie.original_title : undefined,
    year: new Date(movie.release_date).getFullYear(),
    type: 'movie' as const,
    poster: getImageUrl(movie.poster_path),
    backdrop: getImageUrl(movie.backdrop_path, 'original'),
    genres: movie.genres.map((g) => g.name),
    language: getLanguageName(movie.original_language),
    duration: formatRuntime(movie.runtime),
    rating: Math.round(movie.vote_average * 10) / 10,
    recommendedBy,
    personalNote,
    mood: [],
    watchWith: '',
    ottLinks,
    addedOn: new Date().toISOString(),
  };
}

// Check if TMDB is configured
export function isTMDBConfigured(): boolean {
  return !!TMDB_API_KEY;
}
