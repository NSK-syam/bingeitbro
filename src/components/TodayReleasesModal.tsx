'use client';

import { useState, useEffect } from 'react';
import { getNewReleasesOnStreaming, getImageUrl, getGenreNames, NewRelease, isTMDBConfigured } from '@/lib/tmdb';
import Link from 'next/link';
import { WatchlistPlusButton } from './WatchlistPlusButton';
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/safe-storage';

const STORAGE_KEY = 'bingeitbro-last-releases-shown';

interface TodayReleasesModalProps {
  manualOpen?: boolean;
  onClose?: () => void;
}

export function TodayReleasesModal({ manualOpen, onClose }: TodayReleasesModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [releases, setReleases] = useState<NewRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);

  // Handle manual open from parent
  useEffect(() => {
    if (manualOpen) {
      setIsOpen(true);
    }
  }, [manualOpen]);

  // Fetch data when modal opens (either auto or manual)
  useEffect(() => {
    if (!isOpen || hasFetched) return;
    if (!isTMDBConfigured()) return;

    const fetchReleases = async () => {
      setLoading(true);
      try {
        const data = await getNewReleasesOnStreaming();
        setReleases(data);
        setHasFetched(true);
      } catch (error) {
        console.error('Error fetching releases:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReleases();
  }, [isOpen, hasFetched]);

  // Auto-open once per day
  useEffect(() => {
    const lastShown = safeLocalStorageGet(STORAGE_KEY);
    const today = new Date().toDateString();

    if (lastShown === today) return;
    if (!isTMDBConfigured()) return;

    // Small delay to let the page load first
    const timer = setTimeout(() => {
      setIsOpen(true);
      safeLocalStorageSet(STORAGE_KEY, today);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    if (onClose) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal - Half screen from bottom */}
      <div className="relative w-full max-w-4xl bg-[var(--bg-primary)] rounded-t-3xl shadow-2xl max-h-[60vh] flex flex-col animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 bg-[var(--bg-primary)] px-6 pt-6 pb-4 border-b border-white/10 rounded-t-3xl">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">
              New on Streaming
            </h2>
            <button
              onClick={handleClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <svg className="w-6 h-6 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content - horizontal scroll */}
        <div className="flex-1 min-h-0 px-6 py-4 flex flex-col">
          {loading ? (
            <div className="flex items-center justify-center h-48 flex-shrink-0">
              <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : releases.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)] flex-shrink-0">
              <div className="text-4xl mb-2"></div>
              <p>No new releases for today or the last 3 days</p>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto overflow-y-hidden pb-2 -mx-1 px-1 scrollbar-thin">
              {releases.map((movie) => (
                <Link
                  key={movie.id}
                  href={`/movie/${movie.id}`}
                  prefetch={false}
                  onClick={handleClose}
                  className="group flex-shrink-0 w-[140px] sm:w-[160px]"
                >
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-[var(--bg-secondary)]">
                    {movie.poster_path ? (
                      <img
                        src={getImageUrl(movie.poster_path)}
                        alt={movie.title}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">
                        
                      </div>
                    )}

                    {/* Quick watchlist + */}
                    <div className="absolute top-2 left-2 z-10">
                      <WatchlistPlusButton
                        movieId={`tmdb-${movie.id}`}
                        title={movie.title}
                        poster={movie.poster_path ? getImageUrl(movie.poster_path) : ''}
                      />
                    </div>

                    {/* Rating badge */}
                    {movie.vote_average > 0 && (
                      <div className="absolute top-2 right-2 bg-black/70 px-2 py-1 rounded-full text-xs font-medium text-yellow-400">
                         {movie.vote_average.toFixed(1)}
                      </div>
                    )}

                    {/* OTT Providers - one icon per platform (dedupe by provider_id) */}
                    {movie.providers && movie.providers.length > 0 && (() => {
                      const seen = new Set<number>();
                      const unique = movie.providers.filter((p) => {
                        if (seen.has(p.provider_id)) return false;
                        seen.add(p.provider_id);
                        return true;
                      });
                      return (
                        <div className="absolute bottom-2 left-2 right-2 flex gap-1 flex-wrap">
                          {unique.slice(0, 4).map((provider) => (
                            <img
                              key={provider.provider_id}
                              src={getImageUrl(provider.logo_path)}
                              alt={provider.provider_name}
                              title={provider.provider_name}
                              className="w-6 h-6 rounded-md"
                            />
                          ))}
                          {unique.length > 4 && (
                            <span className="w-6 h-6 rounded-md bg-black/70 flex items-center justify-center text-xs text-white">
                              +{unique.length - 4}
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <div className="text-xs text-white/80">
                        {getGenreNames(movie.genre_ids).slice(0, 2).join(' • ')}
                      </div>
                    </div>
                  </div>

                  <h3 className="mt-2 text-sm font-medium text-[var(--text-primary)] line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                    {movie.title}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    {new Date(movie.release_date).getFullYear()}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[var(--bg-primary)] px-6 py-4 border-t border-white/10">
          <p className="text-xs text-[var(--text-muted)] text-center">
            Data provided by TMDB. OTT availability: USA & India.
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
