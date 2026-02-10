'use client';

import { useState, useMemo, useEffect, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { Header, MovieCard, FilterBar, AuthModal, SubmitRecommendation, FriendsManager, MovieBackground, WatchlistModal, NudgesModal, TrendingMovies, TodayReleasesModal, FriendRecommendationsModal, BibSplash, useAuth, DailyQuoteBanner, RecommendationToast, BingeCalculatorModal, ConfettiBoom } from '@/components';
import { Recommendation, Recommender, OTTLink } from '@/types';
import { useWatched, useNudges, useWatchlist } from '@/hooks';
import { createClient } from '@/lib/supabase';
import { fetchFriendsList, getFriendRecommendationsUnreadCount, getRecentFriendRecommendations } from '@/lib/supabase-rest';
import data from '@/data/recommendations.json';

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

export default function Home() {
  const staticRecommendations = data.recommendations as Recommendation[];
  const { getWatchedCount, getWatchedCountThisMonth, getWatchedCountThisYear, isWatched } = useWatched();
  const { getWatchlistCount } = useWatchlist();
  const { user, loading: authLoading } = useAuth();

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
  const [showTodayReleases, setShowTodayReleases] = useState(false);
  const [showBingeCalculator, setShowBingeCalculator] = useState(false);
  const [friendsDropdownOpen, setFriendsDropdownOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const friendsDropdownRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<'trending' | 'friends'>('trending');
  const [friendRecommendationsCount, setFriendRecommendationsCount] = useState(0);
  const [authErrorFromRedirect, setAuthErrorFromRedirect] = useState(false);
  const { unreadCount: nudgeCount } = useNudges();
  const [recToast, setRecToast] = useState<{
    senderName: string;
    movieTitle: string;
    count: number;
  } | null>(null);
  const [confettiBoom, setConfettiBoom] = useState(false);
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

  const [visitIndex, setVisitIndex] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dayKey = getLocalDayKey();
    const storedDay = window.localStorage.getItem('cinema-chudu-hero-day');
    let visitCount = Number(window.localStorage.getItem('cinema-chudu-hero-visit') || '0');
    if (storedDay !== dayKey) {
      visitCount = 0;
      window.localStorage.setItem('cinema-chudu-hero-day', dayKey);
    }
    visitCount += 1;
    window.localStorage.setItem('cinema-chudu-hero-visit', String(visitCount));
    const dayIndex = getLocalDayIndex();
    setVisitIndex((dayIndex + visitCount) % HERO_LINES.length);
  }, []);

  const heroLine = useMemo(() => {
    const idx = visitIndex ?? 0;
    const line = HERO_LINES[idx] || HERO_LINES[0];
    return line(displayName);
  }, [visitIndex, displayName]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (authLoading) return;
    const prev = prevUserIdRef.current;
    const current = user?.id ?? null;
    prevUserIdRef.current = current;

    // One big boom per tab session when user becomes signed in.
    if (!prev && current) {
      const key = `bib-signin-boom:${current}`;
      if (!window.sessionStorage.getItem(key)) {
        window.sessionStorage.setItem(key, '1');
        setConfettiBoom(true);
      }
    }
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

      // Received via "Send to Friend" — fetch with Supabase client so RLS uses same session as rest of app
      try {
        const supabase = createClient();
        const { data: receivedRows } = await supabase
          .from('friend_recommendations')
          .select('id, sender_id, movie_title, movie_poster, movie_year, personal_message, created_at, tmdb_id, recommendation_id, sender:users!sender_id(id, name, avatar)')
          .eq('recipient_id', user.id)
          .order('created_at', { ascending: false });

        const received = Array.isArray(receivedRows) ? receivedRows : [];
        for (const row of received) {
          const r = row as unknown as { sender?: { id: string; name: string; avatar?: string } | { id: string; name: string; avatar?: string }[] | null; users?: { id: string; name: string; avatar?: string } | null };
          const rawSender = r.sender ?? r.users ?? null;
          const sender = Array.isArray(rawSender) ? rawSender[0] ?? null : rawSender;
          if (!sender) continue;
          if (sender.id === user.id) continue;
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

  // Lightweight polling for new friend recommendations (toast notification)
  useEffect(() => {
    if (!user) return;
    let canceled = false;
    const storageKey = `bib-last-rec-notify-${user.id}`;

    const poll = async () => {
      try {
        const recent = await getRecentFriendRecommendations(user.id, 5);
        if (canceled || recent.length === 0) return;

        const last = window.localStorage.getItem(storageKey);
        if (!last) {
          // First load: set baseline so opening the app doesn't pop a toast.
          window.localStorage.setItem(storageKey, new Date().toISOString());
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
        window.localStorage.setItem(storageKey, latest.created_at);
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

  const watchedCount = getWatchedCount();
  const watchedThisMonth = getWatchedCountThisMonth();
  const watchedThisYear = getWatchedCountThisYear();
  const totalCount = friendsRecommendations.length;

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

      {/* Today's Releases Modal - Shows once per day or on button click */}
      <TodayReleasesModal
        manualOpen={showTodayReleases}
        onClose={() => setShowTodayReleases(false)}
      />

      <BingeCalculatorModal
        isOpen={showBingeCalculator}
        onClose={() => setShowBingeCalculator(false)}
      />
      <ConfettiBoom isOpen={confettiBoom} onDone={() => setConfettiBoom(false)} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {!user ? (
          <>
            <section className="bib-guest-hero">
              <div className="bib-guest-grid">
                <div className="bib-guest-copy">
                  <span className="bib-guest-kicker">BiB · Binge it bro</span>
                  <h2 className="bib-guest-title">
                    Your movie night, curated by people who actually know you.
                  </h2>
                  <p className="bib-guest-subtitle">
                    Skip the endless scroll. BiB is where friends drop their best picks and you binge with confidence.
                  </p>
                  <div className="bib-guest-actions">
                    <Link href="/signup" className="bib-guest-primary">
                      Join BiB
                    </Link>
                    <button
                      onClick={() => {
                        const el = document.getElementById('bib-preview');
                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="bib-guest-secondary"
                    >
                      Preview picks
                    </button>
                  </div>
                  <div className="bib-guest-badges">
                    <span>🚫 No algorithms</span>
                    <span>👥 Friends only</span>
                    <span>🎬 Built for binges</span>
                  </div>
                </div>

                <div className="bib-guest-clapper">
                  <div className="bib-guest-clapper-top">
                    <div className="bib-guest-clapper-stripes" />
                  </div>
                  <div className="bib-guest-clapper-body">
                    <div className="bib-guest-clapper-row">
                      <span>SCENE</span>
                      <strong>WELCOME</strong>
                    </div>
                    <div className="bib-guest-clapper-row">
                      <span>TAKE</span>
                      <strong>01</strong>
                    </div>
                    <div className="bib-guest-clapper-title">BiB</div>
                    <div className="bib-guest-clapper-tagline">Binge it bro</div>
                  </div>
                </div>
              </div>
            </section>

            <section className="bib-guest-steps">
              <div className="bib-guest-step">
                <h3>Share your taste</h3>
                <p>Drop the movies you actually loved. Your friends see what’s real.</p>
              </div>
              <div className="bib-guest-step">
                <h3>Follow the vibe</h3>
                <p>Filter by language, mood, or your ride‑or‑dies.</p>
              </div>
              <div className="bib-guest-step">
                <h3>Start the binge</h3>
                <p>Pick a rec, hit play, and let the night unfold.</p>
              </div>
            </section>

            <section id="bib-preview" className="bib-guest-preview">
              <div className="bib-guest-preview-head">
                <h3>Preview the vibe</h3>
                <Link
                  href="/signup"
                  className="bib-guest-primary bib-guest-primary--small"
                >
                  Sign up to unlock
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {staticRecommendations.slice(0, 8).map((rec, index) => (
                  <MovieCard key={rec.id} recommendation={rec} index={index} />
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            {/* Daily movie quote — first time per day for signed-in users */}
            <DailyQuoteBanner />

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
                  <div className="flex items-center gap-3 px-4 py-2 bg-[var(--bg-secondary)] rounded-full">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {watchedCount} / {totalCount} watched
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          {watchedThisMonth} this month · {watchedThisYear} this year
                        </p>
                        <div className="w-24 h-1.5 bg-[var(--bg-card)] rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all duration-500"
                            style={{ width: `${totalCount > 0 ? (watchedCount / totalCount) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Main Tabs - Trending, Friends, Add Friends, New Today */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <button
                onClick={() => setActiveView('trending')}
                className={`px-6 py-3 text-sm font-medium rounded-xl transition-all flex items-center gap-2 ${activeView === 'trending'
                  ? 'bg-[var(--accent)] text-[var(--bg-primary)]'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
                  }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Trending
              </button>

              {/* Friends — switch to friends view (list dropdown is on the friends page row below) */}
              <button
                onClick={() => setActiveView('friends')}
                className={`px-6 py-3 text-sm font-medium rounded-xl transition-all flex items-center gap-2 ${activeView === 'friends'
                  ? 'bg-[var(--accent)] text-[var(--bg-primary)]'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
                  }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Friends
                {userFriends.length > 0 && (
                  <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
                    {userFriends.length}
                  </span>
                )}
              </button>

              {/* Add Friends — opens Manage Friends modal */}
              {user && (
                <button
                  onClick={() => setShowFriendsManager(true)}
                  className="px-6 py-3 text-sm font-medium rounded-xl transition-all flex items-center gap-2 bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] border border-white/10"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Friends
                </button>
              )}

              {/* New Today */}
              <button
                onClick={() => setShowTodayReleases(true)}
                className="px-6 py-3 text-sm font-medium rounded-xl transition-all flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-lg hover:shadow-purple-500/25"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                New Today
              </button>

              {/* Binge Calculator */}
              <button
                onClick={() => setShowBingeCalculator(true)}
                className="px-6 py-3 text-sm font-medium rounded-xl transition-all flex items-center gap-2 bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] border border-white/10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Binge Calculator
              </button>
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
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all border ${
                  friendsDropdownOpen
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-2 border-[var(--accent)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-white/10 hover:bg-[var(--bg-card)] hover:border-white/20'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Friends
                {userFriends.length > 0 && (
                  <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-xs">
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
                    <button
                      key={person.id}
                      onClick={() => { handleFilterChange('recommendedBy', filters.recommendedBy === person.id ? null : person.id); }}
                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 ${filters.recommendedBy === person.id ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium' : 'text-[var(--text-primary)] hover:bg-[var(--bg-card)]'}`}
                    >
                      <span>{person.avatar}</span>
                      <span className="truncate">{person.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Filters — pill like image: filter icon + "Filters" + chevron, orange border when open */}
            {friendsRecommendations.length > 0 && (
              <div className="relative" ref={filterPanelRef}>
                <button
                  type="button"
                  onClick={() => setFilterPanelOpen((o) => !o)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all border-2 ${
                    filterPanelOpen
                      ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--accent)]'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-white/10 hover:bg-[var(--bg-card)] hover:border-white/20'
                  }`}
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
              <div className="absolute left-0 top-full mt-2 z-40 w-[min(100%,420px)] max-h-[80vh] overflow-y-auto bg-[var(--bg-secondary)] rounded-2xl border border-white/10 shadow-xl p-4 space-y-4">
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
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
                  <span className="text-xs text-[var(--text-muted)] w-16">Status:</span>
                  {(['all', 'watched'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => handleFilterChange('watchedStatus', status)}
                      className={`px-3 py-1.5 text-sm rounded-full transition-all flex items-center gap-1.5 ${filters.watchedStatus === status
                        ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                        : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                      {status === 'all' ? 'Unwatched' : (
                        <>
                          ✓ Watched
                          <span className="opacity-90 font-normal">
                            ({watchedThisMonth} this month · {watchedThisYear} this year)
                          </span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
          </div>
        )}

        {/* Show Trending or Friend Recommendations based on activeView */}
        {(!user || activeView === 'trending') ? (
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            <TrendingMovies searchQuery={searchQuery} />
          </Suspense>
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
                  <MovieCard key={rec.id} recommendation={rec} index={index} />
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
    </div>
  );
}
