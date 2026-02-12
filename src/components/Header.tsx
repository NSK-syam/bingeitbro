'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthProvider';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';
import { fetchTmdbWithProxy } from '@/lib/tmdb-fetch';
import { enablePushNotifications } from '@/lib/push';

interface HeaderProps {
  searchMode?: 'movie' | 'tv' | 'off';
  onSearch?: (query: string) => void;
  onLoginClick?: () => void;
  onWatchlistClick?: () => void;
  onNudgesClick?: () => void;
  onFriendRecommendationsClick?: () => void;
  onAddClick?: () => void;
  nudgeCount?: number;
  watchlistCount?: number;
  friendRecommendationsCount?: number;
}

interface SearchSuggestion {
  id: number;
  label: string;
}

export function Header({
  searchMode = 'movie',
  onSearch,
  onLoginClick,
  onWatchlistClick,
  onNudgesClick,
  onFriendRecommendationsClick,
  onAddClick,
  nudgeCount = 0,
  watchlistCount = 0,
  friendRecommendationsCount = 0,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<'unsupported' | 'default' | 'granted' | 'denied'>('default');
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);
  const { user, signOut, isConfigured } = useAuth();

  // Fetch current user's avatar from DB (for header + picker)
  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured()) {
      setUserAvatar(null);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      try {
        const { data } = await supabase.from('users').select('avatar').eq('id', user.id).single();
        if (!cancelled) setUserAvatar(data?.avatar ?? null);
      } catch {
        if (!cancelled) setUserAvatar(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) {
      setPushStatus('unsupported');
      return;
    }
    setPushStatus(Notification.permission);
  }, []);

  // Fetch autocomplete suggestions from TMDB
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (searchMode === 'off' || !onSearch) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      if (searchQuery.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      setLoadingSuggestions(true);

      try {
        const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
        if (!apiKey) {
          setLoadingSuggestions(false);
          return;
        }

        const endpoint = searchMode === 'tv' ? 'tv' : 'movie';
        const response = await fetchTmdbWithProxy(
          `https://api.themoviedb.org/3/search/${endpoint}?api_key=${apiKey}&query=${encodeURIComponent(searchQuery)}&page=1&include_adult=false`
        );
        const data = await response.json();

        const nextSuggestions: SearchSuggestion[] = (data.results || [])
          .slice(0, 8)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((item: any) => ({
            id: item.id,
            label: searchMode === 'tv' ? item.name : item.title,
          }));

        setSuggestions(nextSuggestions);
        setShowSuggestions(nextSuggestions.length > 0);
      } catch (error) {
        console.error('Failed to fetch suggestions:', error);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    const timer = setTimeout(() => {
      fetchSuggestions();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchMode, onSearch]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setSelectedIndex(-1);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setSearchQuery(suggestion);
    onSearch?.(suggestion);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter' && searchQuery) {
        onSearch?.(searchQuery);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSuggestionClick(suggestions[selectedIndex].label);
        } else if (searchQuery) {
          onSearch?.(searchQuery);
          setShowSuggestions(false);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';

  const handleEnablePush = async () => {
    if (!user) return;
    setPushError('');
    setPushLoading(true);
    try {
      await enablePushNotifications(user.id);
      setPushStatus('granted');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to enable notifications';
      setPushError(message);
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden flex-shrink-0 shadow-lg shadow-[var(--accent)]/20 ring-1 ring-white/10">
              <img
                src="/bib-logo.png"
                alt="BiB"
                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
              />
            </div>
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Binge It Bro</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">BiB</span>
            </div>
            <span className="sr-only">Binge It Bro</span>
          </Link>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {/* Search with Autocomplete */}
            {searchMode !== 'off' && onSearch && (
              <div className="relative" ref={searchRef}>
                <input
                  type="text"
                  placeholder={searchMode === 'tv' ? 'Search shows...' : 'Search movies...'}
                  value={searchQuery}
                  onChange={handleSearch}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    if (suggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  className="w-32 sm:w-48 px-4 py-2 pl-10 text-sm bg-[var(--bg-secondary)] border border-white/5 rounded-full text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/50 transition-all"
                />
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>

                {/* Autocomplete Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--bg-card)] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-w-md">
                    {loadingSuggestions && suggestions.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-[var(--text-muted)]">
                        Searching...
                      </div>
                    ) : (
                      suggestions.map((suggestion, index) => (
                        <button
                          key={suggestion.id}
                          onClick={() => handleSuggestionClick(suggestion.label)}
                          onMouseEnter={() => setSelectedIndex(index)}
                          className={`w-full px-4 py-2.5 text-left flex items-center gap-3 transition-colors ${index === selectedIndex
                            ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                            : 'text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                            }`}
                        >
                          <svg
                            className={`w-4 h-4 flex-shrink-0 ${index === selectedIndex ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                              }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                          </svg>
                          <span className="text-sm truncate">{suggestion.label}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Friend Recommendations, Nudges, Watchlist */}
            {user ? (
              <>
                {/* Friend Recommendations */}
                <button
                  onClick={onFriendRecommendationsClick}
                  className="relative p-2 text-sm bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-full hover:bg-[var(--bg-card)] transition-colors border border-white/10"
                  title="Friend Recommendations"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  {friendRecommendationsCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                      {friendRecommendationsCount > 9 ? '9+' : friendRecommendationsCount}
                    </span>
                  )}
                </button>
                {/* Nudges */}
                <button
                  onClick={onNudgesClick}
                  className="relative p-2 text-sm bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-full hover:bg-[var(--bg-card)] transition-colors border border-white/10"
                  title="Nudges"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {nudgeCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                      {nudgeCount > 9 ? '9+' : nudgeCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={onWatchlistClick}
                  className="relative flex items-center gap-1.5 px-3 py-2 text-sm bg-[var(--bg-secondary)] text-[var(--text-primary)] font-medium rounded-full hover:bg-[var(--bg-card)] transition-colors border border-white/10"
                  title="My Watchlist"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
                  </svg>
                  <span className="hidden sm:inline">Watchlist</span>
                  {watchlistCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--accent)] text-[var(--bg-primary)] text-xs font-bold rounded-full flex items-center justify-center">
                      {watchlistCount > 9 ? '9+' : watchlistCount}
                    </span>
                  )}
                </button>
              </>
            ) : null}

            {/* User Menu / Login */}
            {isConfigured && user ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)] rounded-full hover:bg-[var(--bg-card)] transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-[var(--bg-card)] flex items-center justify-center text-lg border border-white/10">
                    {userAvatar ? userAvatar : <span className="text-xs font-bold text-[var(--accent)]">{userName.charAt(0).toUpperCase()}</span>}
                  </div>
                  <span className="hidden sm:inline text-sm text-[var(--text-primary)]">{userName}</span>
                </button>

                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                    <div
                      className="absolute right-0 mt-2 w-56 bg-[var(--bg-card)] rounded-xl shadow-xl border border-white/10 py-2 z-50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2">
                        <span className="text-2xl">{userAvatar ?? '🎬'}</span>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{userName}</p>
                      </div>
                      {pushStatus === 'unsupported' ? (
                        <div className="px-4 py-2 text-sm text-[var(--text-muted)] flex items-center gap-2">
                          <span className="text-lg">🔕</span>
                          Notifications not supported
                        </div>
                      ) : pushStatus === 'granted' ? (
                        <div className="px-4 py-2 text-sm text-green-300 flex items-center gap-2">
                          <span className="text-lg">🔔</span>
                          Notifications enabled
                        </div>
                      ) : pushStatus === 'denied' ? (
                        <div className="px-4 py-2 text-sm text-[var(--text-muted)] flex items-center gap-2">
                          <span className="text-lg">🚫</span>
                          Notifications blocked
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handleEnablePush}
                          disabled={pushLoading}
                          className="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <span className="text-lg">🔔</span>
                          {pushLoading ? 'Enabling notifications...' : 'Enable notifications'}
                        </button>
                      )}
                      {pushError && (
                        <div className="px-4 pb-2 text-xs text-red-400">
                          {pushError}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const profileUrl = `${window.location.origin}/profile/${user.id}`;
                          const message = `Check out my movie recommendations on BiB (Binge it bro)! ${profileUrl}`;
                          const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
                          window.open(whatsappUrl, '_blank');
                          setShowUserMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <svg className="w-4 h-4 text-[#25D366]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                        </svg>
                        Share on WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          window.location.href = `/profile/${user.id}`;
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        View My Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // Synchronous: clear cookies/storage, then reload
                          signOut().then(() => {
                            window.location.href = '/';
                          });
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              isConfigured && (
                <button
                  onClick={onLoginClick}
                  className="px-4 py-2 text-sm bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-full hover:bg-[var(--accent-hover)] transition-colors"
                >
                  Sign In
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
