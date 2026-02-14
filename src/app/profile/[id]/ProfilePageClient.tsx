'use client';

import { useState, useEffect, useMemo, useCallback, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components';
import { isSupabaseConfigured, DBUser, DBRecommendation } from '@/lib/supabase';
import { createClient } from '@/lib/supabase';
import { fetchProfileUser, getSupabaseAccessToken, supabaseRestRequest } from '@/lib/supabase-rest';
import { getRandomMovieAvatar } from '@/lib/avatar-options';
import { searchMovies, getMovieDetails, getWatchProviders, getImageUrl, getLanguageName, formatRuntime, tmdbWatchProvidersToOttLinks } from '@/lib/tmdb';
import type { TMDBMovie } from '@/lib/tmdb';
import { Recommendation, OTTLink } from '@/types';
import { MovieCard, StarRating } from '@/components';
import { useWatched, useWatchlist } from '@/hooks';

interface ProfilePageClientProps {
  userId: string;
}

interface WatchedMovieItem {
  id: string;
  title: string;
  year?: number;
  poster?: string;
  watchedAt?: string;
}

type LightingMode = 'sun' | 'moon';
type LightingState = { mode: LightingMode; intensity: number }; // intensity: 0..100

const DEFAULT_LIGHTING: LightingState = { mode: 'sun', intensity: 90 };

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const hexToRgb = (hex: string): [number, number, number] => {
  const raw = hex.replace('#', '').trim();
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
};

const mixHex = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
  const r = lerp(ar, br).toString(16).padStart(2, '0');
  const g = lerp(ag, bg).toString(16).padStart(2, '0');
  const bl = lerp(ab, bb).toString(16).padStart(2, '0');
  return `#${r}${g}${bl}`;
};

const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
};

const parseLightingTheme = (raw: string | null | undefined): LightingState => {
  const v = (raw ?? '').trim();
  // New format: "sun:90" or "moon:60"
  const match = v.match(/^(sun|moon)\s*:\s*(\d{1,3})$/i);
  if (match) {
    const mode = match[1].toLowerCase() as LightingMode;
    const intensity = clamp(parseInt(match[2], 10), 0, 100);
    return { mode, intensity };
  }
  // Back-compat: old stage light ids.
  if (v === 'gold') return { mode: 'sun', intensity: 92 };
  if (v === 'magenta') return { mode: 'sun', intensity: 55 };
  if (v === 'cyan') return { mode: 'moon', intensity: 70 };
  if (v === 'violet') return { mode: 'moon', intensity: 45 };
  return DEFAULT_LIGHTING;
};

const serializeLightingTheme = (s: LightingState) => `${s.mode}:${clamp(Math.round(s.intensity), 0, 100)}`;

