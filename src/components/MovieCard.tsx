'use client';

import { Recommendation } from '@/types';
import Link from 'next/link';
import { useState } from 'react';
import { WatchedButton } from './WatchedButton';
import { ReactionBadges } from './ReactionBar';
import { useWatched } from '@/hooks';

interface MovieCardProps {
  recommendation: Recommendation;
  index?: number;
}

export function MovieCard({ recommendation, index = 0 }: MovieCardProps) {
  const { id, title, year, type, poster, genres, rating, recommendedBy, personalNote, ottLinks } = recommendation;
  const [imageError, setImageError] = useState(false);
  const { isWatched } = useWatched();
  const watched = isWatched(id);

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

  return (
    <Link
      href={`/movie/${id}`}
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
            <span className="text-4xl mb-2">🎬</span>
            <span className="text-white text-sm font-semibold text-center line-clamp-3">{title}</span>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent opacity-80" />

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

        {/* Type badge */}
        <div className="absolute top-3 left-3">
          <span className="px-2 py-1 text-xs font-medium bg-[var(--bg-primary)]/80 backdrop-blur-sm rounded-md text-[var(--text-secondary)]">
            {typeLabels[type]}
          </span>
        </div>

        {/* Watched toggle button */}
        <div className="absolute top-3 right-3">
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

        {/* Recommender badge - bottom left */}
        <div className="absolute bottom-3 left-3 right-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{recommendedBy.avatar}</span>
              <span className="text-xs text-[var(--text-secondary)]">
                {recommendedBy.name}&apos;s pick
              </span>
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
          {year} • {genres.slice(0, 2).join(', ')}
        </p>

        {/* Personal note preview */}
        <p className="text-sm text-[var(--text-secondary)] mt-3 line-clamp-2 italic">
          &ldquo;{personalNote}&rdquo;
        </p>

        {/* OTT platforms */}
        <div className="flex items-center gap-2 mt-4">
          <span className="text-xs text-[var(--text-muted)]">Watch on:</span>
          <div className="flex gap-1">
            {ottLinks.slice(0, 3).map((link) => (
              <span
                key={link.platform}
                className={`platform-${link.platform.toLowerCase().replace(' ', '-').replace('+', '')} px-2 py-0.5 text-[10px] font-medium rounded text-white`}
              >
                {link.platform === 'Prime Video' ? 'Prime' : link.platform.replace(' Video', '')}
              </span>
            ))}
            {ottLinks.length > 3 && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-[var(--text-muted)] text-white">
                +{ottLinks.length - 3}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
