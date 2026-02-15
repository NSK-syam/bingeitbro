'use client';

import dynamic from 'next/dynamic';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { HubTabs } from '@/components/HubTabs';
import { MovieCard } from '@/components/MovieCard';
import { FilterBar } from '@/components/FilterBar';
import { AuthModal } from '@/components/AuthModal';
import { MovieBackground } from '@/components/MovieBackground';
import { BibSplash } from '@/components/BibSplash';
import { DailyQuoteBanner } from '@/components/DailyQuoteBanner';
import { MovieCalendarSpotlightPopup } from '@/components/MovieCalendarSpotlightPopup';
import { ValentineHeartsBurst } from '@/components/ValentineHeartsBurst';
import { RecommendationToast } from '@/components/RecommendationToast';
import { CountryToggle } from '@/components/CountryToggle';
import { HelpBotWidget } from '@/components/HelpBotWidget';
import { useAuth } from '@/components/AuthProvider';
import { Recommendation, Recommender, OTTLink } from '@/types';
import { useWatched, useNudges, useWatchlist, useCountry } from '@/hooks';
import { createClient } from '@/lib/supabase';
import {
  fetchFriendsList,
  getFriendRecommendationsUnreadCount,
  getRecentFriendRecommendations,
  getUpcomingWatchReminders,
} from '@/lib/supabase-rest';
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/safe-storage';
import data from '@/data/recommendations.json';

const SubmitRecommendation = dynamic(
  () => import('@/components/SubmitRecommendation').then((mod) => mod.SubmitRecommendation),
  { ssr: false }
);
const FriendsManager = dynamic(
  () => import('@/components/FriendsManager').then((mod) => mod.FriendsManager),
  { ssr: false }
);
const WatchlistModal = dynamic(
  () => import('@/components/WatchlistModal').then((mod) => mod.WatchlistModal),
  { ssr: false }
);
const NudgesModal = dynamic(
  () => import('@/components/NudgesModal').then((mod) => mod.NudgesModal),
  { ssr: false }
);
const FriendRecommendationsModal = dynamic(
  () => import('@/components/FriendRecommendationsModal').then((mod) => mod.FriendRecommendationsModal),
  { ssr: false }
);
const BingeCalculatorModal = dynamic(
  () => import('@/components/BingeCalculatorModal').then((mod) => mod.BingeCalculatorModal),
  { ssr: false }
);
const ScheduleWatchModal = dynamic(
  () => import('@/components/ScheduleWatchModal').then((mod) => mod.ScheduleWatchModal),
  { ssr: false }
);
const GroupWatchModal = dynamic(
  () => import('@/components/GroupWatchModal').then((mod) => mod.GroupWatchModal),
  { ssr: false }
);
const TrendingMovies = dynamic(
  () => import('@/components/TrendingMovies').then((mod) => mod.TrendingMovies),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
);

const HERO_LINES = [
  (name: string) => `Tonight's lineup just dropped${name ? `, ${name}` : ''}.`,
  (name: string) => `Curtain up${name ? `, ${name}` : ''}. Let's pick your next watch.`,
  (name: string) => `Your friends brought receipts${name ? `, ${name}` : ''}.`,
  (name: string) => `Press play on the good stuff${name ? `, ${name}` : ''}.`,
  (name: string) => `No algorithm. Just taste${name ? `, ${name}` : ''}.`,
  (name: string) => `Now showing: stories you'll actually finish${name ? `, ${name}` : ''}.`,
  (name: string) => `The group chat would approve${name ? `, ${name}` : ''}.`,
  (name: string) => `Spoiler-free. Vibe-full${name ? `, ${name}` : ''}.`,
];

const getLocalDayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getLocalDayIndex = () => {
  const now = new Date();
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor(localMidnight.getTime() / 86400000);
};

