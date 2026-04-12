import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { TMDBWatchProviders } from '../lib/providers';
import { tmdbWatchProvidersToOttLinks } from '../lib/providers';
import { buildTmdbV3Url, fetchTmdbWithProxy } from '../lib/tmdb-proxy';
import type {
  TMDBMovieDetail,
  TMDBSpokenLanguage,
  TMDBTvDetail,
  TitleDetail,
  TitleDetailState,
  TitleKind,
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

function resolveLanguage(
  originalLanguage: string,
  spokenLanguages: TMDBSpokenLanguage[] | undefined,
): string {
  const spoken = spokenLanguages?.find((entry) => entry.iso_639_1 === originalLanguage);

  if (spoken?.english_name) {
    return spoken.english_name;
  }

  return getLanguageName(originalLanguage);
}

function formatRuntime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '';
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours <= 0) {
    return `${remainingMinutes}m`;
  }

  if (remainingMinutes <= 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

function formatEpisodeRuntime(runTimes: number[] | undefined): string {
  const minutes = runTimes?.find((value) => Number.isFinite(value) && value > 0) ?? 0;
  return formatRuntime(minutes);
}

function toYear(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : null;
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

function mapMovieDetail(detail: TMDBMovieDetail, providers: ReturnType<typeof tmdbWatchProvidersToOttLinks>): TitleDetail {
  return {
    tmdbId: detail.id,
    kind: 'movie',
    title: detail.title,
    originalTitle: detail.original_title && detail.original_title !== detail.title ? detail.original_title : undefined,
    year: toYear(detail.release_date),
    language: resolveLanguage(detail.original_language, detail.spoken_languages),
    rating: detail.vote_average ? Math.round(detail.vote_average * 10) / 10 : null,
    synopsis: detail.overview || '',
    posterPath: detail.poster_path,
    posterUrl: getImageUrl(detail.poster_path),
    backdropPath: detail.backdrop_path,
    backdropUrl: getImageUrl(detail.backdrop_path, 'original'),
    genres: detail.genres.map((genre) => genre.name),
    duration: formatRuntime(detail.runtime),
    providers,
    status: detail.status,
    tagline: detail.tagline,
  };
}

function mapTvDetail(detail: TMDBTvDetail, providers: ReturnType<typeof tmdbWatchProvidersToOttLinks>): TitleDetail {
  return {
    tmdbId: detail.id,
    kind: 'tv',
    title: detail.name,
    originalTitle: detail.original_name && detail.original_name !== detail.name ? detail.original_name : undefined,
    year: toYear(detail.first_air_date),
    language: resolveLanguage(detail.original_language, detail.spoken_languages),
    rating: detail.vote_average ? Math.round(detail.vote_average * 10) / 10 : null,
    synopsis: detail.overview || '',
    posterPath: detail.poster_path,
    posterUrl: getImageUrl(detail.poster_path),
    backdropPath: detail.backdrop_path,
    backdropUrl: getImageUrl(detail.backdrop_path, 'original'),
    genres: detail.genres.map((genre) => genre.name),
    duration: formatEpisodeRuntime(detail.episode_run_time),
    providers,
    status: detail.status,
    tagline: detail.tagline,
  };
}

export function useTitleDetail(kind: TitleKind, tmdbId: number): TitleDetailState {
  const [title, setTitle] = useState<TitleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [providerItems, setProviderItems] = useState<ReturnType<typeof tmdbWatchProvidersToOttLinks>>([]);
  const [providerError, setProviderError] = useState<Error | null>(null);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerRetrying, setProviderRetrying] = useState(false);
  const requestKey = useMemo(() => `${kind}:${tmdbId}`, [kind, tmdbId]);
  const requestKeyRef = useRef(requestKey);
  const detailRef = useRef<TMDBMovieDetail | TMDBTvDetail | null>(null);
  const providerItemsRef = useRef<ReturnType<typeof tmdbWatchProvidersToOttLinks>>([]);

  const applyProvidersToTitle = useCallback((nextProviders: ReturnType<typeof tmdbWatchProvidersToOttLinks>) => {
    providerItemsRef.current = nextProviders;
    setProviderItems(nextProviders);
    setTitle((currentTitle) => {
      if (!currentTitle) {
        return currentTitle;
      }

      return {
        ...currentTitle,
        providers: nextProviders,
      };
    });
  }, []);

  const fetchProviders = useCallback(
    async (mode: 'initial' | 'retry' = 'initial') => {
      requestKeyRef.current = requestKey;

      if (mode === 'retry') {
        setProviderRetrying(true);
      } else {
        setProviderLoading(true);
      }

      try {
        const providersPayload = await fetchTmdbWithProxy<TMDBWatchProviders>(
          buildTmdbV3Url(`/3/${kind}/${tmdbId}/watch/providers`),
        );

        if (requestKeyRef.current !== requestKey) {
          return;
        }

        const detailValue = detailRef.current;
        const titleName =
          detailValue && 'title' in detailValue
            ? detailValue.title
            : detailValue && 'name' in detailValue
              ? detailValue.name
              : '';
        const nextProviders = tmdbWatchProvidersToOttLinks(
          providersPayload,
          titleName,
        );

        applyProvidersToTitle(nextProviders);
        setProviderError(null);
      } catch (unknownError) {
        if (requestKeyRef.current !== requestKey) {
          return;
        }

        const nextError = toError(unknownError, 'Failed to load title providers');
        setProviderError(nextError);
        applyProvidersToTitle([]);
      } finally {
        if (requestKeyRef.current !== requestKey) {
          return;
        }

        if (mode === 'retry') {
          setProviderRetrying(false);
        } else {
          setProviderLoading(false);
        }
      }
    },
    [applyProvidersToTitle, kind, requestKey, tmdbId],
  );

  const refresh = useCallback(async () => {
    requestKeyRef.current = requestKey;
    setLoading(true);

    try {
      const detailPayload = await fetchTmdbWithProxy<TMDBMovieDetail | TMDBTvDetail>(
        buildTmdbV3Url(`/3/${kind}/${tmdbId}`),
      );

      if (requestKeyRef.current !== requestKey) {
        return;
      }

      detailRef.current = detailPayload;
      const nextTitle =
        kind === 'movie'
          ? mapMovieDetail(detailPayload as TMDBMovieDetail, providerItemsRef.current)
          : mapTvDetail(detailPayload as TMDBTvDetail, providerItemsRef.current);

      setTitle(nextTitle);
      setError(null);
    } catch (unknownError) {
      if (requestKeyRef.current !== requestKey) {
        return;
      }

      const nextError = toError(unknownError, 'Failed to load title detail');
      setError(nextError);
      return;
    } finally {
      if (requestKeyRef.current === requestKey) {
        setLoading(false);
      }
    }

    await fetchProviders('initial');
  }, [fetchProviders, kind, requestKey, tmdbId]);

  useEffect(() => {
    detailRef.current = null;
    providerItemsRef.current = [];
    setTitle(null);
    setProviderItems([]);
    setProviderError(null);
    setError(null);
    void refresh();
  }, [refresh]);

  const retryProviders = useCallback(async () => {
    await fetchProviders('retry');
  }, [fetchProviders]);

  return {
    title,
    loading,
    error,
    refresh,
    providers: {
      items: providerItems,
      loading: providerLoading,
      retrying: providerRetrying,
      error: providerError,
      retry: retryProviders,
    },
  };
}
