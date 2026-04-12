'use client';

import { useWatched } from '@/hooks';

interface WatchedButtonProps {
  movieId: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function WatchedButton({ movieId, size = 'md', showLabel = false }: WatchedButtonProps) {
  const { isWatched, toggleWatched } = useWatched();
  const watched = isWatched(movieId);

  const sizeClasses = {
    sm: 'w-7 h-7 text-sm',
    md: 'w-9 h-9 text-base',
    lg: 'w-11 h-11 text-lg',
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWatched(movieId);
  };

  const baseStateClass = watched
    ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
    : 'bg-[var(--bg-primary)]/80 text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]';

  const labeledStateClass = watched
    ? 'bg-green-500 text-white border border-green-300/50 shadow-lg shadow-green-500/35'
    : 'bg-emerald-500/20 text-emerald-100 border border-emerald-300/40 hover:bg-emerald-500/30 hover:text-white';

  return (
    <button
      onClick={handleClick}
      className={`
        ${sizeClasses[size]}
        ${showLabel ? labeledStateClass : baseStateClass}
        backdrop-blur-sm rounded-full flex items-center justify-center gap-1.5 transition-all duration-200
        ${showLabel ? 'px-3 w-auto' : ''}
      `}
      title={watched ? 'Mark as unwatched' : 'Mark as watched'}
    >
      {watched ? (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      )}
      {showLabel && (
        <span className="text-sm font-medium">
          {watched ? 'Watched' : 'Mark watched'}
        </span>
      )}
    </button>
  );
}
