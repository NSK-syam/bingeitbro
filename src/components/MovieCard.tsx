'use client';
// Build: 2026-02-05 - Force cache refresh for Send to Friend deployment

import { Recommendation } from '@/types';
import Link from 'next/link';
import { useState } from 'react';
import { WatchedButton } from './WatchedButton';
import { ReactionBadges } from './ReactionBar';
import { useWatched, useNudges } from '@/hooks';
import { useAuth } from './AuthProvider';
import { SendToFriendModal } from './SendToFriendModal';
import { WatchlistPlusButton } from './WatchlistPlusButton';
import { normalizeWatchProviderKey } from '@/lib/tmdb';

// Relative time helper
function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return `${diffMonths}mo ago`;
}

interface MovieCardProps {
  recommendation: Recommendation;
  index?: number;
  country?: 'IN' | 'US';
}

function matchesCountry(availableIn: string | undefined, country: 'IN' | 'US'): boolean {
  const v = (availableIn || '').toLowerCase().trim();
  if (!v) return true;
  if (country === 'IN') return v.includes('india');
  return v.includes('usa') || v.includes('us');
}

export function MovieCard({ recommendation, index = 0, country }: MovieCardProps) {
  const { id, title, year, type, poster, genres, rating, recommendedBy, personalNote, ottLinks, addedOn, certification } = recommendation;
  const [imageError, setImageError] = useState(false);
  const [nudgeSent, setNudgeSent] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const { isWatched } = useWatched();
  const { user } = useAuth();

  const { sendNudge, hasNudged } = useNudges();
  const watched = isWatched(id);
  const alreadyNudged = hasNudged(id) || nudgeSent;

  // Check if this is a friend's recommendation (not the user's own)
  const isFriendRecommendation = user && recommendedBy.id !== user.id;

  // Extract TMDB ID if this is a TMDB movie
  const tmdbId = id.startsWith('tmdb-') ? id.replace('tmdb-', '') : undefined;
  const recommendationId = !tmdbId ? id : undefined;

  const handleNudgeClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (user && isFriendRecommendation && !alreadyNudged) {
      // Send nudge to the recommender about their own recommendation
      const { error } = await sendNudge(recommendedBy.id, {
        recommendationId: tmdbId ? undefined : id,
        tmdbId: tmdbId ?? undefined,
        movieTitle: title,
        moviePoster: poster,
        movieYear: year ?? null,
      });
      if (!error) {
        setNudgeSent(true);
      }
    }
  };

  const handleSendClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowSendModal(true);
  };

  const typeLabels = {
    movie: 'Movie',
    series: 'Series',
    documentary: 'Documentary',
    anime: 'Anime',
  };

  // Generate a color based on the title for placeholder
  const getPlaceholderColor = (str: string) => {
    const colors = ['#e50914', '#00a8e1', '#f59e0b', '#8b5cf6', '#ec4899', '#10b981'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };
  const uniqueOttLinks = (() => {
    const byKey = new Map<string, (typeof ottLinks)[number]>();
    for (const l of ottLinks || []) {
      const key = normalizeWatchProviderKey(l.platform);
      if (!key || byKey.has(key)) continue;
      byKey.set(key, l);
    }
    return Array.from(byKey.values());
  })();
  const visibleOttLinks = country ? uniqueOttLinks.filter((l) => matchesCountry(l.availableIn, country)) : uniqueOttLinks;
  const detailBase = type === 'series' ? '/show' : '/movie';
  const displayOttLinks = visibleOttLinks.length > 0
    ? visibleOttLinks
    : [{ platform: 'OTT', url: `${detailBase}/${id}`, logoPath: '' }];
  const posterOttLinks = displayOttLinks.slice(0, 3);
  const getOttLogoUrl = (logoPath?: string) => (logoPath ? `https://image.tmdb.org/t/p/w92${logoPath}` : '');
  const openOttLink = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.href = `${detailBase}/${id}`;
  };

  return (
    <Link
      href={`${detailBase}/${id}`}
      prefetch={false}
      className={`group block bg-[var(--bg-card)] rounded-xl overflow-hidden card-hover opacity-0 animate-fade-in-up stagger-${Math.min(index + 1, 6)} ${watched ? 'ring-2 ring-green-500/30' : ''}`}
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] overflow-hidden">
        {!imageError ? (
          <img
            src={poster}
            alt={`${title} poster`}
            className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${watched ? 'opacity-60' : ''}`}
            onError={() => setImageError(true)}
          />
        ) : (
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center p-4 ${watched ? 'opacity-60' : ''}`}
            style={{ backgroundColor: getPlaceholderColor(title) }}
          >
            <span className="text-4xl mb-2"></span>
            <span className="text-white text-sm font-semibold text-center line-clamp-3">{title}</span>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent opacity-80" />

        {/* Quick watchlist + button (top-left) */}
        <div className="absolute top-3 left-3 z-10">
          <WatchlistPlusButton movieId={id} title={title} poster={poster} />
        </div>

        {/* Watched badge overlay */}
        {watched && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Watched
            </div>
          </div>
        )}

        {/* Type badge + 18+ badge */}
        <div className="absolute top-3 left-14 flex flex-col gap-1">
          <span className="px-2 py-1 text-xs font-medium bg-[var(--bg-primary)]/80 backdrop-blur-sm rounded-md text-[var(--text-secondary)]">
            {typeLabels[type]}
          </span>
          {certification && ['NC-17', 'X', '18+'].some(c => certification.toUpperCase() === c) && (
            <span className="px-2 py-0.5 text-[10px] font-bold bg-red-600/90 backdrop-blur-sm rounded-md text-white">
              18+
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="absolute top-3 right-3 flex flex-col gap-1">
          <WatchedButton movieId={id} size="sm" />
        </div>

        {/* Rating badge */}
        {rating && (
          <div className="absolute top-12 right-3">
            <span className="flex items-center gap-1 px-2 py-1 text-xs font-bold bg-[var(--accent)]/90 backdrop-blur-sm rounded-md text-[var(--bg-primary)]">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {rating.toFixed(1)}
            </span>
          </div>
        )}

        <div className="absolute bottom-14 right-3 flex items-center -space-x-2">
          {posterOttLinks.map((link) => {
            const logoUrl = getOttLogoUrl(link.logoPath);
            return (
              <button
                key={link.platform}
                type="button"
                title={link.platform}
                onClick={openOttLink}
                className="w-7 h-7 rounded-full bg-[var(--bg-primary)]/80 border border-white/10 flex items-center justify-center overflow-hidden"
              >
                {logoUrl ? (
                  <img src={logoUrl} alt={link.platform} className="w-5 h-5 object-contain" />
                ) : (
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M4 4.5a1 1 0 0 1 1.6-.8l9 6.5a1 1 0 0 1 0 1.6l-9 6.5A1 1 0 0 1 4 17.5v-13z" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {/* Recommender badge - bottom left */}
        <div className="absolute bottom-3 left-3 right-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{recommendedBy?.avatar ?? ''}</span>
              <div className="flex flex-col">
                <span className="text-xs text-[var(--text-secondary)]">
                  {recommendedBy?.name ?? 'Anonymous'}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {addedOn ? getRelativeTime(addedOn) : ''}
                </span>
              </div>
            </div>
            <ReactionBadges movieId={id} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title and year */}
        <h3 className="font-semibold text-[var(--text-primary)] line-clamp-1 group-hover:text-[var(--accent)] transition-colors">
          {title}
        </h3>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {year} • {(Array.isArray(genres) ? genres : []).slice(0, 2).join(', ')}
        </p>

        {/* Personal note preview */}
        <p className="text-sm text-[var(--text-secondary)] mt-3 line-clamp-2 italic">
          &ldquo;{personalNote ?? ''}&rdquo;
        </p>

        {/* OTT platforms */}
        <div className="flex items-center gap-2 mt-4">
          <span className="text-xs text-[var(--text-muted)]">Watch on:</span>
          <div className="flex gap-1">
            {displayOttLinks.slice(0, 3).map((link) => {
              const logoUrl = getOttLogoUrl(link.logoPath);
              return (
                <button
                  key={link.platform}
                  type="button"
                  title={link.platform}
                  onClick={openOttLink}
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
            {displayOttLinks.length > 3 && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[var(--text-muted)] text-white">
                +{displayOttLinks.length - 3}
              </span>
            )}
          </div>
        </div>

        {/* Nudge & Send to Friend */}
        {user && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
            <div className="flex items-center gap-2 ml-auto">
              {/* Send to Friend button */}
              <button
                onClick={handleSendClick}
                className="text-xs px-2 py-1 rounded-full flex items-center gap-1 transition-all bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                title="Send to friend"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Send
              </button>
              {/* Nudge button - only for friend's recommendations */}
              {!watched && isFriendRecommendation && (
                <button
                  onClick={handleNudgeClick}
                  disabled={alreadyNudged}
                  className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 transition-all ${alreadyNudged
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-pink-500/20 text-pink-400 hover:bg-pink-500/30'
                    }`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {alreadyNudged ? 'Nudged!' : 'Nudge'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Send to Friend Modal */}
      <SendToFriendModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        movieId={id}
        movieTitle={title}
        moviePoster={poster}
        movieYear={year}
        tmdbId={tmdbId}
        recommendationId={recommendationId}
      />
    </Link>
  );
}
