import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buildTmdbV3Url, fetchTmdbWithProxy } from '../lib/tmdb-proxy';
import type {
  DiscoverContentType,
  DiscoverFeedState,
  DiscoverFilters,
  DiscoverSort,
  TMDBDiscoverResponse,
  TMDBMovieSummary,
  TMDBTvSummary,
  TitleSummary,
} from '../types';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

const LANGUAGE_NAMES: Record<string, string> = {
  bn: 'Bengali',
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  gu: 'Gujarati',
  hi: 'Hindi',
  it: 'Italian',
  ja: 'Japanese',
  kn: 'Kannada',
  ko: 'Korean',
  ml: 'Malayalam',
  mr: 'Marathi',
  pa: 'Punjabi',
  ta: 'Tamil',
  te: 'Telugu',
  zh: 'Chinese',
};

function getImageUrl(path: string | null, size: 'w500' | 'w780' | 'original' = 'w500'): string | null {
  return path ? `${TMDB_IMAGE_BASE}/${size}${path}` : null;
}

function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

function getSortBy(kind: DiscoverContentType, sortBy?: DiscoverSort | null): string {
  if (sortBy === 'rating') {
    return 'vote_average.desc';
  }

  if (sortBy === 'release_date') {
    return kind === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
  }

  return 'popularity.desc';
}

function buildDiscoverRequestUrl(
  contentType: DiscoverContentType,
  country: 'IN' | 'US',
  filters: DiscoverFilters,
): string {
  const params: Record<string, number | string> = {
    sort_by: getSortBy(contentType, filters.sortBy),
    watch_region: country,
    with_watch_monetization_types: 'flatrate',
    'vote_average.gte': 6.0,
    'vote_count.gte': 100,
  };

  if (filters.genreId) {
    params.with_genres = filters.genreId;
  }

  if (filters.language) {
    params.with_original_language = filters.language;
  }

  if (filters.providerId) {
    params.with_watch_providers = filters.providerId;
  }

  if (filters.year) {
    params[contentType === 'movie' ? 'primary_release_year' : 'first_air_date_year'] = filters.year;
  }

  return buildTmdbV3Url(`/3/discover/${contentType}`, params);
}

function toYear(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapMovieSummary(movie: TMDBMovieSummary): TitleSummary {
  return {
    tmdbId: movie.id,
    kind: 'movie',
    title: movie.title,
    originalTitle:
      movie.original_title && movie.original_title !== movie.title ? movie.original_title : undefined,
    year: toYear(movie.release_date),
    language: getLanguageName(movie.original_language),
    rating: movie.vote_average ? Math.round(movie.vote_average * 10) / 10 : null,
    synopsis: movie.overview || '',
    posterPath: movie.poster_path,
    posterUrl: getImageUrl(movie.poster_path),
    backdropPath: movie.backdrop_path,
    backdropUrl: getImageUrl(movie.backdrop_path, 'original'),
  };
}

function mapTvSummary(tv: TMDBTvSummary): TitleSummary {
  return {
    tmdbId: tv.id,
    kind: 'tv',
    title: tv.name,
    originalTitle: tv.original_name && tv.original_name !== tv.name ? tv.original_name : undefined,
    year: toYear(tv.first_air_date),
    language: getLanguageName(tv.original_language),
    rating: tv.vote_average ? Math.round(tv.vote_average * 10) / 10 : null,
    synopsis: tv.overview || '',
    posterPath: tv.poster_path,
    posterUrl: getImageUrl(tv.poster_path),
    backdropPath: tv.backdrop_path,
    backdropUrl: getImageUrl(tv.backdrop_path, 'original'),
  };
}

function mapDiscoverItems(
  contentType: DiscoverContentType,
  payload: TMDBDiscoverResponse<TMDBMovieSummary | TMDBTvSummary>,
): TitleSummary[] {
  if (contentType === 'movie') {
    return payload.results.map((item) => mapMovieSummary(item as TMDBMovieSummary));
  }

  return payload.results.map((item) => mapTvSummary(item as TMDBTvSummary));
}

function toError(value: unknown, fallbackMessage: string): Error {
  if (value instanceof Error) {
    return value;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  ) {
    return new Error(value.message);
  }

  return new Error(fallbackMessage);
}

export function useDiscoverFeed(
  country: 'IN' | 'US',
  contentType: DiscoverContentType,
  filters: DiscoverFilters,
): DiscoverFeedState {
  const [items, setItems] = useState<TitleSummary[]>([]);
  const [lastGoodItems, setLastGoodItems] = useState<TitleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const queryHasSucceededRef = useRef(false);
  const queryLastGoodItemsRef = useRef<TitleSummary[]>([]);
  const requestKey = useMemo(
    () => JSON.stringify({ country, contentType, filters }),
    [country, contentType, filters],
  );
  const requestKeyRef = useRef(requestKey);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const isRefresh = mode === 'refresh';
      requestKeyRef.current = requestKey;

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
        setRefreshing(false);
        setError(null);
        setItems([]);
        setLastGoodItems([]);
        queryHasSucceededRef.current = false;
        queryLastGoodItemsRef.current = [];
      }

      try {
        const payload = await fetchTmdbWithProxy<
          TMDBDiscoverResponse<TMDBMovieSummary | TMDBTvSummary>
        >(buildDiscoverRequestUrl(contentType, country, filters));
        const nextItems = mapDiscoverItems(contentType, payload);

        if (requestKeyRef.current !== requestKey) {
          return;
        }

        queryHasSucceededRef.current = true;
        setItems(nextItems);
        setLastGoodItems(nextItems);
        queryLastGoodItemsRef.current = nextItems;
        setError(null);
      } catch (unknownError) {
        if (requestKeyRef.current !== requestKey) {
          return;
        }

        const nextError = toError(unknownError, 'Failed to load discover feed');
        setError(nextError);
        if (isRefresh && queryHasSucceededRef.current) {
          setItems((currentItems) => (currentItems.length > 0 ? currentItems : queryLastGoodItemsRef.current));
        } else {
          setItems([]);
        }
      } finally {
        if (requestKeyRef.current !== requestKey) {
          return;
        }

        if (isRefresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [contentType, country, filters, requestKey],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const refresh = useCallback(async () => {
    await load('refresh');
  }, [load]);

  return {
    items,
    lastGoodItems,
    loading,
    refreshing,
    error,
    refresh,
  };
}
