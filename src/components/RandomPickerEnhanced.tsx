'use client';

import { useState, useEffect, useMemo } from 'react';
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
  const [selectedMood, setSelectedMood] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [showConfetti, setShowConfetti] = useState(false);
  const { isWatched } = useWatched();

  const MOOD_OPTIONS = [
    {
      id: 'sad',
      label: 'Feeling low',
      emoji: '💛',
      tags: ['heartwarming', 'inspiring', 'emotional', 'slice-of-life'],
      genres: ['Comedy', 'Drama', 'Romance'],
      cheer: 'Here is a feel‑good pick to make your mood brighter.',
    },
    {
      id: 'laugh',
      label: 'Need laughs',
      emoji: '😂',
      tags: ['heartwarming', 'hilarious', 'funny'],
      genres: ['Comedy'],
      cheer: 'A laugh is on the way. Let's lift the vibe.',
    },
    {
      id: 'chill',
      label: 'Chill & cozy',
      emoji: '🧘',
      tags: ['slice-of-life', 'heartwarming', 'cozy'],
      genres: ['Drama', 'Romance'],
      cheer: 'Soft, cozy vibes coming up.',
    },
    {
      id: 'thrill',
      label: 'Adrenaline',
      emoji: '🔥',
      tags: ['thrilling', 'intense', 'epic', 'raw', 'rebellious'],
      genres: ['Action', 'Thriller', 'Crime'],
      cheer: 'Strap in — something intense and punchy is coming.',
    },
    {
      id: 'mind',
      label: 'Mind‑bending',
      emoji: '🧠',
      tags: ['mind-bending', 'thought-provoking', 'mysterious'],
      genres: ['Sci-Fi', 'Mystery', 'Thriller'],
      cheer: 'Ready for a twist? We'll find something that makes you think.',
    },
    {
      id: 'inspired',
      label: 'Inspired',
      emoji: '✨',
      tags: ['inspiring', 'epic', 'uplifting'],
      genres: ['Drama', 'Biography'],
      cheer: 'Let's lift your spirit with something inspiring.',
    },
  ];

  const moodConfig = MOOD_OPTIONS.find((m) => m.id === selectedMood) || null;

  // Language options with better fallback
  const languageOptions = useMemo(() => {
    try {
      const intlAny = Intl as unknown as { supportedValuesOf?: (key: 'language') => string[] };
      if (typeof intlAny.supportedValuesOf === 'function') {
        const codes = intlAny.supportedValuesOf('language');
        const display = new Intl.DisplayNames(['en'], { type: 'language' });
        const names = codes
          .map((code) => {
            try {
              return display.of(code);
            } catch {
              return null;
            }
          })
          .filter((name): name is string => Boolean(name))
          .map((name) => name.trim())
          .filter((name) => name.length > 0);
        const unique = Array.from(new Set(names));
        unique.sort((a, b) => a.localeCompare(b));
        return ['Any', ...unique];
      }
    } catch (error) {
      console.warn('Intl.supportedValuesOf not available, using fallback list', error);
    }

    // Curated fallback list
    return [
      'Any',
      'English',
      'Telugu',
      'Hindi',
      'Tamil',
      'Malayalam',
      'Kannada',
      'Marathi',
      'Bengali',
      'Punjabi',
      'Gujarati',
      'Urdu',
      'Spanish',
      'French',
      'German',
      'Italian',
      'Portuguese',
      'Russian',
      'Japanese',
      'Korean',
      'Chinese',
      'Arabic',
      'Turkish',
      'Thai',
      'Indonesian',
      'Vietnamese',
      'Filipino',
      'Persian',
      'Greek',
      'Hebrew',
      'Swedish',
      'Norwegian',
      'Danish',
      'Finnish',
      'Dutch',
      'Polish',
      'Czech',
      'Hungarian',
      'Romanian',
      'Ukrainian',
    ];
  }, []);

  const isReady = Boolean(selectedMood) && Boolean(selectedLanguage);

  // Mood + Language matches (highest priority)
  const moodLanguageMatches = useMemo(() => {
    if (!isReady || !moodConfig) return [];

    return recommendations.filter((rec) => {
      const recMoods = (rec.mood ?? []).map((m) => m.toLowerCase());
      const recGenres = (rec.genres ?? []).map((g) => g.toLowerCase());

      const moodMatch =
        moodConfig.tags.some((tag) => recMoods.includes(tag.toLowerCase())) ||
        moodConfig.genres.some((genre) => recGenres.includes(genre.toLowerCase()));

      const languageMatch =
        selectedLanguage === 'Any' ||
        rec.language?.toLowerCase() === selectedLanguage.toLowerCase();

      return moodMatch && languageMatch;
    });
  }, [recommendations, moodConfig, selectedLanguage, isReady]);

  // Mood-only matches (fallback 1)
  const moodOnlyMatches = useMemo(() => {
    if (!moodConfig) return [];

    return recommendations.filter((rec) => {
      const recMoods = (rec.mood ?? []).map((m) => m.toLowerCase());
      const recGenres = (rec.genres ?? []).map((g) => g.toLowerCase());

      return (
        moodConfig.tags.some((tag) => recMoods.includes(tag.toLowerCase())) ||
        moodConfig.genres.some((genre) => recGenres.includes(genre.toLowerCase()))
      );
    });
  }, [recommendations, moodConfig]);

  // Language-only matches (fallback 2)
  const languageOnlyMatches = useMemo(() => {
    if (!selectedLanguage || selectedLanguage === 'Any') return [];

    return recommendations.filter((rec) =>
      rec.language?.toLowerCase() === selectedLanguage.toLowerCase()
    );
  }, [recommendations, selectedLanguage]);

  // Base pool selection with intelligent fallback
  const basePool = useMemo(() => {
    if (!isReady) return [];

    // Priority order: mood+language > mood-only > language-only > all
    if (moodLanguageMatches.length > 0) return moodLanguageMatches;
    if (moodOnlyMatches.length > 0) return moodOnlyMatches;
    if (languageOnlyMatches.length > 0) return languageOnlyMatches;

    return recommendations; // Ultimate fallback
  }, [isReady, moodLanguageMatches, moodOnlyMatches, languageOnlyMatches, recommendations]);

  // Filter out watched movies
  const unwatchedMovies = useMemo(
    () => basePool.filter((r) => !isWatched(r.id)),
    [basePool, isWatched]
  );

  // Score and sort pool
  const scoredPool = useMemo(() => {
    if (!isReady) return [];

    return unwatchedMovies
      .map((rec) => {
        let score = 0;

        // Mood/genre scoring
        if (moodConfig) {
          const recMoods = (rec.mood ?? []).map((m) => m.toLowerCase());
          const recGenres = (rec.genres ?? []).map((g) => g.toLowerCase());

          const moodHits = moodConfig.tags.filter((tag) =>
            recMoods.includes(tag.toLowerCase())
          ).length;
          const genreHits = moodConfig.genres.filter((g) =>
            recGenres.includes(g.toLowerCase())
          ).length;

          score += moodHits * 4 + genreHits * 2;
        }

        // Language scoring
        if (selectedLanguage && selectedLanguage !== 'Any') {
          score += rec.language?.toLowerCase() === selectedLanguage.toLowerCase() ? 4 : 0;
        }

        // Rating scoring
        if (typeof rec.rating === 'number') {
          score += Math.min(2, rec.rating / 5);
        }

        // Personal note bonus
        if (rec.personalNote) score += 0.5;

        return { rec, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [isReady, moodConfig, selectedLanguage, unwatchedMovies]);

  // Top 8 available movies
  const availableMovies = useMemo(() => {
    if (!isReady || scoredPool.length === 0) return [];

    const top = scoredPool.slice(0, Math.min(8, scoredPool.length)).map((item) => item.rec);
    return top;
  }, [isReady, scoredPool]);

  const showFallbackNote = isReady && moodLanguageMatches.length === 0;

  const cheerMessage = isReady
    ? `${moodConfig?.cheer ?? 'We'll find the right vibe for you.'} ${
        selectedLanguage === 'Any' ? 'Any language works tonight.' : `Let's keep it ${selectedLanguage}.`
      }`
    : '';

  // Pick the best movie with animation
  const pickBest = () => {
    if (availableMovies.length === 0) return;

    const best = availableMovies[0];
    setIsSpinning(true);
    setSelectedMovie(best);

    // Stop spinning after animation
    setTimeout(() => {
      setIsSpinning(false);
      setShowConfetti(true);

      // Hide confetti after 2 seconds
      setTimeout(() => setShowConfetti(false), 2000);
    }, 350);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setSelectedMovie(null);
    setIsSpinning(false);
    setSelectedMood('');
    setSelectedLanguage('');
    setShowConfetti(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedMovie(null);
    setIsSpinning(false);
    setShowConfetti(false);
  };

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Generate consistent color for placeholder
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
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-full hover:from-purple-500 hover:to-pink-500 transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:scale-105 active:scale-95"
        aria-label="Open what to watch picker"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>What to Watch</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="what-to-watch-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal Content */}
          <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-[var(--bg-card)] rounded-2xl p-6 shadow-2xl border border-white/10 animate-fade-in-up">
            {/* Confetti Effect */}
            {showConfetti && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                {[...Array(20)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute animate-confetti"
                    style={{
                      left: `${Math.random() * 100}%`,
                      top: '-10px',
                      animationDelay: `${Math.random() * 0.5}s`,
                      animationDuration: `${1 + Math.random()}s`,
                    }}
                  >
                    {['🎉', '⭐', '🎊', '✨', '🎬'][Math.floor(Math.random() * 5)]}
                  </div>
                ))}
              </div>
            )}

            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors z-10"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center">
              <h3 id="what-to-watch-title" className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                🎯 What to Watch
              </h3>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                Tell us your mood and language — we'll handle the rest.
              </p>

              <div className="space-y-5 text-left mb-6">
                {/* Mood Selection */}
                <div>
                  <label className="text-sm font-medium text-[var(--text-primary)] block mb-2">
                    Tell us your mood
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {MOOD_OPTIONS.map((mood) => (
                      <button
                        key={mood.id}
                        type="button"
                        onClick={() => setSelectedMood(mood.id)}
                        className={`px-3 py-2 rounded-full text-xs sm:text-sm transition-all border ${
                          selectedMood === mood.id
                            ? 'bg-[var(--accent)] text-[var(--bg-primary)] border-[var(--accent)] shadow-lg scale-105'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-white/10 hover:bg-[var(--bg-card)] hover:border-white/20'
                        }`}
                        aria-pressed={selectedMood === mood.id}
                      >
                        <span className="mr-1" aria-hidden="true">{mood.emoji}</span>
                        {mood.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Language Selection */}
                <div>
                  <label className="text-sm font-medium text-[var(--text-primary)] block mb-2">
                    Pick a language
                  </label>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {languageOptions.map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setSelectedLanguage(lang)}
                        className={`px-3 py-2 rounded-full text-xs sm:text-sm transition-all border ${
                          selectedLanguage === lang
                            ? 'bg-[var(--accent)] text-[var(--bg-primary)] border-[var(--accent)] shadow-lg scale-105'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-white/10 hover:bg-[var(--bg-card)] hover:border-white/20'
                        }`}
                        aria-pressed={selectedLanguage === lang}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cheer Message */}
                {isReady && (
                  <div className="rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 p-3 text-sm text-[var(--text-secondary)]">
                    <span className="inline-block mr-1">✨</span>
                    {cheerMessage}
                  </div>
                )}

                {/* Fallback Note */}
                {showFallbackNote && (
                  <p className="text-xs text-[var(--text-muted)] bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2">
                    ⚠️ No exact matches for that combo. We'll still pick something good from a broader selection.
                  </p>
                )}
              </div>

              {/* Selected Movie Display */}
              <div className={`relative h-64 mb-6 rounded-xl overflow-hidden transition-all ${isSpinning ? 'animate-pulse scale-95' : 'scale-100'}`}>
                {selectedMovie ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-primary)]">
                    <div
                      className="w-24 h-36 rounded-lg mb-4 flex items-center justify-center shadow-lg transform transition-transform"
                      style={{
                        backgroundColor: getPlaceholderColor(selectedMovie.title),
                        transform: isSpinning ? 'rotate(5deg)' : 'rotate(0deg)'
                      }}
                    >
                      <span className="text-4xl" aria-hidden="true">🎬</span>
                    </div>
                    <h4 className={`text-xl font-bold text-[var(--text-primary)] text-center transition-all ${isSpinning ? 'blur-sm opacity-50' : 'blur-0 opacity-100'}`}>
                      {selectedMovie.title}
                    </h4>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                      {selectedMovie.year} • {selectedMovie.language}
                    </p>
                    {selectedMovie.genres && selectedMovie.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2 justify-center">
                        {selectedMovie.genres.slice(0, 3).map((genre) => (
                          <span
                            key={genre}
                            className="text-xs px-2 py-1 rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]"
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-secondary)]">
                    <div className="text-center p-4">
                      <span className="text-6xl block mb-4" aria-hidden="true">🎲</span>
                      <p className="text-[var(--text-muted)]">
                        {!isReady
                          ? 'Pick your mood and language to get started'
                          : availableMovies.length === 0
                            ? "You've watched all matches for this mood. Try another mood or language."
                            : `Ready! Click "Find My Pick" below.`}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                {!isReady ? (
                  <div className="flex-1 py-4 text-center">
                    <p className="text-sm text-[var(--text-muted)]">
                      👆 Pick your mood and language to continue
                    </p>
                  </div>
                ) : availableMovies.length > 0 ? (
                  <>
                    <button
                      onClick={pickBest}
                      disabled={isSpinning}
                      className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                        isSpinning
                          ? 'bg-[var(--bg-secondary)] text-[var(--text-muted)] cursor-not-allowed'
                          : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500 active:scale-95 shadow-lg'
                      }`}
                    >
                      {isSpinning ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Picking...
                        </span>
                      ) : selectedMovie ? (
                        '🔄 Try Again'
                      ) : (
                        '🎲 Find My Pick'
                      )}
                    </button>
                    {selectedMovie && !isSpinning && (
                      <Link
                        href={`/movie/${selectedMovie.id}`}
                        prefetch={false}
                        onClick={handleClose}
                        className="flex-1 py-3 px-4 rounded-xl font-medium bg-[var(--accent)] text-[var(--bg-primary)] hover:bg-[var(--accent-hover)] transition-all text-center active:scale-95 shadow-lg"
                      >
                        🎬 Let&apos;s Watch This!
                      </Link>
                    )}
                  </>
                ) : (
                  <div className="flex-1 py-4 text-center">
                    <p className="text-sm text-[var(--text-muted)] mb-2">
                      🎭 You've watched all matches for this mood
                    </p>
                    <button
                      onClick={() => {
                        setSelectedMood('');
                        setSelectedLanguage('');
                      }}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Reset and try again
                    </button>
                  </div>
                )}
              </div>

              {/* Stats Footer */}
              {isReady && availableMovies.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-xs text-[var(--text-muted)]">
                    {availableMovies.length} {availableMovies.length === 1 ? 'match' : 'matches'} found
                    {moodLanguageMatches.length > 0 && ' • Perfect mood + language combo'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes confetti {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(400px) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti linear forwards;
        }
      `}</style>
    </>
  );
}
