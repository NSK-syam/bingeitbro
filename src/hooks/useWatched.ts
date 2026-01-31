'use client';

import { useLocalStorage } from './useLocalStorage';
import { useCallback } from 'react';

interface WatchedState {
  [movieId: string]: {
    watched: boolean;
    watchedAt?: string;
  };
}

export function useWatched() {
  const [watchedState, setWatchedState] = useLocalStorage<WatchedState>('cinema-chudu-watched', {});

  const isWatched = useCallback((movieId: string) => {
    return watchedState[movieId]?.watched ?? false;
  }, [watchedState]);

  const toggleWatched = useCallback((movieId: string) => {
    setWatchedState((prev) => {
      const currentlyWatched = prev[movieId]?.watched ?? false;
      return {
        ...prev,
        [movieId]: {
          watched: !currentlyWatched,
          watchedAt: !currentlyWatched ? new Date().toISOString() : undefined,
        },
      };
    });
  }, [setWatchedState]);

  const setWatched = useCallback((movieId: string, watched: boolean) => {
    setWatchedState((prev) => ({
      ...prev,
      [movieId]: {
        watched,
        watchedAt: watched ? new Date().toISOString() : undefined,
      },
    }));
  }, [setWatchedState]);

  const getWatchedCount = useCallback(() => {
    return Object.values(watchedState).filter((v) => v.watched).length;
  }, [watchedState]);

  const getWatchedIds = useCallback(() => {
    return Object.entries(watchedState)
      .filter(([, v]) => v.watched)
      .map(([id]) => id);
  }, [watchedState]);

  return {
    isWatched,
    toggleWatched,
    setWatched,
    getWatchedCount,
    getWatchedIds,
    watchedState,
  };
}
