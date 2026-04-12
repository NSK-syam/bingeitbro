import type { OTTLink } from '../lib/providers';

export type DiscoverCountry = 'IN' | 'US';
export type TitleKind = 'movie' | 'tv';
export type DiscoverContentType = TitleKind;
export type DiscoverSort = 'popularity' | 'rating' | 'release_date';

export type DiscoverFilters = {
  genreId?: number | null;
  language?: string | null;
  providerId?: number | null;
  sortBy?: DiscoverSort | null;
  year?: number | null;
};

export type TMDBGenre = {
  id: number;
  name: string;
};

export type TMDBSpokenLanguage = {
  english_name: string;
  iso_639_1: string;
  name: string;
};

export type TMDBMovieSummary = {
  adult: boolean;
  backdrop_path: string | null;
  genre_ids: number[];
  id: number;
  original_language: string;
  original_title: string;
  overview: string;
  popularity: number;
  poster_path: string | null;
  release_date: string;
  title: string;
  video: boolean;
  vote_average: number;
  vote_count: number;
};

export type TMDBTvSummary = {
  backdrop_path: string | null;
  first_air_date: string;
  genre_ids: number[];
  id: number;
  name: string;
  origin_country?: string[];
  original_language: string;
  original_name: string;
  overview: string;
  popularity: number;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
};

export type TMDBMovieDetail = TMDBMovieSummary & {
  genres: TMDBGenre[];
  runtime: number;
  spoken_languages?: TMDBSpokenLanguage[];
  status?: string;
  tagline?: string;
};

export type TMDBTvDetail = TMDBTvSummary & {
  episode_run_time?: number[];
  genres: TMDBGenre[];
  spoken_languages?: TMDBSpokenLanguage[];
  status?: string;
  tagline?: string;
};

export type TMDBDiscoverResponse<T> = {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
};

export type TitleSummary = {
  backdropPath: string | null;
  backdropUrl: string | null;
  kind: TitleKind;
  language: string;
  originalTitle?: string;
  posterPath: string | null;
  posterUrl: string | null;
  rating: number | null;
  synopsis: string;
  title: string;
  tmdbId: number;
  year: number | null;
};

export type TitleDetail = TitleSummary & {
  duration: string;
  genres: string[];
  providers: OTTLink[];
  status?: string;
  tagline?: string;
};

export type DiscoverFeedState = {
  error: Error | null;
  items: TitleSummary[];
  lastGoodItems: TitleSummary[];
  loading: boolean;
  refresh: () => Promise<void>;
  refreshing: boolean;
};

export type TitleProvidersState = {
  error: Error | null;
  items: OTTLink[];
  loading: boolean;
  retry: () => Promise<void>;
  retrying: boolean;
};

export type TitleDetailState = {
  error: Error | null;
  loading: boolean;
  providers: TitleProvidersState;
  refresh: () => Promise<void>;
  title: TitleDetail | null;
};
