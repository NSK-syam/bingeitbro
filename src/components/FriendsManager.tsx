'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthProvider';
import { isSupabaseConfigured } from '@/lib/supabase';

interface UserPreview {
  id: string;
  name: string;
  username?: string | null;
  avatar?: string | null;
  email?: string | null;
}

interface Friend extends UserPreview {
  friendshipId?: string;
}

interface FriendshipRow {
  id: string;
  friend_id: string;
}

interface FriendsManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onFriendsChange: () => void;
}

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const supabaseProjectRef = (() => {
  if (!supabaseUrl) return '';
  try {
    return new URL(supabaseUrl).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
})();

const getAccessToken = () => {
  if (typeof window === 'undefined' || !supabaseProjectRef) return null;
  const raw = window.localStorage.getItem(`sb-${supabaseProjectRef}-auth-token`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.access_token ?? null;
  } catch {
    return null;
  }
};

const supabaseRequest = async <T,>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
  accessToken?: string | null,
): Promise<T> => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured.');
  }
  const token = (accessToken || getAccessToken() || supabaseAnonKey).trim();
  const { timeoutMs = 8000, headers, ...rest } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...rest,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        ...headers,
      },
      signal: controller.signal,
    });

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const message =
        typeof data === 'object' && data !== null && 'message' in data
          ? String((data as { message?: string }).message || response.statusText)
          : response.statusText || 'Request failed.';
      throw new Error(message);
    }

    return data as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};

export function FriendsManager({ isOpen, onClose, onFriendsChange }: FriendsManagerProps) {
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserPreview[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch current friends
  const fetchFriends = useCallback(async () => {
    console.log('[FriendsManager] fetchFriends called, user:', user?.id);
    setErrorMessage('');
    setIsLoading(true);
    if (!user) {
      console.log('[FriendsManager] No user, stopping load');
      setIsLoading(false);
      return;
    }
    if (!isSupabaseConfigured()) {
      setErrorMessage('Supabase is not configured. Please set environment variables.');
      setIsLoading(false);
      return;
    }

    try {
      console.log('[FriendsManager] Starting friends query for user:', user.id);
      const accessToken = getAccessToken();

      // Step 1: Get friend relationships
      let slowTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        setErrorMessage('Waking up the database… please wait.');
      }, 7000);

      const friendsParams = new URLSearchParams({
        select: 'id,friend_id',
        user_id: `eq.${user.id}`,
      });

      const friendships = await supabaseRequest<FriendshipRow[]>(
        `friends?${friendsParams.toString()}`,
        { method: 'GET', timeoutMs: 25000 },
        accessToken,
      );
      if (slowTimer) clearTimeout(slowTimer);
      console.log('[FriendsManager] Friendships query complete:', { friendships });

      if (!friendships || friendships.length === 0) {
        console.log('[FriendsManager] No friends found');
        setFriends([]);
        return;
      }

      // Step 2: Get user details for friends
      const friendIds = friendships.map(f => f.friend_id);
      slowTimer = setTimeout(() => {
        setErrorMessage('Loading friend profiles… please wait.');
      }, 7000);

      const usersParams = new URLSearchParams({
        select: 'id,name,username,avatar,email',
        id: `in.(${friendIds.join(',')})`,
      });

      const users = await supabaseRequest<UserPreview[]>(
        `users?${usersParams.toString()}`,
        { method: 'GET', timeoutMs: 25000 },
        accessToken,
      );
      if (slowTimer) clearTimeout(slowTimer);

      console.log('[FriendsManager] Users query complete:', { users });

      if (users) {
        const friendsList: Friend[] = users.map((u: UserPreview) => {
          const friendship = friendships.find(f => f.friend_id === u.id);
          return {
            ...u,
            friendshipId: friendship?.id,
          };
        });
        setFriends(friendsList);
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error('[FriendsManager] Exception:', err?.name, err?.message);
      setErrorMessage(err?.message || 'Something went wrong while loading friends.');
      setFriends([]);
    } finally {
      console.log('[FriendsManager] Finally block - setting isLoading to false');
      setIsLoading(false);
    }
  }, [user]);

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
  }, [isOpen, user, fetchFriends]);

  useEffect(() => {
    if (!searchQuery.trim() || !user) {
      setSearchResults([]);
      setErrorMessage('');
      return;
    }
    if (!isSupabaseConfigured()) {
      setErrorMessage('Supabase is not configured. Please set environment variables.');
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setIsSearching(true);

      const accessToken = getAccessToken();
      const sanitizedQuery = searchQuery.replace(/[%_(),]/g, ' ').trim();

      try {
        let slowTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
          if (!cancelled) setErrorMessage('Searching… please wait.');
        }, 7000);

        if (!sanitizedQuery) {
          if (slowTimer) clearTimeout(slowTimer);
          setSearchResults([]);
          setErrorMessage('');
          return;
        }

        const orFilter = `name.ilike.*${sanitizedQuery}*,username.ilike.*${sanitizedQuery}*`;
        const searchParams = new URLSearchParams({
          select: 'id,name,username,avatar,email',
          or: `(${orFilter})`,
          id: `neq.${user.id}`,
          limit: '10',
        });

        const data = await supabaseRequest<UserPreview[]>(
          `users?${searchParams.toString()}`,
          { method: 'GET' },
          accessToken,
        );
        if (slowTimer) clearTimeout(slowTimer);

        if (cancelled) return;

        setErrorMessage('');
        setSearchResults(data || []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        if (!cancelled) {
          console.error('FriendsManager: Search exception:', err);
          setErrorMessage(err?.message || 'Search failed. Please try again.');
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
  }, [searchQuery, user]);

  const addFriend = async (friendUser: UserPreview) => {
    if (!user) return;

    try {
      await supabaseRequest(
        'friends',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            user_id: user.id,
            friend_id: friendUser.id,
          }),
        },
        getAccessToken(),
      );
    } catch (err: any) {
      console.error('FriendsManager: Add friend error:', err);
      setErrorMessage('Unable to add friend. Please try again.');
      return;
    }

    setFriends((prev) => [...prev, { ...friendUser, friendshipId: undefined }]);
    setSearchQuery('');
    setSearchResults([]);
    onFriendsChange();
    fetchFriends();
  };

  const removeFriend = async (friendshipId: string) => {
    try {
      const deleteParams = new URLSearchParams({
        id: `eq.${friendshipId}`,
      });

      await supabaseRequest(
        `friends?${deleteParams.toString()}`,
        {
          method: 'DELETE',
          headers: {
            Prefer: 'return=minimal',
          },
        },
        getAccessToken(),
      );
    } catch (err: any) {
      console.error('FriendsManager: Remove friend error:', err);
      setErrorMessage('Unable to remove friend. Please try again.');
      return;
    }

    setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    onFriendsChange();
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
          {errorMessage && (
            <div className="mt-2 text-xs text-red-400">
              {errorMessage}
            </div>
          )}

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
          ) : errorMessage ? (
            <div className="text-center py-8">
              <p className="text-[var(--text-muted)] mb-2">{errorMessage}</p>
              <p className="text-sm text-[var(--text-muted)] mb-4">The server may be waking up. Try again in a moment.</p>
              <button
                type="button"
                onClick={() => { setErrorMessage(''); fetchFriends(); }}
                className="px-4 py-2 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-full hover:bg-[var(--accent-hover)] transition-colors"
              >
                Retry
              </button>
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
                      {friend.username && (
                        <p className="text-xs text-[var(--text-muted)]">@{friend.username}</p>
                      )}
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
