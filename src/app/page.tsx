'use client';

import { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import { Header, MovieCard, FilterBar, RandomPicker, AuthModal, SubmitRecommendation, FriendsManager, MovieBackground, WatchlistModal, NudgesModal, TrendingMovies, TodayReleasesModal, FriendRecommendationsModal, useAuth } from '@/components';
import { Recommendation, Recommender, OTTLink } from '@/types';
import { useWatched, useNudges, useWatchlist } from '@/hooks';
import { createClient, isSupabaseConfigured, DBRecommendation } from '@/lib/supabase';
import data from '@/data/recommendations.json';

export default function Home() {
  const staticRecommendations = data.recommendations as Recommendation[];
  const staticRecommenders = data.recommenders as Recommender[];
  const { getWatchedCount, isWatched } = useWatched();
  const { getWatchlistCount } = useWatchlist();
  const { user } = useAuth();

  const [dbRecommendations, setDbRecommendations] = useState<Recommendation[]>([]);
  const [friendsRecommendations, setFriendsRecommendations] = useState<Recommendation[]>([]);
  const [userFriends, setUserFriends] = useState<Recommender[]>([]);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showFriendsManager, setShowFriendsManager] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showNudges, setShowNudges] = useState(false);
  const [showFriendRecommendations, setShowFriendRecommendations] = useState(false);
  const [showTodayReleases, setShowTodayReleases] = useState(false);
  const [activeView, setActiveView] = useState<'trending' | 'friends'>('trending');
  const [friendRecommendationsCount, setFriendRecommendationsCount] = useState(0);
  const { unreadCount: nudgeCount } = useNudges();

  // Combine static + friends recommendations
  const recommendations = useMemo(() => {
    return [...friendsRecommendations, ...dbRecommendations, ...staticRecommendations];
  }, [friendsRecommendations, dbRecommendations, staticRecommendations]);

  // Only user's friends (no static recommenders)
  const recommenders = useMemo(() => {
    return [...userFriends];
  }, [userFriends]);

  // Fetch all recommendations from Supabase (for search)
  const fetchRecommendations = useCallback(async () => {
    if (!isSupabaseConfigured()) return;

    const supabase = createClient();
    const { data: recs } = await supabase
      .from('recommendations')
      .select('*, user:users(*)')
      .order('created_at', { ascending: false });

    if (recs) {
      const mapped: Recommendation[] = recs.map((rec: DBRecommendation) => ({
        id: rec.id,
        title: rec.title,
        originalTitle: rec.original_title,
        year: rec.year,
        type: rec.type,
        poster: rec.poster,
        backdrop: rec.backdrop,
        genres: rec.genres,
        language: rec.language,
        duration: rec.duration,
        rating: rec.rating,
        personalNote: rec.personal_note,
        mood: rec.mood,
        watchWith: rec.watch_with,
        ottLinks: rec.ott_links as OTTLink[],
        recommendedBy: {
          id: rec.user?.id || 'unknown',
          name: rec.user?.name || 'Anonymous',
          avatar: rec.user?.avatar || '🎬',
        },
        addedOn: rec.created_at,
      }));
      setDbRecommendations(mapped);
    }
  }, []);

  // Fetch user's friends and their recommendations
  const fetchFriendsData = useCallback(async () => {
    if (!isSupabaseConfigured() || !user) {
      setUserFriends([]);
      setFriendsRecommendations([]);
      return;
    }

    const supabase = createClient();

    // Get friends list
    const { data: friendsData } = await supabase
      .from('friends')
      .select('friend:users!friends_friend_id_fkey(*)')
      .eq('user_id', user.id);

    if (friendsData && friendsData.length > 0) {
      const friends: Recommender[] = friendsData.map((f: any) => ({
        id: f.friend.id,
        name: f.friend.name,
        avatar: f.friend.avatar,
      }));
      setUserFriends(friends);

      // Get friends' recommendations
      const friendIds = friends.map((f) => f.id);
      const { data: friendRecs } = await supabase
        .from('recommendations')
        .select('*, user:users(*)')
        .in('user_id', friendIds)
        .order('created_at', { ascending: false });

      if (friendRecs) {
        const mapped: Recommendation[] = friendRecs.map((rec: DBRecommendation) => ({
          id: rec.id,
          title: rec.title,
          originalTitle: rec.original_title,
          year: rec.year,
          type: rec.type,
          poster: rec.poster,
          backdrop: rec.backdrop,
          genres: rec.genres,
          language: rec.language,
          duration: rec.duration,
          rating: rec.rating,
          personalNote: rec.personal_note,
          mood: rec.mood,
          watchWith: rec.watch_with,
          ottLinks: rec.ott_links as OTTLink[],
          recommendedBy: {
            id: rec.user?.id || 'unknown',
            name: rec.user?.name || 'Anonymous',
            avatar: rec.user?.avatar || '🎬',
          },
          addedOn: rec.created_at,
        }));
        setFriendsRecommendations(mapped);
      }
    } else {
      setUserFriends([]);
      setFriendsRecommendations([]);
    }
  }, [user]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  useEffect(() => {
    fetchFriendsData();
  }, [fetchFriendsData]);

  const handleSubmitSuccess = () => {
    fetchRecommendations();
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
    watchedStatus: 'all' | 'watched' | 'unwatched';
  }>({
    type: null,
    genre: null,
    language: null,
    recommendedBy: null,
    watchedStatus: 'all',
  });

  const handleFilterChange = (key: string, value: string | null) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const filteredRecommendations = useMemo(() => {
    // Use friends' recommendations for friends view
    const baseRecommendations = searchQuery ? recommendations : friendsRecommendations;

    return baseRecommendations.filter((rec) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          rec.title.toLowerCase().includes(query) ||
          rec.originalTitle?.toLowerCase().includes(query) ||
          rec.genres.some((g) => g.toLowerCase().includes(query)) ||
          rec.recommendedBy.name.toLowerCase().includes(query) ||
          rec.personalNote.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Type filter
      if (filters.type && rec.type !== filters.type) return false;

      // Genre filter
      if (filters.genre && !rec.genres.includes(filters.genre)) return false;

      // Language filter
      if (filters.language && rec.language !== filters.language) return false;

      // Recommender filter (only applies to friends)
      if (filters.recommendedBy && rec.recommendedBy.id !== filters.recommendedBy)
        return false;

      // Watched status filter
      if (filters.watchedStatus === 'watched' && !isWatched(rec.id)) return false;
      if (filters.watchedStatus === 'unwatched' && isWatched(rec.id)) return false;

      return true;
    });
  }, [recommendations, friendsRecommendations, searchQuery, filters, isWatched]);

  // Sort by date added (newest first)
  const sortedRecommendations = useMemo(() => {
    return [...filteredRecommendations].sort(
      (a, b) => new Date(b.addedOn).getTime() - new Date(a.addedOn).getTime()
    );
  }, [filteredRecommendations]);

  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value !== null && value !== 'all'
  ).length;

  const watchedCount = getWatchedCount();
  const hasNoFriends = friendsRecommendations.length === 0;
  const totalCount = hasNoFriends ? recommendations.length : friendsRecommendations.length;

  return (
    <div className="min-h-screen relative">
      <MovieBackground />
      <Header
        onSearch={setSearchQuery}
        onLoginClick={() => setShowAuthModal(true)}
        onAddClick={() => setShowSubmitModal(true)}
        onWatchlistClick={() => setShowWatchlist(true)}
        onNudgesClick={() => setShowNudges(true)}
        onFriendRecommendationsClick={() => setShowFriendRecommendations(true)}
        nudgeCount={nudgeCount}
        watchlistCount={getWatchlistCount()}
        friendRecommendationsCount={friendRecommendationsCount}
      />

      {/* Auth Modal */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* Submit Recommendation Modal */}
      <SubmitRecommendation
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        onSuccess={handleSubmitSuccess}
      />

      {/* Friends Manager Modal */}
      <FriendsManager
        isOpen={showFriendsManager}
        onClose={() => setShowFriendsManager(false)}
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {/* Hero section */}
        <div className="text-center mb-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-gradient mb-4">
            What are we watching tonight?
          </h2>
          <p className="text-[var(--text-secondary)] max-w-2xl mx-auto mb-6">
            Recommendations from friends who actually know your taste. No algorithms,
            just good vibes and great stories.
          </p>

          {/* Stats and Random Picker - only show when viewing friend recommendations */}
          {activeView === 'friends' && friendsRecommendations.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <RandomPicker recommendations={sortedRecommendations} />

              {/* Watch Progress */}
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
                    <div className="w-24 h-1.5 bg-[var(--bg-card)] rounded-full overflow-hidden">
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

        {/* Main Tabs - Trending vs Friends */}
        <div className="flex flex-wrap gap-2 mb-6">
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
            {friendsRecommendations.length > 0 && (
              <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
                {friendsRecommendations.length}
              </span>
            )}
          </button>

          {/* New Today Button */}
          <button
            onClick={() => setShowTodayReleases(true)}
            className="px-6 py-3 text-sm font-medium rounded-xl transition-all flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-lg hover:shadow-purple-500/25"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            New Today
          </button>
        </div>

        {/* Friends Filter - Only show in friends view */}
        {activeView === 'friends' && (
          <div className="bg-[var(--bg-secondary)] rounded-2xl p-4 sm:p-6 mb-8 border border-white/5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--text-muted)] w-16">Filter:</span>
              <button
                onClick={() => handleFilterChange('recommendedBy', null)}
                className={`px-3 py-1.5 text-sm rounded-full transition-all ${!filters.recommendedBy
                  ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                  }`}
              >
                All Friends
              </button>
              {recommenders.map((person) => (
                <div key={person.id} className="flex items-center">
                  <button
                    onClick={() =>
                      handleFilterChange(
                        'recommendedBy',
                        filters.recommendedBy === person.id ? null : person.id
                      )
                    }
                    className={`px-3 py-1.5 text-sm rounded-l-full transition-all ${filters.recommendedBy === person.id
                      ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                      : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                      }`}
                  >
                    {person.avatar} {person.name}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFriend(person.id);
                    }}
                    className="px-2 py-1.5 text-sm rounded-r-full bg-[var(--bg-card)] text-red-400 hover:bg-red-500/20 transition-all border-l border-white/10"
                    title="Remove friend"
                  >
                    ×
                  </button>
                </div>
              ))}
              {user && (
                <button
                  onClick={() => setShowFriendsManager(true)}
                  className="px-3 py-1.5 text-sm rounded-full bg-[var(--bg-card)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--bg-primary)] transition-all flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Friends
                </button>
              )}
            </div>

            {/* Additional filters */}
            {friendsRecommendations.length > 0 && (
              <>
                <FilterBar
                  recommendations={filters.recommendedBy
                    ? friendsRecommendations.filter(r => r.recommendedBy.id === filters.recommendedBy)
                    : friendsRecommendations
                  }
                  recommenders={[]}
                  activeFilters={filters}
                  onFilterChange={handleFilterChange}
                  showManageFriends={false}
                />

                {/* Watched status filter */}
                <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-white/5">
                  <span className="text-xs text-[var(--text-muted)] w-16">Status:</span>
                  {(['all', 'unwatched', 'watched'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => handleFilterChange('watchedStatus', status)}
                      className={`px-3 py-1.5 text-sm rounded-full transition-all ${filters.watchedStatus === status
                        ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                        : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                      {status === 'all' ? 'All' : status === 'watched' ? '✓ Watched' : '○ Unwatched'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Show Trending or Friend Recommendations based on activeView */}
        {activeView === 'trending' ? (
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
                    setFilters({ type: null, genre: null, language: null, recommendedBy: null, watchedStatus: 'all' })
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
                  {recommenders.length === 0 ? 'No friends yet' : 'No recommendations'}
                </h3>
                <p className="text-[var(--text-secondary)] mb-4">
                  {recommenders.length === 0
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
            Cinema Chudu • Made with love for movie lovers
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            Sign in to share your favorite movie recommendations with friends
          </p>
        </footer>
      </main>
    </div>
  );
}
