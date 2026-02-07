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

  const getWatchedCountThisMonth = useCallback(() => {
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth();
    return Object.values(watchedState).filter((v) => {
      if (!v.watched || !v.watchedAt) return false;
      const d = new Date(v.watchedAt);
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    }).length;
  }, [watchedState]);

  const getWatchedCountThisYear = useCallback(() => {
    const thisYear = new Date().getFullYear();
    return Object.values(watchedState).filter((v) => {
      if (!v.watched || !v.watchedAt) return false;
      return new Date(v.watchedAt).getFullYear() === thisYear;
    }).length;
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
    getWatchedCountThisMonth,
    getWatchedCountThisYear,
    getWatchedIds,
    watchedState,
  };
}
