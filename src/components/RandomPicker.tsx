'use client';

import { useState, useEffect } from 'react';
import { Recommendation } from '@/types';
import { useWatched } from '@/hooks';
import Link from 'next/link';

interface RandomPickerProps {
  recommendations: Recommendation[];
}

export function RandomPicker({ recommendations }: RandomPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Recommendation | null>(null);
  const [showUnwatchedOnly, setShowUnwatchedOnly] = useState(true);
  const { isWatched } = useWatched();
  const unwatchedMovies = recommendations.filter((r) => !isWatched(r.id));
  const availableMovies = showUnwatchedOnly ? unwatchedMovies : recommendations;

  const pickRandom = () => {
    if (availableMovies.length === 0) return;

    setIsSpinning(true);
    setSelectedMovie(null);

    // Simulate spinning through movies
    let count = 0;
    const maxSpins = 15;
    const spinInterval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * availableMovies.length);
      setSelectedMovie(availableMovies[randomIndex]);
      count++;

      if (count >= maxSpins) {
        clearInterval(spinInterval);
        // Final selection
        const finalIndex = Math.floor(Math.random() * availableMovies.length);
        setSelectedMovie(availableMovies[finalIndex]);
        setIsSpinning(false);
      }
    }, 100);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setSelectedMovie(null);
    setIsSpinning(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedMovie(null);
    setIsSpinning(false);
  };

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const getPlaceholderColor = (str: string) => {
    const colors = ['#e50914', '#00a8e1', '#f59e0b', '#8b5cf6', '#ec4899', '#10b981'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-full hover:from-purple-500 hover:to-pink-500 transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:scale-105"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>I&apos;m Feeling Lucky</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal Content */}
          <div className="relative w-full max-w-md bg-[var(--bg-card)] rounded-2xl p-6 shadow-2xl border border-white/10 animate-fade-in-up">
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center">
              <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                🎰 Random Pick
              </h3>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                Let fate decide what you watch tonight
              </p>

              {/* Toggle for unwatched only */}
              <label className="flex items-center justify-center gap-2 mb-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUnwatchedOnly}
                  onChange={(e) => setShowUnwatchedOnly(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-[var(--bg-secondary)] peer-checked:bg-[var(--accent)] rounded-full relative transition-colors">
                  <div className="absolute w-4 h-4 bg-white rounded-full top-1 left-1 peer-checked:left-5 transition-all" />
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  Unwatched only ({unwatchedMovies.length} available)
                </span>
              </label>

              {/* Selected Movie Display */}
              <div className={`relative h-64 mb-6 rounded-xl overflow-hidden ${isSpinning ? 'animate-pulse' : ''}`}>
                {selectedMovie ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-primary)]">
                    <div
                      className="w-24 h-36 rounded-lg mb-4 flex items-center justify-center shadow-lg"
                      style={{ backgroundColor: getPlaceholderColor(selectedMovie.title) }}
                    >
                      <span className="text-4xl">🎬</span>
                    </div>
                    <h4 className={`text-xl font-bold text-[var(--text-primary)] text-center transition-all ${isSpinning ? 'blur-sm' : ''}`}>
                      {selectedMovie.title}
                    </h4>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                      {selectedMovie.year} • {selectedMovie.language}
                    </p>
                    <p className="text-xs text-[var(--accent)] mt-2">
                      {selectedMovie.recommendedBy.avatar} {selectedMovie.recommendedBy.name}&apos;s pick
                    </p>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-secondary)]">
                    <div className="text-center">
                      <span className="text-6xl block mb-4">🎲</span>
                      <p className="text-[var(--text-muted)]">Press the button to pick a movie</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                {availableMovies.length > 0 ? (
                  <>
                    <button
                      onClick={pickRandom}
                      disabled={isSpinning}
                      className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                        isSpinning
                          ? 'bg-[var(--bg-secondary)] text-[var(--text-muted)] cursor-not-allowed'
                          : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500'
                      }`}
                    >
                      {isSpinning ? 'Picking...' : selectedMovie ? 'Try Again' : 'Pick for Me!'}
                    </button>
                    {selectedMovie && !isSpinning && (
                      <Link
                        href={`/movie/${selectedMovie.id}`}
                        prefetch={false}
                        onClick={handleClose}
                        className="flex-1 py-3 px-4 rounded-xl font-medium bg-[var(--accent)] text-[var(--bg-primary)] hover:bg-[var(--accent-hover)] transition-colors text-center"
                      >
                        Let&apos;s Watch This!
                      </Link>
                    )}
                  </>
                ) : (
                  <div className="flex-1 py-4 text-center">
                    <p className="text-[var(--text-muted)]">
                      {showUnwatchedOnly
                        ? "You've watched everything! Toggle off 'Unwatched only' to pick from all movies."
                        : 'No movies available.'
                      }
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
