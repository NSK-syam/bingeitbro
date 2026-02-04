'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components';
import { createClient, isSupabaseConfigured, DBUser, DBRecommendation } from '@/lib/supabase';
import { Recommendation, OTTLink } from '@/types';
import { MovieCard } from '@/components';
import { useWatched, useWatchlist } from '@/hooks';

export default function ProfilePage() {
  const params = useParams();
  const userId = params.id as string;
  const { user, loading: authLoading } = useAuth();
  const { getWatchedCount } = useWatched();
  const { getWatchlistCount } = useWatchlist();

  const [profileUser, setProfileUser] = useState<DBUser | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isFriend, setIsFriend] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  // Fetch profile data (doesn't depend on auth user)
  useEffect(() => {
    const fetchProfile = async () => {
      // Don't fetch until auth is loaded
      if (authLoading) return;

      // Reset loading state on every fetch attempt
      setIsLoading(true);

      if (!isSupabaseConfigured()) {
        setIsLoading(false);
        return;
      }

      // Timeout after 10 seconds
      const timeout = setTimeout(() => {
        console.error('Profile fetch timeout');
        setIsLoading(false);
      }, 10000);

      try {
        const supabase = createClient();

        // Fetch user profile
        let { data: userData, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();

        clearTimeout(timeout);

        // If no profile exists and this is the logged-in user viewing their own profile, create it
        if ((error || !userData) && user && user.id === userId) {
          console.log('Creating profile for OAuth user...');
          const metadata = user.user_metadata;
          const generatedUsername = user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9_]/g, '') + '_' + Math.random().toString(36).slice(2, 6);

          // Try with username first
          let insertError;
          ({ error: insertError } = await supabase.from('users').insert({
            id: user.id,
            email: user.email || '',
            name: metadata?.full_name || metadata?.name || user.email?.split('@')[0] || 'User',
            username: generatedUsername,
            avatar: ['🎬', '🍿', '🎭', '🎪', '🎯', '🎲'][Math.floor(Math.random() * 6)]
          }));

          // If failed (maybe username column doesn't exist), try without
          if (insertError) {
            console.error('Insert with username failed, trying without:', insertError);
            ({ error: insertError } = await supabase.from('users').insert({
              id: user.id,
              email: user.email || '',
              name: metadata?.full_name || metadata?.name || user.email?.split('@')[0] || 'User',
              avatar: ['🎬', '🍿', '🎭', '🎪', '🎯', '🎲'][Math.floor(Math.random() * 6)]
            }));
          }

          if (!insertError) {
            // Fetch the newly created profile
            const { data: newUserData } = await supabase
              .from('users')
              .select('*')
              .eq('id', userId)
              .single();
            userData = newUserData;
          } else {
            console.error('Failed to create profile:', insertError);
          }
        }

        if (error && !userData) {
          console.error('Error fetching user:', error);
          setIsLoading(false);
          return;
        }

        if (!userData) {
          setIsLoading(false);
          return;
        }

        setProfileUser(userData);

        // Fetch their recommendations
        const { data: recs } = await supabase
          .from('recommendations')
          .select('*')
          .eq('user_id', userId)
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
              id: userData.id,
              name: userData.name,
              avatar: userData.avatar,
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
  }, [userId, user, authLoading]);

  // Check friend status separately (depends on auth user)
  useEffect(() => {
    const checkFriendStatus = async () => {
      if (!user || !userId || user.id === userId || !isSupabaseConfigured()) return;

      try {
        const supabase = createClient();
        const { data: friendData } = await supabase
          .from('friends')
          .select('id')
          .eq('user_id', user.id)
          .eq('friend_id', userId)
          .single();

        setIsFriend(!!friendData);
      } catch (err) {
        // Not friends or error
        setIsFriend(false);
      }
    };

    checkFriendStatus();
  }, [user, userId]);

  const addFriend = async () => {
    if (!user || !profileUser) return;

    setIsAdding(true);
    const supabase = createClient();

    await supabase.from('friends').insert({
      user_id: user.id,
      friend_id: profileUser.id,
    });

    setIsFriend(true);
    setIsAdding(false);
  };

  const removeFriend = async () => {
    if (!user || !profileUser) return;

    setIsAdding(true);
    const supabase = createClient();

    await supabase
      .from('friends')
      .delete()
      .eq('user_id', user.id)
      .eq('friend_id', profileUser.id);

    setIsFriend(false);
    setIsAdding(false);
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profileUser) {
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

  const isOwnProfile = user?.id === profileUser.id;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link href="/" className="text-[var(--accent)] hover:underline flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Cinema Chudu
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Profile Card */}
        <div className="bg-[var(--bg-card)] rounded-2xl p-8 border border-white/10 mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-[var(--accent)] flex items-center justify-center text-5xl">
              {profileUser.avatar}
            </div>
            <div className="text-center sm:text-left flex-1">
              <h1 className="text-3xl font-bold text-[var(--text-primary)]">{profileUser.name}</h1>
              <div className="flex flex-wrap gap-4 mt-2 justify-center sm:justify-start">
                <p className="text-[var(--text-muted)]">{recommendations.length} recommendations</p>
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

            {/* Action Buttons */}
            {user && !isOwnProfile && (
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
          </div>
        </div>

        {/* Recommendations */}
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">
          {isOwnProfile ? 'Your' : `${profileUser.name}'s`} Recommendations
        </h2>

        {recommendations.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {recommendations.map((rec, index) => (
              <MovieCard key={rec.id} recommendation={rec} index={index} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-[var(--text-muted)]">
            <div className="text-4xl mb-2">🎬</div>
            <p>No recommendations yet</p>
          </div>
        )}
      </main>
    </div>
  );
}
