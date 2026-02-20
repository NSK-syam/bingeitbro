'use client';

import { useLocalStorage } from './useLocalStorage';
import { useCallback } from 'react';

export type ReactionType = 'fire' | 'heart' | 'mindblown' | 'crying' | 'clap';

export const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'fire', emoji: '', label: 'Fire' },
  { type: 'heart', emoji: '', label: 'Love' },
  { type: 'mindblown', emoji: '', label: 'Mind Blown' },
  { type: 'crying', emoji: '', label: 'Made Me Cry' },
  { type: 'clap', emoji: '', label: 'Must Watch' },
];

interface ReactionsState {
  [movieId: string]: {
    [reaction in ReactionType]?: boolean;
  };
}

export function useReactions() {
  const [reactionsState, setReactionsState] = useLocalStorage<ReactionsState>('cinema-chudu-reactions', {});

  const hasReaction = useCallback((movieId: string, reaction: ReactionType) => {
    return reactionsState[movieId]?.[reaction] ?? false;
  }, [reactionsState]);

  const toggleReaction = useCallback((movieId: string, reaction: ReactionType) => {
    setReactionsState((prev) => {
      const movieReactions = prev[movieId] || {};
      const currentValue = movieReactions[reaction] ?? false;
      return {
        ...prev,
        [movieId]: {
          ...movieReactions,
          [reaction]: !currentValue,
        },
      };
    });
  }, [setReactionsState]);

  const getReactions = useCallback((movieId: string) => {
    return reactionsState[movieId] || {};
  }, [reactionsState]);

  const getReactionCount = useCallback((movieId: string) => {
    const reactions = reactionsState[movieId] || {};
    return Object.values(reactions).filter(Boolean).length;
  }, [reactionsState]);

  const getActiveReactions = useCallback((movieId: string) => {
    const reactions = reactionsState[movieId] || {};
    return REACTIONS.filter((r) => reactions[r.type]);
  }, [reactionsState]);

  return {
    hasReaction,
    toggleReaction,
    getReactions,
    getReactionCount,
    getActiveReactions,
    reactionsState,
  };
}
