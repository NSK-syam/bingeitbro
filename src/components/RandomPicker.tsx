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
      tags: ['heartwarming'],
      genres: ['Comedy'],
      cheer: 'A laugh is on the way. Let’s lift the vibe.',
    },
    {
      id: 'chill',
      label: 'Chill & cozy',
      emoji: '🧘',
      tags: ['slice-of-life', 'heartwarming'],
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
      tags: ['mind-bending', 'thought-provoking'],
      genres: ['Sci-Fi', 'Mystery', 'Thriller'],
      cheer: 'Ready for a twist? We’ll find something that makes you think.',
    },
    {
      id: 'inspired',
      label: 'Inspired',
      emoji: '✨',
      tags: ['inspiring', 'epic'],
      genres: ['Drama'],
      cheer: 'Let’s lift your spirit with something inspiring.',
    },
  ];

  const moodConfig = MOOD_OPTIONS.find((m) => m.id === selectedMood) || null;
  const languageOptions = useMemo(() => {
    try {
      const intlAny = Intl as unknown as { supportedValuesOf?: (key: 'language') => string[] };
      if (typeof intlAny.supportedValuesOf === 'function') {
        const codes = intlAny.supportedValuesOf('language');
        const display = new Intl.DisplayNames(['en'], { type: 'language' });
        const names = codes
          .map((code) => display.of(code))
          .filter((name): name is string => Boolean(name))
          .map((name) => name.trim())
          .filter((name) => name.length > 0);
        const unique = Array.from(new Set(names));
        unique.sort((a, b) => a.localeCompare(b));
        return ['Any', ...unique];
      }
    } catch {
      // fall back to a curated list below
    }

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
  const moodLanguageMatches = useMemo(() => {
    return recommendations.filter((rec) => {
      const recMoods = (rec.mood ?? []).map((m) => m.toLowerCase());
      const recGenres = (rec.genres ?? []).map((g) => g.toLowerCase());
      const moodMatch = !moodConfig
        ? true
        : moodConfig.tags.some((tag) => recMoods.includes(tag)) ||
          moodConfig.genres.some((genre) => recGenres.includes(genre.toLowerCase()));
      const languageMatch =
        !selectedLanguage || selectedLanguage === 'Any'
          ? true
          : rec.language?.toLowerCase() === selectedLanguage.toLowerCase();
      return moodMatch && languageMatch;
    });
  }, [recommendations, moodConfig, selectedLanguage]);

  const moodOnlyMatches = useMemo(() => {
    return recommendations.filter((rec) => {
      if (!moodConfig) return true;
      const recMoods = (rec.mood ?? []).map((m) => m.toLowerCase());
      const recGenres = (rec.genres ?? []).map((g) => g.toLowerCase());
      return (
        moodConfig.tags.some((tag) => recMoods.includes(tag)) ||
        moodConfig.genres.some((genre) => recGenres.includes(genre.toLowerCase()))
      );
    });
  }, [recommendations, moodConfig]);

  const languageOnlyMatches = useMemo(() => {
    return recommendations.filter((rec) => {
      if (!selectedLanguage || selectedLanguage === 'Any') return true;
      return rec.language?.toLowerCase() === selectedLanguage.toLowerCase();
    });
  }, [recommendations, selectedLanguage]);

  const basePool = useMemo(() => {
    if (!isReady) return [];
    if (moodLanguageMatches.length > 0) return moodLanguageMatches;
    if (moodOnlyMatches.length > 0) return moodOnlyMatches;
    if (languageOnlyMatches.length > 0) return languageOnlyMatches;
    return recommendations;
  }, [isReady, moodLanguageMatches, moodOnlyMatches, languageOnlyMatches, recommendations]);

  const unwatchedMovies = useMemo(
    () => basePool.filter((r) => !isWatched(r.id)),
    [basePool, isWatched]
  );
  const scoredPool = useMemo(() => {
    if (!isReady) return [];
    return unwatchedMovies
      .map((rec) => {
        let score = 0;
        if (moodConfig) {
          const recMoods = (rec.mood ?? []).map((m) => m.toLowerCase());
          const recGenres = (rec.genres ?? []).map((g) => g.toLowerCase());
          const moodHits = moodConfig.tags.filter((tag) => recMoods.includes(tag)).length;
          const genreHits = moodConfig.genres.filter((g) => recGenres.includes(g.toLowerCase())).length;
          score += moodHits * 4 + genreHits * 2;
        }
        if (selectedLanguage && selectedLanguage !== 'Any') {
          score += rec.language?.toLowerCase() === selectedLanguage.toLowerCase() ? 4 : 0;
        }
        if (typeof rec.rating === 'number') {
          score += Math.min(2, rec.rating / 5);
        }
        if (rec.personalNote) score += 0.5;
        return { rec, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [isReady, moodConfig, selectedLanguage, unwatchedMovies]);

  const availableMovies = useMemo(() => {
    if (!isReady) return [];
    if (scoredPool.length === 0) return [];
    const top = scoredPool.slice(0, Math.min(8, scoredPool.length)).map((item) => item.rec);
    return top.length > 0 ? top : [];
  }, [isReady, scoredPool]);
  const showFallbackNote = isReady && moodLanguageMatches.length === 0;
  const cheerMessage = isReady
    ? `${moodConfig?.cheer ?? 'We’ll find the right vibe for you.'} ${
        selectedLanguage === 'Any' ? 'Any language works tonight.' : `Let’s keep it ${selectedLanguage}.`
      }`
    : '';

  const pickBest = () => {
    if (availableMovies.length === 0) return;
    const best = availableMovies[0];
    setIsSpinning(true);
    setSelectedMovie(best);
    window.setTimeout(() => setIsSpinning(false), 350);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setSelectedMovie(null);
    setIsSpinning(false);
    setSelectedMood('');
    setSelectedLanguage('');
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
        <span>What to Watch</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal Content */}
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto bg-[var(--bg-card)] rounded-2xl p-6 shadow-2xl border border-white/10 animate-fade-in-up">
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
                🎯 What to Watch
              </h3>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                Tell us your mood and language — we’ll handle the rest.
              </p>

              <div className="space-y-5 text-left mb-6">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Tell us your mood</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {MOOD_OPTIONS.map((mood) => (
                      <button
                        key={mood.id}
                        type="button"
                        onClick={() => setSelectedMood(mood.id)}
                        className={`px-3 py-2 rounded-full text-xs sm:text-sm transition-all border ${
                          selectedMood === mood.id
                            ? 'bg-[var(--accent)] text-[var(--bg-primary)] border-[var(--accent)]'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-white/10 hover:bg-[var(--bg-card)]'
                        }`}
                      >
                        <span className="mr-1">{mood.emoji}</span>
                        {mood.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Pick a language</p>
                  <div className="flex flex-wrap gap-2 mt-2 max-h-32 overflow-y-auto pr-1">
                    {languageOptions.map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setSelectedLanguage(lang)}
                        className={`px-3 py-2 rounded-full text-xs sm:text-sm transition-all border ${
                          selectedLanguage === lang
                            ? 'bg-[var(--accent)] text-[var(--bg-primary)] border-[var(--accent)]'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-white/10 hover:bg-[var(--bg-card)]'
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>

                {isReady && (
                  <div className="rounded-xl bg-[var(--bg-secondary)]/70 border border-white/10 p-3 text-sm text-[var(--text-secondary)]">
                    {cheerMessage}
                  </div>
                )}
                {showFallbackNote && (
                  <p className="text-xs text-[var(--text-muted)]">
                    No exact matches for that combo. We’ll still pick something good.
                  </p>
                )}
              </div>


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
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-secondary)]">
                    <div className="text-center">
                      <span className="text-6xl block mb-4">🎲</span>
                      <p className="text-[var(--text-muted)]">
                        Pick your mood and language to get started
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                {!isReady ? (
                  <div className="flex-1 py-4 text-center">
                    <p className="text-[var(--text-muted)]">
                      Pick your mood and language to continue.
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
                          : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500'
                      }`}
                    >
                      {isSpinning ? 'Picking...' : selectedMovie ? 'Try Again' : 'Find My Pick'}
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
                      You've watched the matches for this mood. Try another mood or language.
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
