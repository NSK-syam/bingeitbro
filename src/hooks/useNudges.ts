'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';

interface Nudge {
  id: string;
  from_user_id: string;
  to_user_id: string;
  recommendation_id: string;
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

export function useNudges() {
  const { user } = useAuth();
  const [receivedNudges, setReceivedNudges] = useState<Nudge[]>([]);
  const [sentNudgeIds, setSentNudgeIds] = useState<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNudges = useCallback(async () => {
    if (!user || !isSupabaseConfigured()) {
      setReceivedNudges([]);
      setSentNudgeIds(new Set());
      setLoading(false);
      return;
    }

    const supabase = createClient();

    try {
      // Fetch received nudges
      const { data: received, error: receivedError } = await supabase
        .from('nudges')
        .select(`
          *,
          from_user:users!nudges_from_user_id_fkey(id, name, avatar),
          recommendation:recommendations(id, title, poster)
        `)
        .eq('to_user_id', user.id)
        .order('created_at', { ascending: false });

      // If table doesn't exist (404), just silently fail
      if (receivedError) {
        setLoading(false);
        return;
      }

      if (received) {
        setReceivedNudges(received as Nudge[]);
        setUnreadCount(received.filter((n: Nudge) => !n.is_read).length);
      }

      // Fetch sent nudge recommendation IDs
      const { data: sent } = await supabase
        .from('nudges')
        .select('recommendation_id')
        .eq('from_user_id', user.id);

      if (sent) {
        setSentNudgeIds(new Set(sent.map((n) => n.recommendation_id)));
      }
    } catch {
      // Table doesn't exist, ignore
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchNudges();
  }, [fetchNudges]);

  const sendNudge = async (toUserId: string, recommendationId: string, message?: string) => {
    if (!user || !isSupabaseConfigured()) return { error: 'Not authenticated' };

    const supabase = createClient();
    const { error } = await supabase.from('nudges').insert({
      from_user_id: user.id,
      to_user_id: toUserId,
      recommendation_id: recommendationId,
      message: message || null,
    });

    if (!error) {
      setSentNudgeIds((prev) => new Set([...prev, recommendationId]));
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
    await supabase
      .from('nudges')
      .update({ is_read: true })
      .eq('to_user_id', user.id)
      .eq('is_read', false);

    setReceivedNudges((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const hasNudged = (recommendationId: string) => {
    return sentNudgeIds.has(recommendationId);
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