const getLocalMonthDay = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${month}-${day}`;
};

export default function MoviesHome() {
  const staticRecommendations = data.recommendations as Recommendation[];
  const { watchedState, isWatched } = useWatched();
  const { getWatchlistCount } = useWatchlist();
  const { user, loading: authLoading } = useAuth();
  const [country, setCountry] = useCountry();

  const [friendsRecommendations, setFriendsRecommendations] = useState<Recommendation[]>([]);
  const [userFriends, setUserFriends] = useState<Recommender[]>([]);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showFriendsManager, setShowFriendsManager] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showNudges, setShowNudges] = useState(false);
  const [showFriendRecommendations, setShowFriendRecommendations] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('view') === 'friends';
  });
  const [showBingeCalculator, setShowBingeCalculator] = useState(false);
  const [showScheduleWatch, setShowScheduleWatch] = useState(false);
  const [showGroupWatch, setShowGroupWatch] = useState(false);
  const [valentineOpenSignal, setValentineOpenSignal] = useState(0);
  const [valentineSpotlightOpen, setValentineSpotlightOpen] = useState(false);
  const [localMonthDay, setLocalMonthDay] = useState(getLocalMonthDay);
  const [showWatchedFriendsModal, setShowWatchedFriendsModal] = useState(false);
  const [friendsDropdownOpen, setFriendsDropdownOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const friendsDropdownRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<'trending' | 'friends'>('trending');
  const [friendRecommendationsCount, setFriendRecommendationsCount] = useState(0);
  const [scheduledWatchCount, setScheduledWatchCount] = useState(0);
  const [authErrorFromRedirect, setAuthErrorFromRedirect] = useState(false);
  const { unreadCount: nudgeCount } = useNudges();
  const [recToast, setRecToast] = useState<{
    senderName: string;
    movieTitle: string;
    count: number;
  } | null>(null);
  const prevUserIdRef = useRef<string | null>(null);

  const displayName = useMemo(() => {
    if (!user) return '';
    const metadata = user.user_metadata as { full_name?: string; name?: string } | undefined;
    return (
      metadata?.full_name ||
      metadata?.name ||
      user.email?.split('@')[0] ||
      'there'
    );
  }, [user]);
  const isValentinesDay = localMonthDay === '02-14';

  useEffect(() => {
    const tick = () => setLocalMonthDay(getLocalMonthDay());
    const interval = window.setInterval(tick, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const [visitIndex, setVisitIndex] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dayKey = getLocalDayKey();
    const storedDay = safeLocalStorageGet('cinema-chudu-hero-day');
    let visitCount = Number(safeLocalStorageGet('cinema-chudu-hero-visit') || '0');
    if (storedDay !== dayKey) {
      visitCount = 0;
      safeLocalStorageSet('cinema-chudu-hero-day', dayKey);
    }
    visitCount += 1;
    safeLocalStorageSet('cinema-chudu-hero-visit', String(visitCount));
    const dayIndex = getLocalDayIndex();
    setVisitIndex((dayIndex + visitCount) % HERO_LINES.length);
  }, []);

  const heroLine = useMemo(() => {
    const idx = visitIndex ?? 0;
    const line = HERO_LINES[idx] || HERO_LINES[0];
    return line(displayName);
  }, [visitIndex, displayName]);

  useEffect(() => {
    if (authLoading) return;
    prevUserIdRef.current = user?.id ?? null;
  }, [authLoading, user?.id]);

  // Recommenders shown in Friends view (only people who sent recommendations)
  const recommenders = useMemo(() => {
    const byId = new Map<string, Recommender>();
    friendsRecommendations.forEach((r) => {
      const rb = r.recommendedBy;
      if (rb?.id && !byId.has(rb.id)) byId.set(rb.id, rb);
    });
    return Array.from(byId.values());
  }, [friendsRecommendations]);

  const filmstripItems = useMemo(() => {
    if (!user) return [];

    // Count unwatched per recommender (from Friends view list) — goes down when user marks as watched
    const unwatchedCounts = friendsRecommendations.reduce<Record<string, number>>((acc, rec) => {
      const key = rec.recommendedBy?.id || '';
      if (!key) return acc;
      if (!isWatched(rec.id)) {
        acc[key] = (acc[key] || 0) + 1;
      }
      return acc;
    }, {});

    const activeRecommenders = recommenders.filter((person) => (unwatchedCounts[person.id] || 0) > 0);

    if (activeRecommenders.length === 0) {
      return ['No new recommendations yet', 'Ask a friend to send a pick', 'Start a binge'];
    }

    return activeRecommenders.map((person) => {
      const count = unwatchedCounts[person.id] || 0;
      const label = count === 1 ? 'movie' : 'movies';
      return `${count} ${label} from ${person.name}`;
    });
  }, [user, recommenders, friendsRecommendations, isWatched]);

  // If user was redirected with ?error=auth, open auth modal and show message
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'auth') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthErrorFromRedirect(true);
      setShowAuthModal(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Fetch user's friends and received "Send to Friend" recs — Friends view shows direct sends only
  const fetchFriendsData = useCallback(async () => {
    if (!user) {
      setUserFriends([]);
      setFriendsRecommendations([]);
      return;
    }

    try {
      const friendsList = await fetchFriendsList(user.id);
      const friends: Recommender[] = friendsList.map((f) => ({
        id: f.id,
        name: f.name,
        avatar: f.avatar ?? '🎬',
      }));
      setUserFriends(friends);

      const fromReceived: Recommendation[] = [];

      // Received via "Send to Friend".
      // Do NOT depend on an embedded `users` join here: the recipient may not be able to read the sender's
      // profile row (one-way "friends" relationship). We still want the movie to appear.
      try {
        const supabase = createClient();
        const friendById = new Map(friends.map((f) => [f.id, f]));
        const { data: receivedRows } = await supabase
          .from('friend_recommendations')
          .select('id, sender_id, movie_title, movie_poster, movie_year, personal_message, created_at, tmdb_id, recommendation_id')
          .eq('recipient_id', user.id)
          .order('created_at', { ascending: false });

        const received = Array.isArray(receivedRows) ? receivedRows : [];
        for (const row of received) {
          if (row.sender_id === user.id) continue;
          const sender =
            friendById.get(row.sender_id) ?? ({
              id: row.sender_id,
              name: 'A friend',
              avatar: '🎬',
            } as const);
          const id = row.tmdb_id
            ? `tmdb-${row.tmdb_id}`
            : (row.recommendation_id || `fr-${row.id}`);
          fromReceived.push({
            id,
            title: row.movie_title ?? '',
            year: row.movie_year ?? 0,
            type: 'movie' as const,
            poster: row.movie_poster ?? '',
            genres: [],
            language: '',
            personalNote: row.personal_message ?? '',
            ottLinks: [],
            recommendedBy: {
              id: sender.id,
              name: sender.name || 'Anonymous',
              avatar: sender.avatar ?? '🎬',
            },
            addedOn: row.created_at,
          });
        }
      } catch {
        // ignore; Friends view still works with table recs only
      }

      const merged = [...fromReceived].sort(
        (a, b) => new Date(b.addedOn).getTime() - new Date(a.addedOn).getTime()
      );
      setFriendsRecommendations(merged);
    } catch {
      setUserFriends([]);
      setFriendsRecommendations([]);
    }
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFriendsData();
  }, [fetchFriendsData]);

  // Refetch friends when switching to Friends view so list matches Manage Friends
  useEffect(() => {
    if (activeView === 'friends' && user) {
      fetchFriendsData();
    }
  }, [activeView, user, fetchFriendsData]);

  // Load initial unread count so friend sees badge when they open the app
  useEffect(() => {
    if (!user) return;
    getFriendRecommendationsUnreadCount(user.id).then(setFriendRecommendationsCount);
  }, [user]);

  const refreshScheduledWatchCount = useCallback(async () => {
    if (!user) {
      setScheduledWatchCount(0);
      return;
    }
    try {
      const reminders = await getUpcomingWatchReminders();
      const now = Date.now();
      const pending = reminders.filter((r) => !r.notifiedAt && new Date(r.remindAt).getTime() > now);
      setScheduledWatchCount(Math.min(pending.length, 99));
    } catch {
      setScheduledWatchCount(0);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setScheduledWatchCount(0);
      return;
    }
    void refreshScheduledWatchCount();
    const interval = window.setInterval(() => {
      void refreshScheduledWatchCount();
    }, 60000);
    return () => window.clearInterval(interval);
  }, [user, refreshScheduledWatchCount]);

  // Lightweight polling for new friend recommendations (toast notification)
  useEffect(() => {
    if (!user) return;
    let canceled = false;
    const storageKey = `bib-last-rec-notify-${user.id}`;

    const poll = async () => {
      try {
        const recent = await getRecentFriendRecommendations(user.id, 5);
        if (canceled || recent.length === 0) return;

        const last = safeLocalStorageGet(storageKey);
        if (!last) {
          // First load: set baseline so opening the app doesn't pop a toast.
          safeLocalStorageSet(storageKey, new Date().toISOString());
          return;
        }

        const lastTime = new Date(last).getTime();
        const newOnes = recent.filter((r) => new Date(r.created_at).getTime() > lastTime);
        if (newOnes.length === 0) return;

        const latest = newOnes[0];
        setRecToast({
          senderName: latest.sender?.name || 'Someone',
          movieTitle: latest.movie_title || 'a movie',
          count: newOnes.length,
        });
        safeLocalStorageSet(storageKey, latest.created_at);
        getFriendRecommendationsUnreadCount(user.id).then(setFriendRecommendationsCount);
      } catch {
        // ignore
      }
    };

    poll();
    const interval = window.setInterval(poll, 30000);
    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, [user]);

  // Handle deep links from push notifications (/?view=friends)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'friends') {
      params.delete('view');
      const nextQuery = params.toString();
      const nextUrl = nextQuery ? `/?${nextQuery}` : '/';
      window.history.replaceState({}, '', nextUrl);
    }
  }, []);

  // Close Friends dropdown and Filter panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (friendsDropdownRef.current && !friendsDropdownRef.current.contains(e.target as Node)) {
        setFriendsDropdownOpen(false);
      }
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setFilterPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Realtime subscription disabled: WebSocket to Supabase was failing and spamming the console.
  // Badge still updates on load (getFriendRecommendationsUnreadCount) and when opening the modal.

  const handleSubmitSuccess = () => {
    fetchFriendsData();
  };

  const handleFriendsChange = () => {
    fetchFriendsData();
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!user) return;

    const supabase = createClient();
    await supabase
      .from('friends')
      .delete()
      .eq('user_id', user.id)
      .eq('friend_id', friendId);

    fetchFriendsData();
  };


  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<{
    type: string | null;
    genre: string | null;
    language: string | null;
    recommendedBy: string | null;
    year: number | null;
    watchedStatus: 'all' | 'watched';
  }>({
    type: null,
    genre: null,
    language: null,
    recommendedBy: null,
    year: null,
    watchedStatus: 'all',
  });

  const handleFilterChange = (key: string, value: string | number | null) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const filteredRecommendations = useMemo(() => {
    // Friends view: only show direct sends, even when searching
    return friendsRecommendations.filter((rec) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const genres = Array.isArray(rec.genres) ? rec.genres : [];
        const matchesSearch =
          (rec.title ?? '').toLowerCase().includes(query) ||
          (rec.originalTitle ?? '').toLowerCase().includes(query) ||
          genres.some((g) => String(g).toLowerCase().includes(query)) ||
          (rec.recommendedBy?.name ?? '').toLowerCase().includes(query) ||
          (rec.personalNote ?? '').toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Type filter
      if (filters.type && rec.type !== filters.type) return false;

      // Genre filter
      const recGenres = Array.isArray(rec.genres) ? rec.genres : [];
      if (filters.genre && !recGenres.includes(filters.genre)) return false;

      // Language filter
      if (filters.language && rec.language !== filters.language) return false;

      // Recommender filter (only applies to friends)
      if (filters.recommendedBy && (rec.recommendedBy?.id ?? '') !== filters.recommendedBy)
        return false;

      // Year filter
      if (filters.year != null && rec.year !== filters.year) return false;

      // Watched status filter (Friends view hides watched by default)
      if (filters.watchedStatus === 'watched') {
        if (!isWatched(rec.id)) return false;
      } else if (isWatched(rec.id)) {
        return false;
      }

      return true;
    });
  }, [friendsRecommendations, searchQuery, filters, isWatched]);

  // Sort by date added (newest first)
  const sortedRecommendations = useMemo(() => {
    return [...filteredRecommendations].sort(
      (a, b) => new Date(b.addedOn).getTime() - new Date(a.addedOn).getTime()
    );
  }, [filteredRecommendations]);

  const activeFilterCount = Object.entries(filters).filter(
    ([, value]) => value !== null && value !== 'all'
  ).length;

  const { watchedCount, watchedThisMonth, watchedThisYear } = useMemo(() => {
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth();
    let watchedCountLocal = 0;
    let watchedThisMonthLocal = 0;
    let watchedThisYearLocal = 0;

    for (const rec of friendsRecommendations) {
      const watchedEntry = watchedState[rec.id];
      if (!watchedEntry?.watched) continue;
      watchedCountLocal += 1;

      if (!watchedEntry.watchedAt) continue;
      const watchedDate = new Date(watchedEntry.watchedAt);
      if (watchedDate.getFullYear() === thisYear) {
        watchedThisYearLocal += 1;
        if (watchedDate.getMonth() === thisMonth) {
          watchedThisMonthLocal += 1;
        }
      }
    }

    return {
      watchedCount: watchedCountLocal,
      watchedThisMonth: watchedThisMonthLocal,
      watchedThisYear: watchedThisYearLocal,
    };
  }, [friendsRecommendations, watchedState]);
  const totalCount = friendsRecommendations.length;
  const watchedFriendsRecommendations = useMemo(() => {
    return friendsRecommendations
      .filter((rec) => watchedState[rec.id]?.watched)
      .map((rec) => ({ rec, watchedAt: watchedState[rec.id]?.watchedAt }))
      .sort((a, b) => {
        const at = a.watchedAt ? new Date(a.watchedAt).getTime() : 0;
        const bt = b.watchedAt ? new Date(b.watchedAt).getTime() : 0;
        return bt - at;
      });
  }, [friendsRecommendations, watchedState]);

  return (
    <div className="min-h-screen relative">
      <BibSplash enabled={!user && showAuthModal} />
      <MovieBackground />
      <Header
        onSearch={setSearchQuery}
        onLoginClick={() => setShowAuthModal(true)}
        onWatchlistClick={() => setShowWatchlist(true)}
        onNudgesClick={() => setShowNudges(true)}
        onFriendRecommendationsClick={() => setShowFriendRecommendations(true)}
        onAddClick={() => setShowSubmitModal(true)}
        nudgeCount={nudgeCount}
        watchlistCount={getWatchlistCount()}
        friendRecommendationsCount={friendRecommendationsCount}
      />
      {user && activeView !== 'friends' && <HubTabs placement="center" />}

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => { setShowAuthModal(false); setAuthErrorFromRedirect(false); }}
        initialError={authErrorFromRedirect ? 'Sign-in was cancelled or failed. Add https://bingeitbro.com/auth/callback to Supabase Auth → URL Configuration → Redirect URLs, and set NEXT_PUBLIC_SUPABASE_* env vars on Cloudflare. Then try again.' : undefined}
      />

      {recToast && (
        <RecommendationToast
          senderName={recToast.senderName}
          movieTitle={recToast.movieTitle}
          count={recToast.count}
          onClose={() => setRecToast(null)}
          onAction={() => {
            setRecToast(null);
            setShowFriendRecommendations(true);
          }}
        />
      )}

      {/* Submit Recommendation Modal */}
      <SubmitRecommendation
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        onSuccess={handleSubmitSuccess}
      />

      {/* Friends Manager Modal */}
      <FriendsManager
        isOpen={showFriendsManager}
        onClose={() => {
          setShowFriendsManager(false);
          // Sync friends list so "Friends" view shows same count as Manage Friends
          handleFriendsChange();
        }}
        onFriendsChange={handleFriendsChange}
      />

      {/* Watchlist Modal */}
      <WatchlistModal
        isOpen={showWatchlist}
        onClose={() => setShowWatchlist(false)}
      />

      {/* Nudges Modal */}
      <NudgesModal
        isOpen={showNudges}
        onClose={() => setShowNudges(false)}
      />

      {/* Friend Recommendations Modal */}
      <FriendRecommendationsModal
        isOpen={showFriendRecommendations}
        onClose={() => setShowFriendRecommendations(false)}
        onCountChange={setFriendRecommendationsCount}
      />

      <BingeCalculatorModal
        isOpen={showBingeCalculator}
        onClose={() => setShowBingeCalculator(false)}
      />
      <ScheduleWatchModal
        isOpen={showScheduleWatch}
        onClose={() => setShowScheduleWatch(false)}
        onScheduled={refreshScheduledWatchCount}
      />
      <GroupWatchModal
        isOpen={showGroupWatch}
        onClose={() => setShowGroupWatch(false)}
      />
      {user && (
        <MovieCalendarSpotlightPopup
          userId={user.id}
          mediaType="movie"
          openSignal={valentineOpenSignal}
          onOpenChange={setValentineSpotlightOpen}
        />
      )}
      {isValentinesDay && <ValentineHeartsBurst active={valentineSpotlightOpen} />}
      {user && <HelpBotWidget />}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {!user ? (
          <div className="min-h-[50vh] flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Daily movie quote — first time per day for signed-in users */}
            <DailyQuoteBanner userId={user.id} />

            {/* Hero section */}
            <div className="text-center mb-8">
              <h2 className="text-3xl sm:text-4xl font-bold text-gradient mb-4">
                {heroLine}
              </h2>
              <p className="text-[var(--text-secondary)] max-w-2xl mx-auto mb-6">
                Recommendations from friends who actually know your taste. No algorithms, just good vibes and great stories.
              </p>
              {user && activeView === 'friends' && filmstripItems.length > 0 && (
                <div className="bib-filmstrip" aria-label="Friends filmstrip">
                  <div className="bib-filmstrip-track">
                    {filmstripItems.concat(filmstripItems).map((item, index) => (
                      <div className="bib-filmstrip-frame" key={`${item}-${index}`}>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Watch Progress - only show in Friends view */}
              {activeView === 'friends' && friendsRecommendations.length > 0 && (
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setShowWatchedFriendsModal(true)}
                    className="flex items-center gap-3 px-4 py-2 bg-[var(--bg-secondary)] rounded-full border border-white/10 hover:border-[var(--accent)]/40 transition-colors text-left"
                    title="View watched friend suggestions"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {watchedCount} watched from {totalCount} friend suggestions
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          {watchedThisMonth} this month · {watchedThisYear} this year
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)]/80 mt-0.5">
                          Tap to view watched list
                        </p>
                        <div className="w-24 h-1.5 bg-[var(--bg-card)] rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all duration-500"
                            style={{ width: `${totalCount > 0 ? (watchedCount / totalCount) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Main Tabs - Trending and Friends */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
              {/* Button design: consistent pill height, glassy surface, bold active state */}
              {/*
                Keep styles local to avoid refactors across the app.
                If you want to reuse later, we can extract a shared PillButton component.
              */}
              <button
                onClick={() => setActiveView('trending')}
                className={[
                  'h-11 px-5 rounded-full inline-flex items-center gap-2',
                  'text-sm font-semibold',
                  'transition-all select-none',
                  'backdrop-blur-xl border shadow-[0_10px_30px_rgba(0,0,0,0.28)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
                  activeView === 'trending'
                    ? 'bg-gradient-to-r from-amber-300 to-orange-500 text-[#16110a] border-orange-200 shadow-[0_14px_40px_rgba(245,158,11,0.3)]'
                    : 'bg-gradient-to-r from-amber-500/30 to-orange-500/25 text-amber-100 border-amber-300/35 hover:from-amber-400/40 hover:to-orange-400/35 hover:text-amber-50',
                  'active:scale-[0.99]',
                ].join(' ')}
                aria-pressed={activeView === 'trending'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Trending
              </button>

              {/* Friends — switch to friends view (list dropdown is on the friends page row below) */}
              <button
                onClick={() => setActiveView('friends')}
                className={[
                  'h-11 px-5 rounded-full inline-flex items-center gap-2',
                  'text-sm font-semibold',
                  'transition-all select-none',
                  'backdrop-blur-xl border shadow-[0_10px_30px_rgba(0,0,0,0.28)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
                  activeView === 'friends'
                    ? 'bg-gradient-to-r from-cyan-300 to-blue-500 text-[#0a1222] border-cyan-200 shadow-[0_14px_40px_rgba(59,130,246,0.3)]'
                    : 'bg-gradient-to-r from-cyan-500/25 to-blue-600/25 text-cyan-100 border-cyan-300/30 hover:from-cyan-400/35 hover:to-blue-500/35 hover:text-cyan-50',
                  'active:scale-[0.99]',
                ].join(' ')}
                aria-pressed={activeView === 'friends'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Friends
                {userFriends.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--bg-primary)]/25 border border-white/10">
                    {userFriends.length}
                  </span>
                )}
              </button>

              {/* Binge Calculator */}
              <button
                onClick={() => setShowBingeCalculator(true)}
                className={[
                  'h-11 px-5 rounded-full inline-flex items-center gap-2',
                  'text-sm font-semibold',
                  'transition-all select-none',
                  'bg-gradient-to-r from-violet-600/35 to-fuchsia-600/35 text-fuchsia-100 border border-fuchsia-300/30 backdrop-blur-xl shadow-[0_10px_30px_rgba(124,58,237,0.28)]',
                  'hover:from-violet-500/45 hover:to-fuchsia-500/45 hover:text-fuchsia-50 hover:border-fuchsia-200/45',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
                  'active:scale-[0.99]',
                ].join(' ')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Binge Calculator
              </button>

              {/* Schedule Watch */}
              <button
                onClick={() => setShowScheduleWatch(true)}
                className={[
                  'h-11 px-5 rounded-full inline-flex items-center gap-2 relative',
                  'text-sm font-semibold',
                  'transition-all select-none',
                  'bg-gradient-to-r from-cyan-500/40 to-blue-600/40 text-cyan-100 border border-cyan-300/35 backdrop-blur-xl shadow-[0_10px_30px_rgba(14,165,233,0.24)]',
                  'hover:from-cyan-400/50 hover:to-blue-500/50 hover:text-cyan-50 hover:border-cyan-200/45',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
                  'active:scale-[0.99]',
                ].join(' ')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z" />
                </svg>
                Schedule Watch
                {scheduledWatchCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-cyan-200 text-[#071018] text-xs font-bold flex items-center justify-center border border-cyan-50/80 shadow-sm">
                    {scheduledWatchCount > 99 ? '99+' : scheduledWatchCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setShowGroupWatch(true)}
                className={[
                  'h-11 px-5 rounded-full inline-flex items-center gap-2 relative',
                  'text-sm font-semibold',
                  'transition-all select-none',
                  'bg-gradient-to-r from-indigo-500/40 to-fuchsia-600/40 text-indigo-100 border border-indigo-300/35 backdrop-blur-xl shadow-[0_10px_30px_rgba(99,102,241,0.26)]',
                  'hover:from-indigo-400/50 hover:to-fuchsia-500/50 hover:text-indigo-50 hover:border-indigo-200/45',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
                  'active:scale-[0.99]',
                ].join(' ')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Group Watch
              </button>

              {isValentinesDay && (
                <button
                  onClick={() => {
                    setValentineOpenSignal((n) => n + 1);
                  }}
                  className={[
                    'h-11 px-5 rounded-full inline-flex items-center gap-2',
                    'text-sm font-semibold',
                    'transition-all select-none',
                    'bg-gradient-to-r from-rose-500/55 to-pink-500/55 text-rose-50 border border-rose-200/45 backdrop-blur-xl shadow-[0_10px_30px_rgba(244,63,94,0.28)]',
                    'hover:from-rose-400/65 hover:to-pink-400/65 hover:border-rose-100/65',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
                    'active:scale-[0.99]',
                  ].join(' ')}
                >
                  <span aria-hidden>💘</span>
                  Valentines Special
                </button>
              )}

              {/* Country (affects OTT logos) */}
              <div className="flex items-center gap-2 sm:ml-auto">
                <span className="text-xs text-[var(--text-muted)] hidden sm:block">Country</span>
                <CountryToggle value={country} onChange={setCountry} />
              </div>
            </div>
          </>
        )}

        {/* Friends page: pill row — Friends list | Add Friends | Filters (like image) */}
        {user && activeView === 'friends' && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {/* 1. Friends list — pill, opens dropdown */}
            <div className="relative" ref={friendsDropdownRef}>
              <button
                type="button"
                onClick={() => setFriendsDropdownOpen((o) => !o)}
                className={[
                  'h-11 px-5 rounded-full inline-flex items-center gap-2',
                  'text-sm font-semibold',
                  'transition-all select-none',
                  'text-sky-100 border backdrop-blur-xl shadow-[0_10px_30px_rgba(37,99,235,0.26)]',
                  friendsDropdownOpen
                    ? 'bg-gradient-to-r from-sky-500/55 to-indigo-600/55 border-sky-200/65 ring-1 ring-sky-300/45'
                    : 'bg-gradient-to-r from-sky-600/35 to-indigo-700/35 border-sky-300/30 hover:from-sky-500/45 hover:to-indigo-600/45 hover:border-sky-200/45',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
                  'active:scale-[0.99]',
                ].join(' ')}
                aria-expanded={friendsDropdownOpen}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Friends
                {userFriends.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--bg-primary)]/25 border border-white/10">
                    {userFriends.length}
                  </span>
                )}
                <svg className={`w-4 h-4 transition-transform ${friendsDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {friendsDropdownOpen && (
                <div className="absolute left-0 top-full mt-2 z-50 min-w-[220px] max-h-[70vh] overflow-y-auto bg-[var(--bg-secondary)] rounded-xl border border-white/10 shadow-xl py-2">
                  <button
                    onClick={() => { handleFilterChange('recommendedBy', null); setFriendsDropdownOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm ${filters.recommendedBy === null ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium' : 'text-[var(--text-primary)] hover:bg-[var(--bg-card)]'}`}
                  >
                    All
                  </button>
                  {[...userFriends]
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
                    .map((person) => (
                    <Link
                      key={person.id}
                      href={`/profile/${person.id}`}
                      onClick={() => setFriendsDropdownOpen(false)}
                      className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                    >
                      <span>{person.avatar}</span>
                      <span className="truncate">{person.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Add Friends — keep this action in Friends tab */}
            <button
              onClick={() => setShowFriendsManager(true)}
              className={[
                'h-11 px-5 rounded-full inline-flex items-center gap-2',
                'text-sm font-semibold',
                'transition-all select-none',
                'bg-gradient-to-r from-emerald-500/35 to-teal-600/35 text-emerald-100 border border-emerald-300/30 backdrop-blur-xl shadow-[0_10px_30px_rgba(16,185,129,0.24)]',
                'hover:from-emerald-400/45 hover:to-teal-500/45 hover:text-emerald-50 hover:border-emerald-200/45',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
                'active:scale-[0.99]',
              ].join(' ')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Friends
            </button>

            {/* 2. Filters — pill like image: filter icon + "Filters" + chevron, orange border when open */}
            {friendsRecommendations.length > 0 && (
              <div className="relative" ref={filterPanelRef}>
                <button
                  type="button"
                  onClick={() => setFilterPanelOpen((o) => !o)}
                  className={[
                    'h-11 px-5 rounded-full inline-flex items-center gap-2',
                    'text-sm font-semibold',
                    'transition-all select-none',
                    'text-amber-100 border backdrop-blur-xl shadow-[0_10px_30px_rgba(251,146,60,0.22)]',
                    filterPanelOpen
                      ? 'bg-gradient-to-r from-amber-400/55 to-orange-500/55 border-amber-100/70 ring-1 ring-amber-300/50'
                      : 'bg-gradient-to-r from-amber-600/35 to-orange-600/35 border-amber-300/35 hover:from-amber-500/45 hover:to-orange-500/45 hover:border-amber-100/50',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
                    'active:scale-[0.99]',
                  ].join(' ')}
                  aria-expanded={filterPanelOpen}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[var(--bg-primary)]/20 text-xs">
                      {activeFilterCount}
                    </span>
                  )}
                  <svg className={`w-4 h-4 transition-transform ${filterPanelOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {filterPanelOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 top-full mt-2 z-40 w-[min(92vw,440px)] max-h-[75vh] overflow-y-auto bg-[var(--bg-primary)]/95 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-xl p-4 sm:p-5">
                <FilterBar
                  recommendations={filters.recommendedBy
                    ? friendsRecommendations.filter(r => r.recommendedBy.id === filters.recommendedBy)
                    : friendsRecommendations
                  }
                  recommenders={recommenders}
                  activeFilters={filters}
                  onFilterChange={handleFilterChange}
                  hideFriendsSection={true}
                />
                <div className="pt-4 mt-4 border-t border-white/10">
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] mb-2">Status</p>
                  <div className="flex flex-wrap gap-2">
                    {(['all', 'watched'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => handleFilterChange('watchedStatus', status)}
                        className={`px-3 py-1.5 text-sm rounded-full transition-all ${
                          filters.watchedStatus === status
                            ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-semibold'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] border border-white/10'
                        }`}
                      >
                        {status === 'all' ? 'Unwatched' : 'Watched'}
                      </button>
                    ))}
                    <span className="text-xs text-[var(--text-muted)] self-center">
                      {watchedThisMonth} this month · {watchedThisYear} this year
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
          </div>
        )}

        {/* Show Trending or Friend Recommendations based on activeView */}
        {(!user || activeView === 'trending') ? (
          <>
            <TrendingMovies searchQuery={searchQuery} country={country} />
          </>
        ) : (
          <>
            {/* Results count */}
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-[var(--text-muted)]">
                {sortedRecommendations.length}{' '}
                {sortedRecommendations.length === 1 ? 'recommendation' : 'recommendations'}
                {activeFilterCount > 0 && (
                  <span className="text-[var(--accent)]"> (filtered)</span>
                )}
              </p>
              {activeFilterCount > 0 && (
                <button
                  onClick={() =>
                    setFilters({ type: null, genre: null, language: null, recommendedBy: null, year: null, watchedStatus: 'all' })
                  }
                  className="text-sm text-[var(--accent)] hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Movie grid */}
            {sortedRecommendations.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                {sortedRecommendations.map((rec, index) => (
                  <MovieCard key={rec.id} recommendation={rec} index={index} country={country} />
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">👥</div>
                <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                  {userFriends.length === 0 ? 'No friends yet' : 'No recommendations'}
                </h3>
                <p className="text-[var(--text-secondary)] mb-4">
                  {userFriends.length === 0
                    ? 'Add friends to see their movie recommendations'
                    : filters.recommendedBy
                      ? 'This friend hasn\'t added any recommendations yet'
                      : 'Your friends haven\'t added any recommendations yet'}
                </p>
                {user && recommenders.length === 0 && (
                  <button
                    onClick={() => setShowFriendsManager(true)}
                    className="px-4 py-2 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-full hover:bg-[var(--accent-hover)] transition-colors"
                  >
                    Add Friends
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-white/5 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            BiB • Binge it bro
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            Sign in to share your favorite movie recommendations with friends
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-4 text-xs text-[var(--text-muted)]">
            <Link href="/privacy" className="hover:text-[var(--text-secondary)] transition-colors">Privacy Policy</Link>
            <span className="opacity-30">|</span>
            <Link href="/terms" className="hover:text-[var(--text-secondary)] transition-colors">Terms of Service</Link>
            <span className="opacity-30">|</span>
            <Link href="/cookies" className="hover:text-[var(--text-secondary)] transition-colors">Cookies</Link>
            <span className="opacity-30">|</span>
            <Link href="/copyright" className="hover:text-[var(--text-secondary)] transition-colors">Copyright</Link>
            <span className="opacity-30">|</span>
            <Link href="/disclaimer" className="hover:text-[var(--text-secondary)] transition-colors">Disclaimer</Link>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-3 opacity-50">
            &copy; {new Date().getFullYear()} BiB. All rights reserved.
          </p>
        </footer>
      </main>

      {showWatchedFriendsModal && (
        <>
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[200]"
            onClick={() => setShowWatchedFriendsModal(false)}
          />
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
            <div className="isolate w-full max-w-3xl max-h-[85vh] bg-[var(--bg-primary)] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Watched</p>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                    {watchedCount} watched from {totalCount} friend suggestions
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowWatchedFriendsModal(false);
                  }}
                  className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 overflow-y-auto max-h-[calc(85vh-88px)]">
                {watchedFriendsRecommendations.length === 0 ? (
                  <div className="py-14 text-center text-[var(--text-muted)]">
                    <div className="text-3xl mb-2">🎬</div>
                    <p>No watched friend suggestions yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {watchedFriendsRecommendations.map(({ rec, watchedAt }) => (
                      <Link
                        key={rec.id}
                        href={`/movie/${rec.id}`}
                        className="group rounded-xl overflow-hidden bg-[var(--bg-secondary)] border border-white/10 hover:border-[var(--accent)]/40 transition-colors"
                      >
                        <div className="aspect-[2/3] w-full bg-[var(--bg-primary)] overflow-hidden">
                          {rec.poster ? (
                            <img
                              src={rec.poster}
                              alt={rec.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-4xl">🎬</div>
                          )}
                        </div>
                        <div className="p-2.5">
                          <p className="text-sm font-medium text-[var(--text-primary)] line-clamp-1">{rec.title}</p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">
                            {rec.recommendedBy?.name ? `From ${rec.recommendedBy.name} · ` : ''}
                            {watchedAt ? new Date(watchedAt).toLocaleDateString('en-US') : 'Watched'}
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
    </div>
  );
}
