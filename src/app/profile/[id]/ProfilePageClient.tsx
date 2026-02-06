'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components';
import { createClient, isSupabaseConfigured, DBUser, DBRecommendation } from '@/lib/supabase';
import { Recommendation, OTTLink } from '@/types';
import { MovieCard } from '@/components';
import { useWatched, useWatchlist } from '@/hooks';

interface ProfilePageClientProps {
  userId: string;
}

export default function ProfilePageClient({ userId }: ProfilePageClientProps) {
  const { user, loading: authLoading } = useAuth();
  const { getWatchedCount } = useWatched();
  const { getWatchlistCount } = useWatchlist();

  const [profileUser, setProfileUser] = useState<DBUser | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isFriend, setIsFriend] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (authLoading) return;

      setIsLoading(true);

      if (!isSupabaseConfigured()) {
        setIsLoading(false);
        return;
      }

      const timeout = setTimeout(() => {
        setIsLoading(false);
      }, 10000);

      try {
        const supabase = createClient();

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

        let userData = null;
        let error = null;

        if (isUUID) {
          const result = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
          userData = result.data;
          error = result.error;
        } else {
          try {
            const result = await supabase
              .from('users')
              .select('*')
              .eq('username', userId.toLowerCase())
              .single();
            userData = result.data;
            error = result.error;
          } catch {
            // Username column may not exist
          }
        }

        clearTimeout(timeout);

        if ((error || !userData) && user && user.id === userId) {
          const metadata = user.user_metadata;
          const generatedUsername = user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9_]/g, '') + '_' + Math.random().toString(36).slice(2, 6);

          let insertError;
          ({ error: insertError } = await supabase.from('users').insert({
            id: user.id,
            email: user.email || '',
            name: metadata?.full_name || metadata?.name || user.email?.split('@')[0] || 'User',
            username: generatedUsername,
            avatar: ['🎬', '🍿', '🎭', '🎪', '🎯', '🎲'][Math.floor(Math.random() * 6)]
          }));

          if (insertError) {
            ({ error: insertError } = await supabase.from('users').insert({
              id: user.id,
              email: user.email || '',
              name: metadata?.full_name || metadata?.name || user.email?.split('@')[0] || 'User',
              avatar: ['🎬', '🍿', '🎭', '🎪', '🎯', '🎲'][Math.floor(Math.random() * 6)]
            }));
          }

          if (!insertError) {
            const { data: newUserData } = await supabase
              .from('users')
              .select('*')
              .eq('id', userId)
              .single();
            userData = newUserData;
          }
        }

        if (error && !userData) {
          setIsLoading(false);
          return;
        }

        if (!userData) {
          setIsLoading(false);
          return;
        }

        setProfileUser(userData);

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
  }, [userId, user, authLoading]);

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
      } catch {
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

            <div className="flex gap-3 items-center">
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

              <button
                onClick={() => {
                  const profileUrl = `${window.location.origin}/profile/${userId}`;
                  const message = `Check out ${profileUser.name}'s movie recommendations on Cinema Chudu! ${profileUrl}`;
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
