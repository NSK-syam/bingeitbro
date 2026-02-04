'use client';

import { useState, useEffect } from 'react';
import { useWatchlist } from '@/hooks';
import Link from 'next/link';

interface WatchlistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface WatchlistMovie {
  id: string;
  title: string;
  poster: string;
  addedAt: string;
}

export function WatchlistModal({ isOpen, onClose }: WatchlistModalProps) {
  const { getWatchlistItems, removeFromWatchlist } = useWatchlist();
  const [movies, setMovies] = useState<WatchlistMovie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      const items = getWatchlistItems();

      // Fetch movie details for items that don't have complete info
      const fetchMissingDetails = async () => {
        const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
        const moviesWithDetails: WatchlistMovie[] = [];

        for (const item of items) {
          if (item.title && item.poster) {
            // Already have details
            moviesWithDetails.push({
              id: item.id,
              title: item.title,
              poster: item.poster,
              addedAt: item.addedAt,
            });
          } else if (item.id.startsWith('tmdb-') && apiKey) {
            // Fetch from TMDB
            try {
              const tmdbId = item.id.replace('tmdb-', '');
              const response = await fetch(
                `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}`
              );
              if (response.ok) {
                const data = await response.json();
                moviesWithDetails.push({
                  id: item.id,
                  title: data.title,
                  poster: data.poster_path
                    ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
                    : '',
                  addedAt: item.addedAt,
                });
              }
            } catch (e) {
              // Skip if fetch fails
            }
          }
        }

        // Sort by addedAt (newest first)
        moviesWithDetails.sort((a, b) =>
          new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
        );

        setMovies(moviesWithDetails);
        setLoading(false);
      };

      fetchMissingDetails();
    }
  }, [isOpen, getWatchlistItems]);

  const handleRemove = (e: React.MouseEvent, movieId: string) => {
    e.preventDefault();
    e.stopPropagation();
    removeFromWatchlist(movieId);
    setMovies(prev => prev.filter(m => m.id !== movieId));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-[85vh] bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-[var(--accent)]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">My Watchlist</h2>
              <p className="text-sm text-[var(--text-muted)]">
                {movies.length} {movies.length === 1 ? 'movie' : 'movies'} saved
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : movies.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {movies.map((movie) => (
                <Link
                  key={movie.id}
                  href={`/movie/${movie.id}`}
                  onClick={onClose}
                  className="group relative"
                >
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-[var(--bg-secondary)]">
                    {movie.poster ? (
                      <img
                        src={movie.poster}
                        alt={movie.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">
                        🎬
                      </div>
                    )}
                    {/* Remove button */}
                    <button
                      onClick={(e) => handleRemove(e, movie.id)}
                      className="absolute top-2 right-2 w-8 h-8 bg-red-500/90 hover:bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove from watchlist"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    {/* Gradient overlay */}
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
                    {/* Title */}
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <h3 className="text-sm font-medium text-white line-clamp-2">
                        {movie.title}
                      </h3>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">📑</div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                Your watchlist is empty
              </h3>
              <p className="text-[var(--text-muted)] text-sm">
                Click the bookmark icon on any movie to save it for later
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
