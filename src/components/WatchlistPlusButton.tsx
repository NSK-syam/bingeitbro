'use client';

import { useWatchlist } from '@/hooks';

type WatchlistPlusButtonProps = {
  movieId: string;
  title?: string;
  poster?: string;
  size?: 'sm' | 'md';
  className?: string;
};

/**
 * Small "+" overlay button for posters. Designed to sit inside a <Link>.
 * It stops navigation and toggles local watchlist state.
 */
export function WatchlistPlusButton({
  movieId,
  title,
  poster,
  size = 'sm',
  className = '',
}: WatchlistPlusButtonProps) {
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const inWatchlist = isInWatchlist(movieId);

  const sizeClasses = size === 'md' ? 'w-9 h-9' : 'w-8 h-8';
  const iconClasses = size === 'md' ? 'w-5 h-5' : 'w-4.5 h-4.5';

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWatchlist(movieId, title, poster);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
      title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
      className={[
        'inline-flex items-center justify-center rounded-lg border border-white/15 backdrop-blur-sm transition-all duration-200',
        sizeClasses,
        inWatchlist
          ? 'bg-[var(--accent)] text-[var(--bg-primary)] shadow-lg shadow-[var(--accent)]/25'
          : 'bg-black/45 text-white hover:bg-black/60',
        className,
      ].join(' ')}
    >
      {inWatchlist ? (
        <svg className={iconClasses} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className={iconClasses} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14m7-7H5" />
        </svg>
      )}
    </button>
  );
}

