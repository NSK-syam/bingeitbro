'use client';

import { useState, useEffect } from 'react';
import { getNewReleasesOnStreaming, getImageUrl, getGenreNames, NewRelease, isTMDBConfigured } from '@/lib/tmdb';
import Link from 'next/link';

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
    const lastShown = localStorage.getItem(STORAGE_KEY);
    const today = new Date().toDateString();

    if (lastShown === today) return;
    if (!isTMDBConfigured()) return;

    // Small delay to let the page load first
    const timer = setTimeout(() => {
      setIsOpen(true);
      localStorage.setItem(STORAGE_KEY, today);
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : releases.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)]">
              <div className="text-4xl mb-2">🎬</div>
              <p>No releases found for today</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {releases.map((movie) => (
                <Link
                  key={movie.id}
                  href={`/movie/${movie.id}`}
                  onClick={handleClose}
                  className="group"
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
                        🎬
                      </div>
                    )}

                    {/* Rating badge */}
                    {movie.vote_average > 0 && (
                      <div className="absolute top-2 right-2 bg-black/70 px-2 py-1 rounded-full text-xs font-medium text-yellow-400">
                        ⭐ {movie.vote_average.toFixed(1)}
                      </div>
                    )}

                    {/* OTT Providers */}
                    {movie.providers && movie.providers.length > 0 && (
                      <div className="absolute bottom-2 left-2 right-2 flex gap-1 flex-wrap">
                        {movie.providers.slice(0, 3).map((provider) => (
                          <img
                            key={provider.provider_id}
                            src={getImageUrl(provider.logo_path)}
                            alt={provider.provider_name}
                            title={provider.provider_name}
                            className="w-6 h-6 rounded-md"
                          />
                        ))}
                        {movie.providers.length > 3 && (
                          <span className="w-6 h-6 rounded-md bg-black/70 flex items-center justify-center text-xs text-white">
                            +{movie.providers.length - 3}
                          </span>
                        )}
                      </div>
                    )}

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
            Data provided by TMDB. Available on streaming platforms in India.
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
