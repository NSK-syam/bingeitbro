'use client';

import { useWatchlist } from '@/hooks';

interface WatchlistButtonProps {
  movieId: string;
  title?: string;
  poster?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function WatchlistButton({ movieId, title, poster, size = 'md', showLabel = false }: WatchlistButtonProps) {
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const inWatchlist = isInWatchlist(movieId);

  const sizeClasses = {
    sm: 'w-7 h-7 text-sm',
    md: 'w-9 h-9 text-base',
    lg: 'w-11 h-11 text-lg',
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWatchlist(movieId, title, poster);
  };

  return (
    <button
      onClick={handleClick}
      className={`
        ${sizeClasses[size]}
        ${inWatchlist
          ? 'bg-[var(--accent)] text-[var(--bg-primary)] shadow-lg shadow-[var(--accent)]/30'
          : 'bg-[var(--bg-primary)]/80 text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]'
        }
        backdrop-blur-sm rounded-full flex items-center justify-center gap-1.5 transition-all duration-200
        ${showLabel ? 'px-3 w-auto' : ''}
      `}
      title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
    >
      {inWatchlist ? (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      )}
      {showLabel && (
        <span className="text-sm font-medium">
          {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
        </span>
      )}
    </button>
  );
}
