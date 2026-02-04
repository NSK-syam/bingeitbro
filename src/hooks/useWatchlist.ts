'use client';

import { useLocalStorage } from './useLocalStorage';
import { useCallback } from 'react';

interface WatchlistItem {
  addedAt: string;
  title?: string;
  poster?: string;
}

interface WatchlistState {
  [movieId: string]: WatchlistItem;
}

export function useWatchlist() {
  const [watchlistState, setWatchlistState] = useLocalStorage<WatchlistState>('cinema-chudu-watchlist', {});

  const isInWatchlist = useCallback((movieId: string) => {
    return !!watchlistState[movieId];
  }, [watchlistState]);

  const addToWatchlist = useCallback((movieId: string, title?: string, poster?: string) => {
    setWatchlistState((prev) => ({
      ...prev,
      [movieId]: {
        addedAt: new Date().toISOString(),
        title,
        poster,
      },
    }));
  }, [setWatchlistState]);

  const removeFromWatchlist = useCallback((movieId: string) => {
    setWatchlistState((prev) => {
      const newState = { ...prev };
      delete newState[movieId];
      return newState;
    });
  }, [setWatchlistState]);

  const toggleWatchlist = useCallback((movieId: string, title?: string, poster?: string) => {
    if (isInWatchlist(movieId)) {
      removeFromWatchlist(movieId);
    } else {
      addToWatchlist(movieId, title, poster);
    }
  }, [isInWatchlist, addToWatchlist, removeFromWatchlist]);

  const getWatchlistCount = useCallback(() => {
    return Object.keys(watchlistState).length;
  }, [watchlistState]);

  const getWatchlistIds = useCallback(() => {
    return Object.keys(watchlistState);
  }, [watchlistState]);

  const getWatchlistItems = useCallback(() => {
    return Object.entries(watchlistState).map(([id, item]) => ({
      id,
      ...item,
    }));
  }, [watchlistState]);

  return {
    isInWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    toggleWatchlist,
    getWatchlistCount,
    getWatchlistIds,
    getWatchlistItems,
    watchlistState,
  };
}
