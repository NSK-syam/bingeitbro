'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthProvider';
import { createClient, DBUser } from '@/lib/supabase';

interface Friend extends DBUser {
  friendshipId?: string;
}

interface FriendsManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onFriendsChange: () => void;
}

export function FriendsManager({ isOpen, onClose, onFriendsChange }: FriendsManagerProps) {
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DBUser[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch current friends
  const fetchFriends = useCallback(async () => {
    console.log('[FriendsManager] fetchFriends called, user:', user?.id);
    if (!user) {
      console.log('[FriendsManager] No user, stopping load');
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('[FriendsManager] Query timed out after 8s');
      controller.abort();
    }, 8000);

    try {
      const supabase = createClient();

      // Verify we have a valid auth session before querying RLS tables
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('[FriendsManager] Session check:', {
        hasSession: !!session,
        userId: session?.user?.id,
        expiresAt: session?.expires_at,
        error: sessionError?.message,
      });

      if (!session) {
        console.warn('[FriendsManager] No session, skipping friends query');
        setFriends([]);
        clearTimeout(timeoutId);
        setIsLoading(false);
        return;
      }

      console.log('[FriendsManager] Starting friends query...');

      // Step 1: Get friend relationships
      const { data: friendships, error: friendsError } = await supabase
        .from('friends')
        .select('id, friend_id')
        .eq('user_id', user.id)
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);
      console.log('[FriendsManager] Friendships query complete:', { friendships, friendsError });

      if (friendsError) {
        console.error('[FriendsManager] Error fetching friendships:', friendsError);
        setFriends([]);
        return;
      }

      if (!friendships || friendships.length === 0) {
        console.log('[FriendsManager] No friends found');
        setFriends([]);
        return;
      }

      // Step 2: Get user details for friends
      const friendIds = friendships.map(f => f.friend_id);
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('*')
        .in('id', friendIds)
        .abortSignal(controller.signal);

      console.log('[FriendsManager] Users query complete:', { users, usersError });

      if (usersError) {
        console.error('[FriendsManager] Error fetching friend users:', usersError);
        return;
      }

      if (users) {
        const friendsList: Friend[] = users.map((u: DBUser) => {
          const friendship = friendships.find(f => f.friend_id === u.id);
          return {
            ...u,
            friendshipId: friendship?.id,
          };
        });
        setFriends(friendsList);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        console.error('[FriendsManager] Request aborted (timeout)');
      } else {
        console.error('[FriendsManager] Exception:', err?.name, err?.message);
      }
      setFriends([]);
    } finally {
      clearTimeout(timeoutId);
      console.log('[FriendsManager] Finally block - setting isLoading to false');
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (isOpen) {
      if (user) {
        fetchFriends();
      } else {
        // User not available yet, stop loading
        setIsLoading(false);
      }
    } else {
      // Reset loading state when modal closes so it shows loading on next open
      setIsLoading(true);
    }
  }, [isOpen, user?.id, fetchFriends]); // Use user.id

  useEffect(() => {
    if (!searchQuery.trim() || !user) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setIsSearching(true);

      const supabase = createClient();

      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .or(`name.ilike.%${searchQuery}%,username.ilike.%${searchQuery}%`)
          .neq('id', user.id)
          .limit(10);

        if (cancelled) return;

        if (error) {
          console.error('FriendsManager: Search error:', error);
          // Fallback to name only search if username column doesn't exist
          if (error.code === '42703') {
            try {
              const { data: retryData } = await supabase
                .from('users')
                .select('*')
                .ilike('name', `%${searchQuery}%`)
                .neq('id', user.id)
                .limit(10);
              if (!cancelled) setSearchResults(retryData || []);
            } catch (retryErr) {
              console.error('FriendsManager: Retry search failed:', retryErr);
              if (!cancelled) setSearchResults([]);
            }
          } else {
            setSearchResults([]);
          }
        } else {
          setSearchResults(data || []);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('FriendsManager: Search exception:', err);
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, user?.id]);

  const addFriend = async (friendUser: DBUser) => {
    if (!user) return;

    const supabase = createClient();
    const { error } = await supabase.from('friends').insert({
      user_id: user.id,
      friend_id: friendUser.id,
    });

    if (!error) {
      setFriends((prev) => [...prev, { ...friendUser, friendshipId: undefined }]);
      setSearchQuery('');
      setSearchResults([]);
      onFriendsChange();
      fetchFriends();
    }
  };

  const removeFriend = async (friendshipId: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('friends').delete().eq('id', friendshipId);

    if (!error) {
      setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
      onFriendsChange();
    }
  };

  const isFriend = (userId: string) => friends.some((f) => f.id === userId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md max-h-[80vh] overflow-hidden bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-white/10">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <h2 className="text-xl font-bold text-[var(--text-primary)]">Manage Friends</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Add friends to see their recommendations
          </p>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-white/10">
          <div className="relative">
            <input
              type="text"
              name="friendSearch"
              id="friendSearch"
              placeholder="Search users by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2.5 pl-10 bg-[var(--bg-secondary)] border border-white/5 rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
              {searchResults.map((result) => (
                <div
                  key={result.id}
                  className="flex items-center justify-between p-2 bg-[var(--bg-secondary)] rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{result.avatar}</span>
                    <span className="text-sm text-[var(--text-primary)]">{result.name}</span>
                  </div>
                  {isFriend(result.id) ? (
                    <span className="text-xs text-[var(--text-muted)]">Already friends</span>
                  ) : (
                    <button
                      onClick={() => addFriend(result)}
                      className="px-3 py-1 text-xs bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-full hover:bg-[var(--accent-hover)] transition-colors"
                    >
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Friends List */}
        <div className="p-4 overflow-y-auto max-h-[40vh]">
          <h3 className="text-sm font-medium text-[var(--text-muted)] mb-3">
            Your Friends ({friends.length})
          </h3>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : friends.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-muted)]">
              <p>No friends yet</p>
              <p className="text-sm mt-1">Search and add friends above</p>
            </div>
          ) : (
            <div className="space-y-2">
              {friends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{friend.avatar}</span>
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">{friend.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{friend.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => friend.friendshipId && removeFriend(friend.friendshipId)}
                    className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
