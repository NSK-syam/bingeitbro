'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';

interface Nudge {
  id: string;
  from_user_id: string;
  to_user_id: string;
  recommendation_id: string | null;
  movie_id?: string | null;
  friend_recommendation_id?: string | null;
  tmdb_id?: string | null;
  movie_title?: string | null;
  movie_poster?: string | null;
  movie_year?: number | null;
  message: string | null;
  is_read: boolean;
  created_at: string;
  from_user?: {
    id: string;
    name: string;
    avatar: string;
  };
  recommendation?: {
    id: string;
    title: string;
    poster: string;
  };
}

type NudgePayload =
  | string
  | {
      recommendationId?: string;
      tmdbId?: string;
      movieTitle?: string;
      moviePoster?: string;
      movieYear?: number | null;
      friendRecommendationId?: string;
      message?: string | null;
    };

export function useNudges() {
  const { user } = useAuth();
  const [receivedNudges, setReceivedNudges] = useState<Nudge[]>([]);
  const [sentNudgeIds, setSentNudgeIds] = useState<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const parseLegacyMovieId = (movieId?: string | null) => {
    if (!movieId) return { recommendationId: null, tmdbId: null };
    if (movieId.startsWith('tmdb-')) {
      return { recommendationId: null, tmdbId: movieId.replace('tmdb-', '') };
    }
    return { recommendationId: movieId, tmdbId: null };
  };

  const addSentNudgeId = (recommendationId?: string | null, tmdbId?: string | null, legacyMovieId?: string | null) => {
    setSentNudgeIds((prev) => {
      const next = new Set(prev);
      if (recommendationId) next.add(`rec:${recommendationId}`);
      if (tmdbId) next.add(`tmdb:${tmdbId}`);
      if (!recommendationId && !tmdbId && legacyMovieId) {
        const parsed = parseLegacyMovieId(legacyMovieId);
        if (parsed.recommendationId) next.add(`rec:${parsed.recommendationId}`);
        if (parsed.tmdbId) next.add(`tmdb:${parsed.tmdbId}`);
      }
      return next;
    });
  };

  const fetchNudges = useCallback(async () => {
    if (!user || !isSupabaseConfigured()) {
      setReceivedNudges([]);
      setSentNudgeIds(new Set());
      setLoading(false);
      return;
    }

    const supabase = createClient();

    try {
      // Fetch received nudges (new schema)
      const primaryReceived = await supabase
        .from('nudges')
        .select(`
          *,
          from_user:users!nudges_from_user_id_fkey(id, name, avatar),
          recommendation:recommendations(id, title, poster)
        `)
        .eq('to_user_id', user.id)
        .order('created_at', { ascending: false });

      let receivedData = primaryReceived.data as Nudge[] | null;

      if (primaryReceived.error) {
        // Fallback: older schema (sender_id/recipient_id + movie_id)
        const legacyReceived = await supabase
          .from('nudges')
          .select(`
            *,
            from_user:users!nudges_sender_id_fkey(id, name, avatar)
          `)
          .eq('recipient_id', user.id)
          .order('created_at', { ascending: false });

        if (!legacyReceived.error && legacyReceived.data) {
          receivedData = legacyReceived.data.map((row: any) => ({
            ...row,
            from_user_id: row.from_user_id ?? row.sender_id,
            to_user_id: row.to_user_id ?? row.recipient_id,
            recommendation_id: row.recommendation_id ?? null,
            tmdb_id: row.tmdb_id ?? null,
            movie_title: row.movie_title ?? null,
            movie_poster: row.movie_poster ?? null,
            movie_year: row.movie_year ?? null,
          })) as Nudge[];
        }
      }

      if (receivedData) {
        setReceivedNudges(receivedData);
        setUnreadCount(receivedData.filter((n) => !n.is_read).length);
      }

      // Fetch sent nudge IDs (new schema)
      let sentResult: any = await supabase
        .from('nudges')
        .select('recommendation_id, tmdb_id')
        .eq('from_user_id', user.id);

      if (sentResult.error && typeof sentResult.error.message === 'string') {
        if (sentResult.error.message.includes('tmdb_id')) {
        sentResult = await supabase
          .from('nudges')
          .select('recommendation_id')
          .eq('from_user_id', user.id);
        }
      }

      if (sentResult.error) {
        // Fallback: older schema
        sentResult = await supabase
          .from('nudges')
          .select('movie_id')
          .eq('sender_id', user.id);
      }

      if (sentResult.data) {
        const set = new Set<string>();
        sentResult.data.forEach((n: any) => {
          if (n.recommendation_id) set.add(`rec:${n.recommendation_id}`);
          if (n.tmdb_id) set.add(`tmdb:${n.tmdb_id}`);
          if (!n.recommendation_id && !n.tmdb_id && n.movie_id) {
            const parsed = parseLegacyMovieId(n.movie_id);
            if (parsed.recommendationId) set.add(`rec:${parsed.recommendationId}`);
            if (parsed.tmdbId) set.add(`tmdb:${parsed.tmdbId}`);
          }
        });
        setSentNudgeIds(set);
      }
    } catch {
      // Table doesn't exist, ignore
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNudges();
  }, [fetchNudges]);

  const sendNudge = async (toUserId: string, payload: NudgePayload, message?: string) => {
    if (!user || !isSupabaseConfigured()) return { error: 'Not authenticated' };

    let recommendationId: string | null = null;
    let tmdbId: string | null = null;
    let legacyMovieId: string | null = null;
    let movieTitle: string | null = null;
    let moviePoster: string | null = null;
    let movieYear: number | null = null;
    let friendRecommendationId: string | null = null;
    let messageValue: string | null = message || null;

    if (typeof payload === 'string') {
      if (payload.startsWith('tmdb-')) {
        tmdbId = payload.replace('tmdb-', '');
        legacyMovieId = payload;
      } else {
        recommendationId = payload;
        legacyMovieId = payload;
      }
    } else {
      recommendationId = payload.recommendationId ?? null;
      tmdbId = payload.tmdbId ?? null;
      legacyMovieId = payload.tmdbId ? `tmdb-${payload.tmdbId}` : payload.recommendationId ?? null;
      movieTitle = payload.movieTitle ?? null;
      moviePoster = payload.moviePoster ?? null;
      movieYear = payload.movieYear ?? null;
      friendRecommendationId = payload.friendRecommendationId ?? null;
      messageValue = payload.message ?? messageValue;
    }

    const supabase = createClient();
    let { error } = await supabase.from('nudges').insert({
      from_user_id: user.id,
      to_user_id: toUserId,
      recommendation_id: recommendationId,
      tmdb_id: tmdbId,
      movie_title: movieTitle,
      movie_poster: moviePoster,
      movie_year: movieYear,
      friend_recommendation_id: friendRecommendationId,
      message: messageValue,
    });

    if (error && typeof error.message === 'string') {
      const msg = error.message;
      const missingColumns = msg.includes('column') || msg.includes('does not exist');
      const recommendationRequired = msg.includes('recommendation_id') && msg.includes('null');

      if (missingColumns && recommendationId) {
        // Fallback: schema has from_user_id/to_user_id but not tmdb_id fields
        const retry = await supabase.from('nudges').insert({
          from_user_id: user.id,
          to_user_id: toUserId,
          recommendation_id: recommendationId,
          message: messageValue,
        });
        error = retry.error;
      }

      if (error && missingColumns && legacyMovieId) {
        // Fallback: schema uses from_user_id/to_user_id + movie_id
        const retry = await supabase.from('nudges').insert({
          from_user_id: user.id,
          to_user_id: toUserId,
          movie_id: legacyMovieId,
          message: messageValue,
        });
        error = retry.error;
      }

      if (error && (missingColumns || recommendationRequired) && legacyMovieId) {
        // Fallback: older schema using sender_id/recipient_id + movie_id
        const retry = await supabase.from('nudges').insert({
          sender_id: user.id,
          recipient_id: toUserId,
          movie_id: legacyMovieId,
          message: messageValue,
        });
        error = retry.error;
      }
    }

    if (error && typeof error.message === 'string') {
      const msg = error.message.toLowerCase();
      const isDuplicate =
        msg.includes('duplicate') ||
        msg.includes('unique') ||
        msg.includes('already exists') ||
        (typeof (error as any).code === 'string' && (error as any).code === '23505');
      if (isDuplicate) {
        error = null;
      }
    }

    if (!error) {
      addSentNudgeId(recommendationId, tmdbId, legacyMovieId);
    }

    return { error };
  };

  const markAsRead = async (nudgeId: string) => {
    if (!user || !isSupabaseConfigured()) return;

    const supabase = createClient();
    await supabase
      .from('nudges')
      .update({ is_read: true })
      .eq('id', nudgeId);

    setReceivedNudges((prev) =>
      prev.map((n) => (n.id === nudgeId ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    if (!user || !isSupabaseConfigured()) return;

    const supabase = createClient();
    let result = await supabase
      .from('nudges')
      .update({ is_read: true })
      .eq('to_user_id', user.id)
      .eq('is_read', false);

    if (result.error) {
      await supabase
        .from('nudges')
        .update({ is_read: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false);
    }

    setReceivedNudges((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const hasNudged = (recommendationId: string) => {
    if (recommendationId.startsWith('tmdb-')) {
      return sentNudgeIds.has(`tmdb:${recommendationId.replace('tmdb-', '')}`);
    }
    return sentNudgeIds.has(`rec:${recommendationId}`);
  };

  return {
    receivedNudges,
    unreadCount,
    loading,
    sendNudge,
    markAsRead,
    markAllAsRead,
    hasNudged,
    refreshNudges: fetchNudges,
  };
}