export default function ProfilePageClient({ userId }: ProfilePageClientProps) {
  const { user, loading: authLoading } = useAuth();
  const { watchedState } = useWatched();
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
  const [lighting, setLighting] = useState<LightingState>(DEFAULT_LIGHTING);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeError, setThemeError] = useState('');
  const themeSaveTimerRef = useRef<number | null>(null);
  const [showWatchedModal, setShowWatchedModal] = useState(false);
  const [watchedItems, setWatchedItems] = useState<WatchedMovieItem[]>([]);
  const [watchedLoading, setWatchedLoading] = useState(false);
  const [watchedError, setWatchedError] = useState('');

  const [top10RatingsSupported, setTop10RatingsSupported] = useState(true);
  const [top10RatingsLoading, setTop10RatingsLoading] = useState(false);
  const [top10RatingsError, setTop10RatingsError] = useState('');
  const [top10RatingsVersion, setTop10RatingsVersion] = useState(0);
  const [top10RatingsSaving, setTop10RatingsSaving] = useState<Record<string, boolean>>({});
  const [top10RatingsByLanguage, setTop10RatingsByLanguage] = useState<Record<string, { avg: number; count: number; mine: number }>>({});

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
            theme: serializeLightingTheme(DEFAULT_LIGHTING),
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
          theme: serializeLightingTheme(DEFAULT_LIGHTING),
          created_at: new Date().toISOString(),
        }
      : null;

  const displayUser = profileUser ?? fallbackProfileUser;
  const isOwnProfile = Boolean(user && displayUser && user.id === displayUser.id);
  const watchedEntries = useMemo(() => {
    return Object.entries(watchedState)
      .filter(([, value]) => value?.watched)
      .map(([id, value]) => ({
        id,
        watchedAt: value?.watchedAt,
      }))
      .sort((a, b) => {
        const at = a.watchedAt ? new Date(a.watchedAt).getTime() : 0;
        const bt = b.watchedAt ? new Date(b.watchedAt).getTime() : 0;
        return bt - at;
      });
  }, [watchedState]);

  const watchedStats = useMemo(() => {
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth();

    let month = 0;
    let year = 0;
    for (const entry of watchedEntries) {
      if (!entry.watchedAt) continue;
      const watchedDate = new Date(entry.watchedAt);
      if (watchedDate.getFullYear() === thisYear) {
        year += 1;
        if (watchedDate.getMonth() === thisMonth) month += 1;
      }
    }

    return {
      total: watchedEntries.length,
      month,
      year,
    };
  }, [watchedEntries]);

  // Load Top 10 ratings (per language) for this profile.
  useEffect(() => {
    if (!top10RatingsSupported) return;
    if (!resolvedDisplayUserId || !isSupabaseConfigured()) return;

    let cancelled = false;
    setTop10RatingsLoading(true);
    setTop10RatingsError('');

    void (async () => {
      try {
        const params = new URLSearchParams({
          select: 'language,rating,rater_id',
          profile_user_id: `eq.${resolvedDisplayUserId}`,
        });
        const rows = await supabaseRestRequest<Array<{ language: string; rating: number; rater_id: string }>>(
          `top_10_ratings?${params.toString()}`,
          { method: 'GET', timeoutMs: 15000 },
          accessToken,
        );
        if (cancelled) return;

        const bucket = new Map<string, { sum: number; count: number; mine: number }>();
        const list = Array.isArray(rows) ? rows : [];
        for (const r of list) {
          const lang = (r.language || 'Unknown').trim() || 'Unknown';
          const rating = typeof r.rating === 'number' ? r.rating : 0;
          if (rating < 1 || rating > 5) continue;
          const b = bucket.get(lang) ?? { sum: 0, count: 0, mine: 0 };
          b.sum += rating;
          b.count += 1;
          if (user?.id && r.rater_id === user.id) b.mine = rating;
          bucket.set(lang, b);
        }

        const next: Record<string, { avg: number; count: number; mine: number }> = {};
        // Ensure we at least have entries for languages visible in Top 10.
        const langsInTop10 = new Set(groupedTopPicks.map((g) => (g.language || 'Unknown').trim() || 'Unknown'));
        for (const lang of langsInTop10) {
          const b = bucket.get(lang) ?? { sum: 0, count: 0, mine: 0 };
          next[lang] = {
            avg: b.count > 0 ? b.sum / b.count : 0,
            count: b.count,
            mine: b.mine,
          };
        }
        setTop10RatingsByLanguage(next);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // If the table isn't created yet, hide ratings UI (still safe to deploy).
        if (/top_10_ratings|does not exist|schema cache/i.test(msg)) {
          setTop10RatingsSupported(false);
        } else {
          setTop10RatingsError(msg || 'Unable to load ratings');
        }
      } finally {
        if (!cancelled) setTop10RatingsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedDisplayUserId, accessToken, user?.id, groupedTopPicks, top10RatingsVersion, top10RatingsSupported]);

  const rateTop10Language = useCallback(
    async (language: string, rating: number) => {
      if (!user?.id || !resolvedDisplayUserId) return;
      if (user.id === resolvedDisplayUserId) return;
      if (!top10RatingsSupported) return;

      const langKey = (language || 'Unknown').trim() || 'Unknown';
      setTop10RatingsSaving((prev) => ({ ...prev, [langKey]: true }));
      setTop10RatingsError('');

      try {
        const params = new URLSearchParams({ on_conflict: 'profile_user_id,rater_id,language' });
        await supabaseRestRequest(
          `top_10_ratings?${params.toString()}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify({
              profile_user_id: resolvedDisplayUserId,
              rater_id: user.id,
              language: langKey,
              rating,
            }),
            timeoutMs: 15000,
          },
          accessToken,
        );
        setTop10RatingsVersion((v) => v + 1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/top_10_ratings|does not exist|schema cache/i.test(msg)) {
          setTop10RatingsSupported(false);
        } else {
          setTop10RatingsError(msg || 'Unable to save rating');
        }
      } finally {
        setTop10RatingsSaving((prev) => ({ ...prev, [langKey]: false }));
      }
    },
    [user?.id, resolvedDisplayUserId, accessToken, top10RatingsSupported],
  );

  // Keep local lighting state in sync with the persisted theme string.
  useEffect(() => {
    if (!displayUser) return;
    setLighting(parseLightingTheme(displayUser.theme));
  }, [displayUser?.id, displayUser?.theme]);

  const saveLightingTheme = useCallback(
    async (next: LightingState) => {
      if (!user || !resolvedDisplayUserId || user.id !== resolvedDisplayUserId) return;
      setThemeSaving(true);
      setThemeError('');
      const theme = serializeLightingTheme(next);
      try {
        await supabaseRestRequest(
          `users?id=eq.${user.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ theme }),
          },
          accessToken,
        );
        setProfileUser((prev) => (prev ? { ...prev, theme } : prev));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save lighting.';
        setThemeError(message);
      } finally {
        setThemeSaving(false);
      }
    },
    [user, resolvedDisplayUserId, accessToken],
  );

  const queueSaveLightingTheme = useCallback(
    (next: LightingState) => {
      setLighting(next);
      if (!isOwnProfile) return;
      if (themeSaveTimerRef.current) window.clearTimeout(themeSaveTimerRef.current);
      themeSaveTimerRef.current = window.setTimeout(() => {
        themeSaveTimerRef.current = null;
        void saveLightingTheme(next);
      }, 450);
    },
    [isOwnProfile, saveLightingTheme],
  );

  useEffect(() => {
    return () => {
      if (themeSaveTimerRef.current) window.clearTimeout(themeSaveTimerRef.current);
    };
  }, []);

  const themeStyle = useMemo(() => {
    const t = clamp(lighting.intensity, 0, 100) / 100;

    if (lighting.mode === 'sun') {
      const accent = mixHex('#fb7185', '#fbbf24', t);
      const accentHover = mixHex(accent, '#ffffff', 0.12);
      const cool = mixHex('#38bdf8', '#60a5fa', 0.35 + t * 0.4);
      const warm2 = mixHex('#f97316', '#fbbf24', 0.25 + t * 0.75);

      return {
        '--accent': accent,
        '--accent-hover': accentHover,
        '--accent-subtle': rgba(accent, 0.12),
        '--stage-spot': rgba(accent, 0.42 + t * 0.28),
        '--stage-spot-soft': rgba(warm2, 0.12 + t * 0.14),
        '--stage-halo': rgba(accent, 0.45 + t * 0.25),
        '--stage-rig': rgba(accent, 0.18 + t * 0.18),
        '--fx-a': rgba(accent, 0.22 + t * 0.10),
        '--fx-b': rgba(cool, 0.16 + t * 0.08),
        '--fx-c': rgba('#a78bfa', 0.10 + t * 0.06),
        '--fx-d': rgba('#22c55e', 0.08 + t * 0.04),
        '--fx-stars-opacity': '0',
        '--fx-sunflare-opacity': String(0.08 + t * 0.22),
      } as CSSProperties;
    }

    // moon
    const accent = mixHex('#60a5fa', '#e5e7eb', t);
    const accentHover = mixHex(accent, '#ffffff', 0.08);
    const violet = mixHex('#7c3aed', '#a78bfa', 0.35 + t * 0.45);
    const teal = mixHex('#22d3ee', '#38bdf8', 0.25 + t * 0.55);

    return {
      '--accent': accent,
      '--accent-hover': accentHover,
      '--accent-subtle': rgba(accent, 0.11),
      '--stage-spot': rgba(accent, 0.18 + t * 0.28),
      '--stage-spot-soft': rgba(teal, 0.10 + t * 0.14),
      '--stage-halo': rgba(accent, 0.22 + t * 0.26),
      '--stage-rig': rgba(accent, 0.12 + t * 0.12),
      '--fx-a': rgba(violet, 0.14 + t * 0.10),
      '--fx-b': rgba(teal, 0.12 + t * 0.08),
      '--fx-c': rgba(accent, 0.10 + t * 0.10),
      '--fx-d': rgba('#fb7185', 0.06 + t * 0.05),
      '--fx-stars-opacity': String(0.12 + t * 0.22),
      '--fx-sunflare-opacity': '0',
    } as CSSProperties;
  }, [lighting.intensity, lighting.mode]);

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

  // Backfill OTT logos for Top 10 picks that were added from TMDB with empty ott_links.
  // This is safe to run client-side because we only fetch TMDB providers for the small Top 10 set.
  useEffect(() => {
    if (!isSupabaseConfigured() || topPicks.length === 0) return;
    if (!accessToken) return;

    let cancelled = false;
    const ensureOttLinks = async () => {
      try {
        const recIds = Array.from(new Set(topPicks.map((p) => p.recommendation_id).filter(Boolean)));
        if (recIds.length === 0) return;

        const params = new URLSearchParams({
          select: 'id,user_id,tmdb_id,title,ott_links',
          id: `in.(${recIds.join(',')})`,
        });
        const rows = await supabaseRestRequest<Array<{ id: string; user_id: string; tmdb_id: number | null; title: string; ott_links: unknown }>>(
          `recommendations?${params.toString()}`,
          { method: 'GET', timeoutMs: 15000 },
          accessToken,
        );
        if (cancelled) return;

        const candidates = (Array.isArray(rows) ? rows : []).filter((r) => {
          const links = Array.isArray(r.ott_links) ? r.ott_links : [];
          return Boolean(r.tmdb_id) && links.length === 0;
        });
        if (candidates.length === 0) return;

        for (const row of candidates) {
          if (cancelled) return;
          const providers = await getWatchProviders(row.tmdb_id as number);
          const links = tmdbWatchProvidersToOttLinks(providers, row.title, row.tmdb_id as number);
          if (!links || links.length === 0) continue;

          // Update local state so logos show immediately on this page.
          setRecommendations((prev) =>
            prev.map((rec) => (rec.id === row.id ? { ...rec, ottLinks: links } : rec)),
          );

          // Persist for the owner only (so other viewers don't trigger writes).
          if (user && row.user_id === user.id) {
            try {
              await supabaseRestRequest(
                `recommendations?id=eq.${row.id}`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                  body: JSON.stringify({ ott_links: links }),
                  timeoutMs: 15000,
                },
                accessToken,
              );
            } catch {
              // ignore persistence errors; UI already updated
            }
          }
        }
      } catch {
        // ignore
      }
    };

    void ensureOttLinks();
    return () => {
      cancelled = true;
    };
  }, [topPicks, accessToken, user?.id]);

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
    if (!showWatchedModal || !isOwnProfile) return;

    let cancelled = false;

    const loadWatchedItems = async () => {
      setWatchedLoading(true);
      setWatchedError('');

      try {
        const itemsById = new Map<string, WatchedMovieItem>();
        const watchedAtById = new Map(watchedEntries.map((entry) => [entry.id, entry.watchedAt]));

        const recommendationIds: string[] = [];
        const tmdbIds: number[] = [];

        for (const entry of watchedEntries) {
          const match = entry.id.match(/^tmdb-(\d+)$/);
          if (match) {
            tmdbIds.push(Number(match[1]));
          } else {
            recommendationIds.push(entry.id);
          }
        }

        for (const recId of recommendationIds) {
          const rec = recommendationsById.get(recId);
          if (!rec) continue;
          itemsById.set(recId, {
            id: recId,
            title: rec.title,
            year: rec.year,
            poster: rec.poster,
            watchedAt: watchedAtById.get(recId),
          });
        }

        if (recommendationIds.length > 0 && isSupabaseConfigured()) {
          const chunkSize = 40;
          for (let i = 0; i < recommendationIds.length; i += chunkSize) {
            if (cancelled) return;
            const chunk = recommendationIds.slice(i, i + chunkSize);
            const params = new URLSearchParams({
              select: 'id,title,year,poster',
              id: `in.(${chunk.join(',')})`,
            });
            const rows = await supabaseRestRequest<Array<{ id: string; title: string; year: number | null; poster: string | null }>>(
              `recommendations?${params.toString()}`,
              { method: 'GET', timeoutMs: 15000 },
              accessToken,
            );
            for (const row of Array.isArray(rows) ? rows : []) {
              itemsById.set(row.id, {
                id: row.id,
                title: row.title,
                year: row.year ?? undefined,
                poster: row.poster ?? undefined,
                watchedAt: watchedAtById.get(row.id),
              });
            }
          }
        }

        if (tmdbIds.length > 0) {
          const chunkSize = 6;
          for (let i = 0; i < tmdbIds.length; i += chunkSize) {
            if (cancelled) return;
            const chunk = tmdbIds.slice(i, i + chunkSize);
            const results = await Promise.allSettled(chunk.map((tmdbId) => getMovieDetails(tmdbId)));
            chunk.forEach((tmdbId, index) => {
              const key = `tmdb-${tmdbId}`;
              const result = results[index];
              if (result?.status === 'fulfilled' && result.value) {
                const details = result.value;
                itemsById.set(key, {
                  id: key,
                  title: details.title,
                  year: details.release_date ? new Date(details.release_date).getFullYear() : undefined,
                  poster: details.poster_path ? getImageUrl(details.poster_path) : undefined,
                  watchedAt: watchedAtById.get(key),
                });
              } else {
                itemsById.set(key, {
                  id: key,
                  title: `Movie ${tmdbId}`,
                  watchedAt: watchedAtById.get(key),
                });
              }
            });
          }
        }

        const ordered = watchedEntries.map((entry) => {
          return (
            itemsById.get(entry.id) || {
              id: entry.id,
              title: entry.id,
              watchedAt: entry.watchedAt,
            }
          );
        });

        if (!cancelled) {
          setWatchedItems(ordered);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load watched movies';
          setWatchedError(message);
          setWatchedItems([]);
        }
      } finally {
        if (!cancelled) setWatchedLoading(false);
      }
    };

    void loadWatchedItems();

    return () => {
      cancelled = true;
    };
  }, [showWatchedModal, isOwnProfile, watchedEntries, recommendationsById, accessToken]);

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
      const providers = await getWatchProviders(details.id);
      const ottLinks = tmdbWatchProvidersToOttLinks(providers, details.title, details.id);
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
        ott_links: ottLinks,
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
                    <button
                      type="button"
                      onClick={() => setShowWatchedModal(true)}
                      className="text-left rounded-xl px-3 py-2 bg-[var(--bg-secondary)] border border-white/10 hover:border-[var(--accent)]/40 transition-colors"
                      title="View watched movies"
                    >
                      <p className="text-[var(--text-muted)] text-sm">
                        <span className="text-[var(--accent)]">{watchedStats.total}</span> watched ·{' '}
                        <span className="text-[var(--accent)]">{watchedStats.month}</span> this month ·{' '}
                        <span className="text-[var(--accent)]">{watchedStats.year}</span> this year
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)]/80 mt-0.5">
                        Tap to view watched movies
                      </p>
                    </button>
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
              {top10RatingsSupported && topLanguage !== 'All' && (
                <div className="flex items-center gap-2">
                  {top10RatingsLoading ? (
                    <span className="text-xs text-[var(--text-muted)]">Loading ratings…</span>
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">
                      {(() => {
                        const stats = top10RatingsByLanguage[topLanguage];
                        if (!stats || stats.count === 0) return 'No ratings yet';
                        return `${stats.avg.toFixed(1)} (${stats.count})`;
                      })()}
                    </span>
                  )}
                  {user && !isOwnProfile && (
                    <StarRating
                      value={(top10RatingsByLanguage[topLanguage]?.mine ?? 0) || 0}
                      onChange={(v) => void rateTop10Language(topLanguage, v)}
                      disabled={Boolean(top10RatingsSaving[topLanguage])}
                      size="sm"
                    />
                  )}
                </div>
              )}
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
          {top10RatingsSupported && top10RatingsError && (
            <p className="text-xs text-red-400 mb-4">{top10RatingsError}</p>
          )}

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
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[var(--text-muted)]">
                          {group.picks.length} picks
                        </span>
                        {top10RatingsSupported && (
                          <div className="flex items-center gap-2">
                            {top10RatingsLoading ? (
                              <span className="text-xs text-[var(--text-muted)]">…</span>
                            ) : (
                              <span className="text-xs text-[var(--text-muted)]">
                                {(() => {
                                  const key = (group.language || 'Unknown').trim() || 'Unknown';
                                  const stats = top10RatingsByLanguage[key];
                                  if (!stats || stats.count === 0) return 'No ratings';
                                  return `${stats.avg.toFixed(1)} (${stats.count})`;
                                })()}
                              </span>
                            )}
                            {user && !isOwnProfile && (
                              <StarRating
                                value={(() => {
                                  const key = (group.language || 'Unknown').trim() || 'Unknown';
                                  return (top10RatingsByLanguage[key]?.mine ?? 0) || 0;
                                })()}
                                onChange={(v) => void rateTop10Language(group.language, v)}
                                disabled={Boolean(top10RatingsSaving[(group.language || 'Unknown').trim() || 'Unknown'])}
                                size="sm"
                              />
                            )}
                          </div>
                        )}
                      </div>
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

      {showWatchedModal && (
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={() => setShowWatchedModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl max-h-[85vh] bg-[var(--bg-card)] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Watched</p>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                    {watchedStats.total} movies · {watchedStats.month} this month · {watchedStats.year} this year
                  </h3>
                </div>
                <button
                  onClick={() => setShowWatchedModal(false)}
                  className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 overflow-y-auto max-h-[calc(85vh-88px)]">
                {watchedLoading ? (
                  <div className="py-16 text-center text-[var(--text-muted)]">
                    <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="mt-3">Loading watched movies…</p>
                  </div>
                ) : watchedError ? (
                  <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    {watchedError}
                  </div>
                ) : watchedItems.length === 0 ? (
                  <div className="py-14 text-center text-[var(--text-muted)]">
                    <div className="text-3xl mb-2">🎬</div>
                    <p>No watched movies yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {watchedItems.map((item) => (
                      <Link
                        key={item.id}
                        href={`/movie/${item.id}`}
                        className="group rounded-xl overflow-hidden bg-[var(--bg-secondary)] border border-white/10 hover:border-[var(--accent)]/40 transition-colors"
                      >
                        <div className="aspect-[2/3] w-full bg-[var(--bg-primary)] overflow-hidden">
                          {item.poster ? (
                            <img
                              src={item.poster}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-4xl">🎬</div>
                          )}
                        </div>
                        <div className="p-2.5">
                          <p className="text-sm font-medium text-[var(--text-primary)] line-clamp-1">{item.title}</p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                            {item.year ? `${item.year} · ` : ''}
                            {item.watchedAt ? new Date(item.watchedAt).toLocaleDateString('en-US') : 'Watched'}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

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
