'use client';

import { useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components';
import { isSupabaseConfigured, DBUser, DBRecommendation } from '@/lib/supabase';
import { createClient } from '@/lib/supabase';
import { fetchProfileUser, getSupabaseAccessToken, supabaseRestRequest } from '@/lib/supabase-rest';
import { getRandomMovieAvatar } from '@/lib/avatar-options';
import { searchMovies, getMovieDetails, getImageUrl, getLanguageName, formatRuntime } from '@/lib/tmdb';
import type { TMDBMovie } from '@/lib/tmdb';
import { Recommendation, OTTLink } from '@/types';
import { MovieCard } from '@/components';
import { useWatched, useWatchlist } from '@/hooks';

interface ProfilePageClientProps {
  userId: string;
}

type StageTheme = {
  id: string;
  label: string;
  accent: string;
  accentHover: string;
  accentSubtle: string;
  beam: string;
  beamSoft: string;
  halo: string;
  rig: string;
};

const stageThemes: StageTheme[] = [
  {
    id: 'gold',
    label: 'Gold',
    accent: '#f59e0b',
    accentHover: '#fbbf24',
    accentSubtle: 'rgba(245, 158, 11, 0.12)',
    beam: 'rgba(245, 158, 11, 0.55)',
    beamSoft: 'rgba(245, 158, 11, 0.18)',
    halo: 'rgba(245, 158, 11, 0.75)',
    rig: 'rgba(245, 158, 11, 0.35)',
  },
  {
    id: 'cyan',
    label: 'Cyan',
    accent: '#22d3ee',
    accentHover: '#67e8f9',
    accentSubtle: 'rgba(34, 211, 238, 0.12)',
    beam: 'rgba(34, 211, 238, 0.5)',
    beamSoft: 'rgba(34, 211, 238, 0.16)',
    halo: 'rgba(34, 211, 238, 0.7)',
    rig: 'rgba(34, 211, 238, 0.3)',
  },
  {
    id: 'magenta',
    label: 'Magenta',
    accent: '#fb7185',
    accentHover: '#fda4af',
    accentSubtle: 'rgba(251, 113, 133, 0.12)',
    beam: 'rgba(251, 113, 133, 0.5)',
    beamSoft: 'rgba(251, 113, 133, 0.16)',
    halo: 'rgba(251, 113, 133, 0.7)',
    rig: 'rgba(251, 113, 133, 0.3)',
  },
  {
    id: 'violet',
    label: 'Violet',
    accent: '#a855f7',
    accentHover: '#c084fc',
    accentSubtle: 'rgba(168, 85, 247, 0.12)',
    beam: 'rgba(168, 85, 247, 0.5)',
    beamSoft: 'rgba(168, 85, 247, 0.16)',
    halo: 'rgba(168, 85, 247, 0.7)',
    rig: 'rgba(168, 85, 247, 0.3)',
  },
];

const defaultStageThemeId = stageThemes[0]?.id ?? 'gold';

export default function ProfilePageClient({ userId }: ProfilePageClientProps) {
  const { user, loading: authLoading } = useAuth();
  const { getWatchedCount } = useWatched();
  const { getWatchlistCount } = useWatchlist();

  const [resolvedUserId, setResolvedUserId] = useState(userId);
  const [profileUser, setProfileUser] = useState<DBUser | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isFriend, setIsFriend] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [topLanguage, setTopLanguage] = useState('All');
  const [topPicks, setTopPicks] = useState<Array<{ id: string; user_id: string; recommendation_id: string; rank: number; language: string }>>([]);
  const [topLoading, setTopLoading] = useState(false);
  const [topError, setTopError] = useState('');
  const [showTopModal, setShowTopModal] = useState(false);
  const [selectedTopMovieId, setSelectedTopMovieId] = useState('');
  const [selectedTopRank, setSelectedTopRank] = useState(1);
  const [topSaving, setTopSaving] = useState(false);
  const [draggingPickId, setDraggingPickId] = useState<string | null>(null);
  const [dragOverPickId, setDragOverPickId] = useState<string | null>(null);
  const [topSearchOpen, setTopSearchOpen] = useState(false);
  const [topSearchQuery, setTopSearchQuery] = useState('');
  const [topSearchResults, setTopSearchResults] = useState<TMDBMovie[]>([]);
  const [topSearching, setTopSearching] = useState(false);
  const [topAddingFromSearch, setTopAddingFromSearch] = useState(false);
  const [activeThemeId, setActiveThemeId] = useState(defaultStageThemeId);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeError, setThemeError] = useState('');

  const accessToken = getSupabaseAccessToken();

  useEffect(() => {
    if (userId === 'fallback' && typeof window !== 'undefined') {
      const fromPath = window.location.pathname.replace(/^\/profile\/?/, '').trim();
      if (fromPath && fromPath !== 'fallback') setResolvedUserId(fromPath);
      else if (fromPath === 'fallback') setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (authLoading || resolvedUserId === 'fallback') return;

      setIsLoading(true);

      if (!isSupabaseConfigured()) {
        setIsLoading(false);
        return;
      }

      const timeout = setTimeout(() => {
        setIsLoading(false);
      }, 10000);

      try {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedUserId);

        let userData: DBUser | null = null;

        if (isUUID) {
          // Token-based fetch first (reliable with RLS / session)
          userData = await fetchProfileUser(resolvedUserId);
          if (!userData) {
            try {
              const params = new URLSearchParams({ select: '*', id: `eq.${resolvedUserId}`, limit: '1' });
              const rows = await supabaseRestRequest<DBUser[]>(
                `users?${params.toString()}`,
                { method: 'GET', timeoutMs: 15000 },
                accessToken,
              );
              userData = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
            } catch {
              userData = null;
            }
          }
        } else {
          try {
            const params = new URLSearchParams({
              select: '*',
              username: `eq.${resolvedUserId.toLowerCase()}`,
              limit: '1',
            });
            const rows = await supabaseRestRequest<DBUser[]>(
              `users?${params.toString()}`,
              { method: 'GET', timeoutMs: 15000 },
              accessToken,
            );
            userData = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
          } catch {
            // Username column may not exist
          }
        }

        clearTimeout(timeout);

        if (!userData && user && user.id === resolvedUserId) {
          const metadata = user.user_metadata;
          const generatedUsername = user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9_]/g, '') + '_' + Math.random().toString(36).slice(2, 6);

          try {
            await supabaseRestRequest(
              'users',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Prefer: 'return=minimal',
                },
                body: JSON.stringify({
                  id: user.id,
                  email: user.email || '',
                  name: metadata?.full_name || metadata?.name || user.email?.split('@')[0] || 'User',
                  username: generatedUsername,
                  avatar: getRandomMovieAvatar(),
                }),
              },
              accessToken,
            );
          } catch {
            try {
              await supabaseRestRequest(
                'users',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal',
                  },
                  body: JSON.stringify({
                    id: user.id,
                    email: user.email || '',
                    name: metadata?.full_name || metadata?.name || user.email?.split('@')[0] || 'User',
                    avatar: getRandomMovieAvatar(),
                  }),
                },
                accessToken,
              );
            } catch {
              // ignore insert failure; fallback below
            }
          }

          if (!userData) {
            try {
              const params = new URLSearchParams({ select: '*', id: `eq.${resolvedUserId}`, limit: '1' });
              const rows = await supabaseRestRequest<DBUser[]>(
                `users?${params.toString()}`,
                { method: 'GET', timeoutMs: 15000 },
                accessToken,
              );
              userData = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
            } catch {
              userData = null;
            }
          }
        }

        // Own profile but no DB row (e.g. RLS blocked read, or insert failed): show profile from auth
        if (!userData && user && user.id === resolvedUserId) {
          const metadata = user.user_metadata || {};
          const name = metadata.full_name || metadata.name || user.email?.split('@')[0] || 'User';
          userData = {
            id: user.id,
            email: user.email ?? '',
            name,
            username: user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user',
            avatar: '🎬',
            theme: defaultStageThemeId,
            created_at: new Date().toISOString(),
          } as DBUser;
        }

        if (!userData) {
          setIsLoading(false);
          return;
        }

        setProfileUser(userData);

        const recParams = new URLSearchParams({
          select: '*',
          user_id: `eq.${userData.id}`,
          order: 'created_at.desc',
        });
        const recs = await supabaseRestRequest<DBRecommendation[]>(
          `recommendations?${recParams.toString()}`,
          { method: 'GET', timeoutMs: 15000 },
          accessToken,
        );

        if (recs) {
          const mapped: Recommendation[] = recs.map((rec: DBRecommendation) => ({
            id: rec.id,
            title: rec.title,
            originalTitle: rec.original_title,
            year: rec.year,
            type: rec.type,
            poster: rec.poster,
            backdrop: rec.backdrop,
            genres: Array.isArray(rec.genres) ? rec.genres : [],
            language: rec.language ?? '',
            duration: rec.duration,
            rating: rec.rating,
            personalNote: rec.personal_note ?? '',
            mood: rec.mood,
            watchWith: rec.watch_with,
            ottLinks: (rec.ott_links as OTTLink[]) ?? [],
            recommendedBy: {
              id: userData.id,
              name: userData.name,
              avatar: userData.avatar ?? '🎬',
            },
            addedOn: rec.created_at,
          }));
          setRecommendations(mapped);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        clearTimeout(timeout);
      } finally {
        clearTimeout(timeout);
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [resolvedUserId, user, authLoading, accessToken]);

  useEffect(() => {
    const checkFriendStatus = async () => {
      const friendId = profileUser?.id;
      if (!user || !friendId || user.id === friendId || !isSupabaseConfigured()) return;

      try {
        const params = new URLSearchParams({
          select: 'id',
          user_id: `eq.${user.id}`,
          friend_id: `eq.${friendId}`,
          limit: '1',
        });
        const rows = await supabaseRestRequest<{ id: string }[]>(
          `friends?${params.toString()}`,
          { method: 'GET', timeoutMs: 10000 },
          accessToken,
        );
        setIsFriend(Array.isArray(rows) && rows.length > 0);
      } catch {
        setIsFriend(false);
      }
    };

    checkFriendStatus();
  }, [user, profileUser?.id, accessToken]);

  const recommendationsById = useMemo(() => {
    return new Map(recommendations.map((rec) => [rec.id, rec]));
  }, [recommendations]);

  const languageOptions = useMemo(() => {
    const set = new Set<string>();
    recommendations.forEach((rec) => {
      const lang = (rec.language || '').trim();
      if (lang) set.add(lang);
    });
    topPicks.forEach((pick) => {
      const lang = (pick.language || '').trim();
      if (lang) set.add(lang);
    });
    return ['All', ...Array.from(set).sort()];
  }, [recommendations, topPicks]);

  useEffect(() => {
    if (!languageOptions.includes(topLanguage)) {
      setTopLanguage('All');
    }
  }, [languageOptions, topLanguage]);

  const filteredTopPicks = useMemo(() => {
    const list =
      topLanguage === 'All'
        ? topPicks
        : topPicks.filter((pick) => (pick.language || '').trim() === topLanguage);
    return [...list].sort((a, b) => a.rank - b.rank);
  }, [topPicks, topLanguage]);

  const groupedTopPicks = useMemo(() => {
    const groups = new Map<string, typeof topPicks>();
    topPicks.forEach((pick) => {
      const lang = (pick.language || 'Unknown').trim() || 'Unknown';
      const list = groups.get(lang) ?? [];
      list.push(pick);
      groups.set(lang, list);
    });
    return Array.from(groups.entries())
      .map(([language, picks]) => ({
        language,
        picks: [...picks].sort((a, b) => a.rank - b.rank),
      }))
      .sort((a, b) => a.language.localeCompare(b.language));
  }, [topPicks]);

  const resolvedDisplayUserId = useMemo(() => {
    if (profileUser?.id) return profileUser.id;
    if (user && resolvedUserId && user.id === resolvedUserId) return user.id;
    return null;
  }, [profileUser?.id, user, resolvedUserId]);

  const isOwnId = user && resolvedUserId && user.id === resolvedUserId;
  const fallbackProfileUser: DBUser | null =
    !profileUser && isOwnId && user
      ? {
          id: user.id,
          email: user.email ?? '',
          name:
            (user.user_metadata?.full_name as string) ||
            (user.user_metadata?.name as string) ||
            user.email?.split('@')[0] ||
            'User',
          username: user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user',
          avatar: '🎬',
          theme: defaultStageThemeId,
          created_at: new Date().toISOString(),
        }
      : null;

  const displayUser = profileUser ?? fallbackProfileUser;
  const isOwnProfile = Boolean(user && displayUser && user.id === displayUser.id);

  const activeTheme = useMemo(
    () => stageThemes.find((theme) => theme.id === activeThemeId) ?? stageThemes[0],
    [activeThemeId],
  );

  const themeStyle = useMemo(
    () =>
      ({
        '--accent': activeTheme.accent,
        '--accent-hover': activeTheme.accentHover,
        '--accent-subtle': activeTheme.accentSubtle,
        '--stage-spot': activeTheme.beam,
        '--stage-spot-soft': activeTheme.beamSoft,
        '--stage-halo': activeTheme.halo,
        '--stage-rig': activeTheme.rig,
      } as CSSProperties),
    [activeTheme],
  );

  useEffect(() => {
    if (!displayUser) return;
    const themeFromUser =
      displayUser.theme && stageThemes.some((theme) => theme.id === displayUser.theme)
        ? displayUser.theme
        : defaultStageThemeId;
    setActiveThemeId(themeFromUser);
  }, [displayUser?.id, displayUser?.theme]);

  const handleThemeSelect = useCallback(
    async (themeId: string) => {
      if (!user || !resolvedDisplayUserId || user.id !== resolvedDisplayUserId) return;
      if (themeId === activeThemeId) return;
      const previousTheme = activeThemeId;
      setActiveThemeId(themeId);
      setThemeSaving(true);
      setThemeError('');
      try {
        await supabaseRestRequest(
          `users?id=eq.${user.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ theme: themeId }),
          },
          accessToken,
        );
        setProfileUser((prev) => (prev ? { ...prev, theme: themeId } : prev));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save theme.';
        setThemeError(message);
        setActiveThemeId(previousTheme);
      } finally {
        setThemeSaving(false);
      }
    },
    [user, resolvedDisplayUserId, activeThemeId, accessToken],
  );

  useEffect(() => {
    const fetchTopPicks = async () => {
      if (!resolvedDisplayUserId || !isSupabaseConfigured()) return;
      setTopLoading(true);
      setTopError('');
      try {
        const params = new URLSearchParams({
          select: 'id,user_id,recommendation_id,rank,language',
          user_id: `eq.${resolvedDisplayUserId}`,
          order: 'rank.asc',
        });
        const rows = await supabaseRestRequest<Array<{ id: string; user_id: string; recommendation_id: string; rank: number; language: string }>>(
          `top_10_picks?${params.toString()}`,
          { method: 'GET', timeoutMs: 15000 },
          accessToken,
        );
        setTopPicks(Array.isArray(rows) ? rows : []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load Top 10';
        setTopError(message);
        setTopPicks([]);
      } finally {
        setTopLoading(false);
      }
    };
    fetchTopPicks();
  }, [resolvedDisplayUserId, accessToken]);

  const refetchRecommendations = useCallback(async () => {
    if (!profileUser || !accessToken) return;
    try {
      const recParams = new URLSearchParams({
        select: '*',
        user_id: `eq.${profileUser.id}`,
        order: 'created_at.desc',
      });
      const recs = await supabaseRestRequest<DBRecommendation[]>(
        `recommendations?${recParams.toString()}`,
        { method: 'GET', timeoutMs: 15000 },
        accessToken,
      );
      if (recs) {
        const mapped: Recommendation[] = recs.map((rec: DBRecommendation) => ({
          id: rec.id,
          title: rec.title,
          originalTitle: rec.original_title,
          year: rec.year,
          type: rec.type,
          poster: rec.poster,
          backdrop: rec.backdrop,
          genres: Array.isArray(rec.genres) ? rec.genres : [],
          language: rec.language ?? '',
          duration: rec.duration,
          rating: rec.rating,
          personalNote: rec.personal_note ?? '',
          mood: rec.mood,
          watchWith: rec.watch_with,
          ottLinks: (rec.ott_links as OTTLink[]) ?? [],
          recommendedBy: {
            id: profileUser.id,
            name: profileUser.name,
            avatar: profileUser.avatar ?? '🎬',
          },
          addedOn: rec.created_at,
        }));
        setRecommendations(mapped);
      }
    } catch {
      // ignore
    }
  }, [profileUser, accessToken]);

  useEffect(() => {
    if (!topSearchOpen || !topSearchQuery.trim()) {
      setTopSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setTopSearching(true);
      const data = await searchMovies(topSearchQuery.trim());
      setTopSearchResults(data?.results ?? []);
      setTopSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [topSearchQuery, topSearchOpen]);

  const handleSelectMovieFromSearch = useCallback(async (movie: TMDBMovie) => {
    if (!user || !profileUser) return;
    setTopAddingFromSearch(true);
    setTopError('');
    try {
      const details = await getMovieDetails(movie.id);
      if (!details) throw new Error('Could not load movie details');
      const supabase = createClient();
      const recommendation = {
        user_id: user.id,
        title: details.title,
        original_title: details.original_title !== details.title ? details.original_title : null,
        year: details.release_date ? new Date(details.release_date).getFullYear() : new Date().getFullYear(),
        type: 'movie',
        poster: getImageUrl(details.poster_path),
        backdrop: getImageUrl(details.backdrop_path, 'original'),
        genres: details.genres?.map((g) => g.name) || [],
        language: getLanguageName(details.original_language),
        duration: formatRuntime(details.runtime),
        rating: details.vote_average ? Math.round(details.vote_average * 10) / 10 : null,
        personal_note: 'Added to Top 10',
        mood: [],
        watch_with: null,
        ott_links: [],
        tmdb_id: details.id,
      };
      const { data: inserted, error } = await supabase.from('recommendations').insert(recommendation).select('id').single();
      if (error) throw error;
      if (inserted?.id) {
        await refetchRecommendations();
        setSelectedTopMovieId(inserted.id);
        setTopSearchOpen(false);
        setTopSearchQuery('');
        setTopSearchResults([]);
      }
    } catch (err) {
      setTopError(err instanceof Error ? err.message : 'Failed to add movie');
    } finally {
      setTopAddingFromSearch(false);
    }
  }, [user, profileUser, refetchRecommendations]);

  const handleSaveTopPick = async () => {
    if (!user || !resolvedDisplayUserId || user.id !== resolvedDisplayUserId) return;
    if (!selectedTopMovieId) {
      setTopError('Choose a movie to add.');
      return;
    }
    const rec = recommendationsById.get(selectedTopMovieId);
    if (!rec) {
      setTopError('Selected movie not found.');
      return;
    }
    const language = (rec.language || 'Unknown').trim() || 'Unknown';
    setTopSaving(true);
    setTopError('');
    try {
      const deleteParams = new URLSearchParams({
        user_id: `eq.${user.id}`,
        recommendation_id: `eq.${rec.id}`,
        language: `eq.${language}`,
      });
      await supabaseRestRequest(
        `top_10_picks?${deleteParams.toString()}`,
        { method: 'DELETE', headers: { Prefer: 'return=minimal' }, timeoutMs: 15000 },
        accessToken,
      );

      const insertParams = new URLSearchParams({
        on_conflict: 'user_id,language,rank',
      });
      const inserted = await supabaseRestRequest<Array<{ id: string; user_id: string; recommendation_id: string; rank: number; language: string }>>(
        `top_10_picks?${insertParams.toString()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=representation',
          },
          body: JSON.stringify({
            user_id: user.id,
            recommendation_id: rec.id,
            rank: selectedTopRank,
            language,
          }),
        },
        accessToken,
      );
      const row = Array.isArray(inserted) ? inserted[0] : null;
      if (row) {
        setTopPicks((prev) => {
          const next = prev.filter(
            (p) =>
              !(p.user_id === row.user_id && p.language === row.language && p.rank === row.rank) &&
              !(p.user_id === row.user_id && p.language === row.language && p.recommendation_id === row.recommendation_id),
          );
          next.push(row);
          return next;
        });
      }
      setShowTopModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save Top 10 pick.';
      setTopError(message);
    } finally {
      setTopSaving(false);
    }
  };

  const removeTopPick = async (pickId: string) => {
    if (!user || !resolvedDisplayUserId || user.id !== resolvedDisplayUserId) return;
    setTopError('');
    try {
      await supabaseRestRequest(
        `top_10_picks?id=eq.${pickId}`,
        { method: 'DELETE', headers: { Prefer: 'return=minimal' }, timeoutMs: 15000 },
        accessToken,
      );
      setTopPicks((prev) => prev.filter((p) => p.id !== pickId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove pick.';
      setTopError(message);
    }
  };

  const swapTopPickRank = async (sourceId: string, targetId: string) => {
    if (!user || !resolvedDisplayUserId || user.id !== resolvedDisplayUserId) return;
    const source = topPicks.find((p) => p.id === sourceId);
    const target = topPicks.find((p) => p.id === targetId);
    if (!source || !target) return;
    if (source.language !== target.language) return;
    if (source.rank === target.rank) return;

    setTopError('');
    try {
      await supabaseRestRequest(
        `top_10_picks?id=eq.${target.id}`,
        { method: 'DELETE', headers: { Prefer: 'return=minimal' }, timeoutMs: 15000 },
        accessToken,
      );

      await supabaseRestRequest(
        `top_10_picks?id=eq.${source.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ rank: target.rank }),
        },
        accessToken,
      );

      const insertParams = new URLSearchParams({
        on_conflict: 'user_id,language,rank',
      });
      await supabaseRestRequest(
        `top_10_picks?${insertParams.toString()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({
            user_id: target.user_id,
            recommendation_id: target.recommendation_id,
            rank: source.rank,
            language: target.language,
          }),
        },
        accessToken,
      );

      setTopPicks((prev) =>
        prev.map((p) => {
          if (p.id === source.id) return { ...p, rank: target.rank };
          if (p.id === target.id) return { ...p, rank: source.rank };
          return p;
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reorder picks.';
      setTopError(message);
    }
  };

  const addFriend = async () => {
    if (!user || !profileUser) return;

    setIsAdding(true);
    try {
      await supabaseRestRequest(
        'friends',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            user_id: user.id,
            friend_id: profileUser.id,
          }),
        },
        accessToken,
      );
      setIsFriend(true);
    } finally {
      setIsAdding(false);
    }

  };

  const removeFriend = async () => {
    if (!user || !profileUser) return;

    setIsAdding(true);
    try {
      const params = new URLSearchParams({
        user_id: `eq.${user.id}`,
        friend_id: `eq.${profileUser.id}`,
      });
      await supabaseRestRequest(
        `friends?${params.toString()}`,
        { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
        accessToken,
      );
      setIsFriend(false);
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!displayUser) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center gap-4">
        <div className="text-6xl">😕</div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">User not found</h1>
        <Link href="/" className="text-[var(--accent)] hover:underline">
          Go back home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-hidden" style={themeStyle}>
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-80"
          style={{
            background:
              'radial-gradient(1400px circle at 50% -6%, var(--stage-spot) 0%, rgba(10,10,12,0) 78%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(1100px circle at 50% -2%, var(--stage-spot-soft) 0%, rgba(10,10,12,0) 80%)',
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_20%_10%,rgba(255,203,74,0.22),rgba(10,10,12,0)_60%),radial-gradient(900px_circle_at_80%_0%,rgba(0,170,255,0.18),rgba(10,10,12,0)_55%),radial-gradient(700px_circle_at_70%_80%,rgba(255,90,140,0.16),rgba(10,10,12,0)_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_0,rgba(255,255,255,0.04)_2px,transparent_2px,transparent_14px)] opacity-30" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.35)_45%,rgba(0,0,0,0.7)_100%)]" />
        <div className="absolute inset-0 opacity-[0.15] bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.15),rgba(0,0,0,0)_55%)]" />
        <div className="absolute inset-y-0 left-6 w-4 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.06)_0,rgba(255,255,255,0.06)_6px,transparent_6px,transparent_18px)] rounded-full blur-[1px] opacity-60" />
        <div className="absolute inset-y-0 right-6 w-4 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.06)_0,rgba(255,255,255,0.06)_6px,transparent_6px,transparent_18px)] rounded-full blur-[1px] opacity-60" />
        <div className="absolute -top-16 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,214,102,0.5),rgba(255,214,102,0))] blur-3xl" />
      </div>
      <header className="sticky top-0 z-50 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link href="/" className="text-[var(--accent)] hover:underline flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to BiB
          </Link>
        </div>
      </header>

      <section className="relative z-40">
        <div className="absolute inset-x-0 top-3 h-2 bg-[linear-gradient(90deg,transparent,var(--stage-rig),transparent)] opacity-70" />
        <div className="max-w-4xl mx-auto px-4 pt-5 pb-8">
          <div className="flex flex-wrap items-start justify-center gap-6">
            {stageThemes.map((theme) => {
              const isActive = theme.id === activeThemeId;
              return (
                <div key={theme.id} className="group relative flex flex-col items-center">
                  <span
                    className={`absolute left-1/2 top-10 h-64 w-56 -translate-x-1/2 transition-opacity duration-300 pointer-events-none ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'}`}
                    style={{
                      background: `linear-gradient(180deg, ${theme.beam} 0%, ${theme.beamSoft} 68%, rgba(0,0,0,0) 100%)`,
                      clipPath: 'polygon(50% 0%, 0 100%, 100% 100%)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleThemeSelect(theme.id)}
                    aria-pressed={isActive}
                    disabled={!isOwnProfile || themeSaving}
                    aria-disabled={!isOwnProfile || themeSaving}
                    className={`relative flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-[#0b0b0f] shadow-lg transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 disabled:cursor-not-allowed disabled:opacity-60 ${isActive ? 'scale-105 ring-2 ring-[var(--accent)]/70 shadow-[0_0_30px_var(--stage-halo)]' : 'hover:scale-105'}`}
                    title={`${theme.label} light`}
                  >
                    <span
                      className="absolute inset-[6px] rounded-full"
                      style={{
                        background: `radial-gradient(circle at 50% 45%, ${theme.halo} 0%, ${theme.beam} 35%, rgba(0,0,0,0.85) 70%)`,
                      }}
                    />
                    <span className="absolute -left-2 top-1/2 h-6 w-2 -translate-y-1/2 rounded-sm bg-[#1b1b22]" />
                    <span className="absolute -right-2 top-1/2 h-6 w-2 -translate-y-1/2 rounded-sm bg-[#1b1b22]" />
                    <span className="absolute -top-3 left-1/2 h-2 w-10 -translate-x-1/2 rounded bg-[#20202a]" />
                    <span className="absolute -bottom-3 left-1/2 h-3 w-4 -translate-x-1/2 rounded-b bg-[#16161d]" />
                  </button>
                  <span className={`mt-2 text-[10px] uppercase tracking-[0.28em] ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                    {theme.label}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-center text-xs text-[var(--text-muted)]">
            {isOwnProfile ? 'Tap a stage light to set your profile theme.' : 'Stage theme set by the profile owner.'}
          </p>
          {isOwnProfile && themeSaving && (
            <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">Saving theme…</p>
          )}
          {isOwnProfile && themeError && (
            <p className="mt-2 text-center text-[11px] text-red-400">{themeError}</p>
          )}
        </div>
      </section>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-[var(--bg-card)] rounded-2xl p-8 border border-white/10 mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-[var(--accent)] flex items-center justify-center text-5xl">
              {displayUser.avatar}
            </div>
            <div className="text-center sm:text-left flex-1">
              <h1 className="text-3xl font-bold text-[var(--text-primary)]">{displayUser.name}</h1>
              <div className="flex flex-wrap gap-4 mt-2 justify-center sm:justify-start">
                {isOwnProfile && (
                  <>
                    <p className="text-[var(--text-muted)]">
                      <span className="text-[var(--accent)]">{getWatchedCount()}</span> watched
                    </p>
                    <p className="text-[var(--text-muted)]">
                      <span className="text-[var(--accent)]">{getWatchlistCount()}</span> in watchlist
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-3 items-center">
              {user && !isOwnProfile && profileUser && (
                <div>
                  {isFriend ? (
                    <button
                      onClick={removeFriend}
                      disabled={isAdding}
                      className="px-6 py-2.5 bg-[var(--bg-secondary)] text-red-400 font-medium rounded-full hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      {isAdding ? 'Removing...' : 'Remove Friend'}
                    </button>
                  ) : (
                    <button
                      onClick={addFriend}
                      disabled={isAdding}
                      className="px-6 py-2.5 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-full hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                    >
                      {isAdding ? 'Adding...' : 'Add Friend'}
                    </button>
                  )}
                </div>
              )}

              {!user && (
                <Link
                  href="/"
                  className="px-6 py-2.5 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-full hover:bg-[var(--accent-hover)] transition-colors"
                >
                  Sign in to add friend
                </Link>
              )}

              <button
                onClick={() => {
                  const profileUrl = `${window.location.origin}/profile/${resolvedUserId}`;
                  const message = `Check out ${displayUser.name}'s movie recommendations on BiB (Binge it bro)! ${profileUrl}`;
                  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
                  window.open(whatsappUrl, '_blank');
                }}
                className="w-12 h-12 bg-[#25D366] rounded-full flex items-center justify-center hover:bg-[#20BA5A] transition-colors shadow-lg"
                title="Share on WhatsApp"
              >
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="bg-[var(--bg-card)] rounded-2xl p-6 border border-white/10 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                {displayUser.name}'s Top 10
              </p>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Top 10 Picks</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-[var(--text-muted)]">Language</label>
              <select
                value={topLanguage}
                onChange={(e) => setTopLanguage(e.target.value)}
                className="bg-[var(--bg-secondary)] text-[var(--text-primary)] text-sm px-3 py-2 rounded-full border border-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
              >
                {languageOptions.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
              {isOwnProfile && (
                <button
                  onClick={() => {
                    const first = recommendations[0];
                    setSelectedTopMovieId(first ? first.id : '');
                    setSelectedTopRank(1);
                    setShowTopModal(true);
                    setTopError('');
                    setTopSearchOpen(false);
                    setTopSearchQuery('');
                    setTopSearchResults([]);
                  }}
                  className="px-4 py-2 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
                >
                  Add to Top 10
                </button>
              )}
            </div>
          </div>

          {topLoading ? (
            <div className="text-center py-10 text-[var(--text-muted)]">
              <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="mt-3">Loading Top 10…</p>
            </div>
          ) : topError ? (
            <div className="text-center py-8 text-[var(--text-muted)]">
              <p>{topError}</p>
            </div>
          ) : filteredTopPicks.length > 0 ? (
            topLanguage === 'All' ? (
              <div className="space-y-6">
                {groupedTopPicks.map((group) => (
                  <div key={group.language}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        {group.language.toUpperCase()}
                      </h3>
                      <span className="text-xs text-[var(--text-muted)]">
                        {group.picks.length} picks
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                      {group.picks.map((pick) => {
                        const rec = recommendationsById.get(pick.recommendation_id);
                        const isDragging = draggingPickId === pick.id;
                        const isOver = dragOverPickId === pick.id;
                        return (
                          <Link
                            key={pick.id}
                            href={rec ? `/movie/${rec.id}` : '#'}
                            draggable={isOwnProfile}
                            onDragStart={() => setDraggingPickId(pick.id)}
                            onDragEnd={() => {
                              setDraggingPickId(null);
                              setDragOverPickId(null);
                            }}
                            onDragOver={(e) => {
                              if (!isOwnProfile) return;
                              e.preventDefault();
                              setDragOverPickId(pick.id);
                            }}
                            onDrop={(e) => {
                              if (!isOwnProfile) return;
                              e.preventDefault();
                              if (draggingPickId && draggingPickId !== pick.id) {
                                void swapTopPickRank(draggingPickId, pick.id);
                              }
                              setDraggingPickId(null);
                              setDragOverPickId(null);
                            }}
                            className={`group relative rounded-xl overflow-hidden bg-[var(--bg-secondary)] border transition-colors ${isOver ? 'border-[var(--accent)]' : 'border-white/10'} ${isDragging ? 'opacity-60' : ''}`}
                          >
                            <div className="absolute top-2 left-2 z-10 w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] text-sm font-bold flex items-center justify-center shadow-lg">
                              {pick.rank}
                            </div>
                            {isOwnProfile && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void removeTopPick(pick.id);
                                }}
                                className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/60 text-white text-sm hover:bg-black/80 transition-colors"
                                title="Remove from Top 10"
                              >
                                ✕
                              </button>
                            )}
                            <div className="aspect-[2/3] w-full overflow-hidden">
                              {rec?.poster ? (
                                <img
                                  src={rec.poster}
                                  alt={rec.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-4xl">
                                  🎬
                                </div>
                              )}
                            </div>
                            <div className="absolute bottom-12 right-2 flex items-center -space-x-2">
                              {(Array.isArray(rec?.ottLinks) && rec.ottLinks.length > 0
                                ? rec.ottLinks
                                : [{ platform: 'OTT', url: `/movie/${rec?.id ?? ''}`, logoPath: '' }]
                              )
                                .filter((link, index, arr) => arr.findIndex((l) => l.platform === link.platform) === index)
                                .slice(0, 3)
                                .map((link) => {
                                  const logoUrl = link.logoPath ? `https://image.tmdb.org/t/p/w92${link.logoPath}` : '';
                                  return (
                                    <button
                                      key={link.platform}
                                      type="button"
                                      title={link.platform}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const href = `/movie/${rec?.id ?? ''}`;
                                        window.location.href = href;
                                      }}
                                      className="w-6 h-6 rounded-full bg-[var(--bg-primary)]/80 border border-white/10 flex items-center justify-center overflow-hidden"
                                    >
                                      {logoUrl ? (
                                        <img src={logoUrl} alt={link.platform} className="w-4 h-4 object-contain" />
                                      ) : (
                                        <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                          <path d="M4 4.5a1 1 0 0 1 1.6-.8l9 6.5a1 1 0 0 1 0 1.6l-9 6.5A1 1 0 0 1 4 17.5v-13z" />
                                        </svg>
                                      )}
                                    </button>
                                  );
                                })}
                            </div>
                            <div className="p-2">
                              <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1">
                                {rec?.title ?? 'Unknown'}
                              </p>
                              <p className="text-[10px] text-[var(--text-muted)]">
                                {(pick.language || 'Unknown').toUpperCase()}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {filteredTopPicks.map((pick) => {
                  const rec = recommendationsById.get(pick.recommendation_id);
                  const isDragging = draggingPickId === pick.id;
                  const isOver = dragOverPickId === pick.id;
                  return (
                    <Link
                      key={pick.id}
                      href={rec ? `/movie/${rec.id}` : '#'}
                      draggable={isOwnProfile}
                      onDragStart={() => setDraggingPickId(pick.id)}
                      onDragEnd={() => {
                        setDraggingPickId(null);
                        setDragOverPickId(null);
                      }}
                      onDragOver={(e) => {
                        if (!isOwnProfile) return;
                        e.preventDefault();
                        setDragOverPickId(pick.id);
                      }}
                      onDrop={(e) => {
                        if (!isOwnProfile) return;
                        e.preventDefault();
                        if (draggingPickId && draggingPickId !== pick.id) {
                          void swapTopPickRank(draggingPickId, pick.id);
                        }
                        setDraggingPickId(null);
                        setDragOverPickId(null);
                      }}
                      className={`group relative rounded-xl overflow-hidden bg-[var(--bg-secondary)] border transition-colors ${isOver ? 'border-[var(--accent)]' : 'border-white/10'} ${isDragging ? 'opacity-60' : ''}`}
                    >
                      <div className="absolute top-2 left-2 z-10 w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] text-sm font-bold flex items-center justify-center shadow-lg">
                        {pick.rank}
                      </div>
                      {isOwnProfile && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void removeTopPick(pick.id);
                          }}
                          className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/60 text-white text-sm hover:bg-black/80 transition-colors"
                          title="Remove from Top 10"
                        >
                          ✕
                        </button>
                      )}
                    <div className="aspect-[2/3] w-full overflow-hidden">
                      {rec?.poster ? (
                        <img
                          src={rec.poster}
                          alt={rec.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl">
                          🎬
                        </div>
                      )}
                    </div>
                    <div className="absolute bottom-12 right-2 flex items-center -space-x-2">
                      {(Array.isArray(rec?.ottLinks) && rec.ottLinks.length > 0
                        ? rec.ottLinks
                        : [{ platform: 'OTT', url: `/movie/${rec?.id ?? ''}`, logoPath: '' }]
                      )
                        .filter((link, index, arr) => arr.findIndex((l) => l.platform === link.platform) === index)
                        .slice(0, 3)
                        .map((link) => {
                          const logoUrl = link.logoPath ? `https://image.tmdb.org/t/p/w92${link.logoPath}` : '';
                          return (
                            <button
                              key={link.platform}
                              type="button"
                              title={link.platform}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const href = `/movie/${rec?.id ?? ''}`;
                                window.location.href = href;
                              }}
                              className="w-6 h-6 rounded-full bg-[var(--bg-primary)]/80 border border-white/10 flex items-center justify-center overflow-hidden"
                            >
                              {logoUrl ? (
                                <img src={logoUrl} alt={link.platform} className="w-4 h-4 object-contain" />
                              ) : (
                                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                  <path d="M4 4.5a1 1 0 0 1 1.6-.8l9 6.5a1 1 0 0 1 0 1.6l-9 6.5A1 1 0 0 1 4 17.5v-13z" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1">
                        {rec?.title ?? 'Unknown'}
                      </p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {(pick.language || 'Unknown').toUpperCase()}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )
          ) : (
            <div className="text-center py-10 text-[var(--text-muted)]">
              <div className="text-3xl mb-2">🎞️</div>
              <p>No picks yet for this language</p>
            </div>
          )}
        </div>

        {/* Recommendations grid removed per request */}
      </main>

      {showTopModal && (
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={() => !topSaving && setShowTopModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[var(--bg-card)] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Top 10</p>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">Add a Movie</h3>
                </div>
                <button
                  onClick={() => !topSaving && setShowTopModal(false)}
                  className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">Movie</label>
                  <div className="flex gap-2">
                    <select
                      value={selectedTopMovieId}
                      onChange={(e) => setSelectedTopMovieId(e.target.value)}
                      className="flex-1 bg-[var(--bg-secondary)] text-[var(--text-primary)] text-sm px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                    >
                      {recommendations.map((rec) => (
                        <option key={rec.id} value={rec.id}>
                          {rec.title} {rec.year ? `(${rec.year})` : ''} {rec.language ? `• ${rec.language}` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setTopSearchOpen((o) => !o)}
                      className="px-3 py-2 rounded-xl bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-white/10 hover:bg-[var(--bg-card)] transition-colors flex items-center gap-1.5 text-sm font-medium"
                      title="Search for a movie"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Search
                    </button>
                  </div>
                  {topSearchOpen && (
                    <div className="mt-3 p-3 bg-[var(--bg-secondary)] rounded-xl border border-white/10 space-y-2">
                      <input
                        type="text"
                        placeholder="Search for a movie to add..."
                        value={topSearchQuery}
                        onChange={(e) => setTopSearchQuery(e.target.value)}
                        className="w-full bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm px-3 py-2 rounded-lg border border-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                        autoFocus
                      />
                      {topSearching && (
                        <div className="flex justify-center py-4">
                          <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      {topAddingFromSearch && (
                        <p className="text-sm text-[var(--text-muted)]">Adding movie…</p>
                      )}
                      {!topSearching && topSearchResults.length > 0 && (
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {topSearchResults.slice(0, 8).map((movie) => (
                            <button
                              key={movie.id}
                              type="button"
                              onClick={() => handleSelectMovieFromSearch(movie)}
                              disabled={topAddingFromSearch}
                              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--bg-card)] transition-colors text-left disabled:opacity-50"
                            >
                              <div className="w-10 h-14 flex-shrink-0 rounded overflow-hidden bg-[var(--bg-primary)]">
                                {movie.poster_path ? (
                                  <img src={getImageUrl(movie.poster_path)} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-lg">🎬</div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-[var(--text-primary)] truncate text-sm">{movie.title}</p>
                                <p className="text-xs text-[var(--text-muted)]">
                                  {movie.release_date ? new Date(movie.release_date).getFullYear() : ''} • {(movie.vote_average ?? 0).toFixed(1)} ★
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">Rank</label>
                  <select
                    value={selectedTopRank}
                    onChange={(e) => setSelectedTopRank(Number(e.target.value))}
                    className="w-full bg-[var(--bg-secondary)] text-[var(--text-primary)] text-sm px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((rank) => (
                      <option key={rank} value={rank}>
                        Rank {rank}
                      </option>
                    ))}
                  </select>
                </div>
                {topError && (
                  <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    {topError}
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-white/10 flex justify-end gap-3">
                <button
                  onClick={() => !topSaving && setShowTopModal(false)}
                  className="px-4 py-2 rounded-full bg-[var(--bg-secondary)] text-[var(--text-primary)] text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTopPick}
                  disabled={topSaving || recommendations.length === 0}
                  className="px-4 py-2 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                >
                  {topSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
