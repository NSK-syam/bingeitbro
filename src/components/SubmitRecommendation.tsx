'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthProvider';
import { createClient } from '@/lib/supabase';
import {
  searchMovies,
  searchTV,
  getMovieDetails,
  getTVDetails,
  getWatchProviders,
  getTVWatchProviders,
  getImageUrl,
  isTMDBConfigured,
  TMDBMovie,
  TMDBMovieDetails,
  TMDBTV,
  TMDBTVDetails,
  formatRuntime,
  formatEpisodeRuntime,
  getLanguageName,
} from '@/lib/tmdb';

type OTTPlatform = 'Netflix' | 'Prime Video' | 'Hotstar' | 'Aha' | 'YouTube' | 'Zee5' | 'SonyLiv' | 'Jio Cinema' | 'Apple TV+' | 'Other';

const MOOD_OPTIONS = [
  'epic', 'thrilling', 'heartwarming', 'emotional', 'thought-provoking',
  'intense', 'inspiring', 'mind-bending', 'raw', 'slice-of-life',
  'funny', 'scary', 'romantic', 'action-packed', 'nostalgic'
];

// Map TMDB provider IDs to our platform names
const PROVIDER_TO_PLATFORM: Record<number, OTTPlatform> = {
  8: 'Netflix',
  9: 'Prime Video',
  119: 'Prime Video',
  122: 'Hotstar',
  237: 'SonyLiv',
  232: 'Zee5',
  220: 'Jio Cinema',
  350: 'Apple TV+',
  192: 'YouTube',
};

interface SubmitRecommendationProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultType?: 'movie' | 'series';
}

export function SubmitRecommendation({ isOpen, onClose, onSuccess, defaultType = 'movie' }: SubmitRecommendationProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<TMDBMovie | TMDBTV>>([]);
  const [selectedItem, setSelectedItem] = useState<TMDBMovieDetails | TMDBTVDetails | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Form state
  const [personalNote, setPersonalNote] = useState('');
  const [userRating, setUserRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [moods, setMoods] = useState<string[]>([]);
  const [ottLinks, setOttLinks] = useState<{ platform: OTTPlatform; url: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const tmdbConfigured = isTMDBConfigured();

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setSearchQuery('');
      setSearchResults([]);
      setSelectedItem(null);
      setPersonalNote('');
      setUserRating(0);
      setMoods([]);
      setOttLinks([]);
      setError('');
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || !tmdbConfigured) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      if (defaultType === 'series') {
        const results = await searchTV(searchQuery);
        setSearchResults(results?.results || []);
      } else {
        const results = await searchMovies(searchQuery);
        setSearchResults(results?.results || []);
      }
      setIsSearching(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, tmdbConfigured, defaultType]);

  const handleSelectItem = useCallback(async (item: TMDBMovie | TMDBTV) => {
    setIsLoadingDetails(true);
    setSearchResults([]);
    setSearchQuery('');

    const details = defaultType === 'series' ? await getTVDetails(item.id) : await getMovieDetails(item.id);
    setSelectedItem(details);

    // Auto-fetch streaming links
    const providers = defaultType === 'series' ? await getTVWatchProviders(item.id) : await getWatchProviders(item.id);
    if (providers?.results?.IN) {
      const indiaProviders = providers.results.IN;
      const links: { platform: OTTPlatform; url: string }[] = [];

      // Get flatrate (subscription) providers
      const allProviders = [
        ...(indiaProviders.flatrate || []),
        ...(indiaProviders.rent || []),
        ...(indiaProviders.buy || []),
      ];

      const seenPlatforms = new Set<OTTPlatform>();

      for (const provider of allProviders) {
        const platform = PROVIDER_TO_PLATFORM[provider.provider_id];
        if (platform && !seenPlatforms.has(platform)) {
          seenPlatforms.add(platform);
          links.push({
            platform,
            url: indiaProviders.link || '',
          });
        }
      }

      setOttLinks(links);
    }

    setIsLoadingDetails(false);
    setStep(2);
  }, [defaultType]);

  const handleMoodToggle = (mood: string) => {
    setMoods((prev) =>
      prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood]
    );
  };

  const handleSubmit = async () => {
    if (!selectedItem || !personalNote.trim() || !user) return;

    setIsSubmitting(true);
    setError('');

    try {
      const supabase = createClient();

      const isSeries = defaultType === 'series';
      const title = isSeries ? (selectedItem as TMDBTVDetails).name : (selectedItem as TMDBMovieDetails).title;
      const originalTitle = isSeries ? (selectedItem as TMDBTVDetails).original_name : (selectedItem as TMDBMovieDetails).original_title;
      const date = isSeries ? (selectedItem as TMDBTVDetails).first_air_date : (selectedItem as TMDBMovieDetails).release_date;
      const year = date ? new Date(date).getFullYear() : new Date().getFullYear();
      const runtime = isSeries
        ? formatEpisodeRuntime((selectedItem as TMDBTVDetails).episode_run_time)
        : formatRuntime((selectedItem as TMDBMovieDetails).runtime);
      const genres = (selectedItem as TMDBMovieDetails | TMDBTVDetails).genres?.map((g) => g.name) || [];

      const recommendation = {
        user_id: user.id,
        title,
        original_title: originalTitle !== title ? originalTitle : null,
        year,
        type: defaultType,
        poster: getImageUrl((selectedItem as TMDBMovieDetails | TMDBTVDetails).poster_path),
        backdrop: getImageUrl((selectedItem as TMDBMovieDetails | TMDBTVDetails).backdrop_path, 'original'),
        genres,
        language: getLanguageName((selectedItem as TMDBMovieDetails | TMDBTVDetails).original_language),
        duration: runtime || null,
        rating: userRating > 0
          ? userRating * 2
          : ((selectedItem as TMDBMovieDetails | TMDBTVDetails).vote_average
            ? Math.round((selectedItem as TMDBMovieDetails | TMDBTVDetails).vote_average * 10) / 10
            : null),
        personal_note: personalNote,
        mood: moods,
        watch_with: null,
        ott_links: ottLinks.filter((link) => link.url.trim()),
        tmdb_id: (selectedItem as TMDBMovieDetails | TMDBTVDetails).id,
      };

      const { error: insertError } = await supabase.from('recommendations').insert(recommendation);

      if (insertError) {
        throw insertError;
      }

      onSuccess();
      onClose();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.message || 'Failed to submit recommendation');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--bg-card)] rounded-2xl p-6 shadow-2xl border border-white/10">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors z-10"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">
            Share a Recommendation
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Step {step} of 2: {step === 1 ? (defaultType === 'series' ? 'Find the show' : 'Find the movie') : 'Add your thoughts'}
          </p>
        </div>

        {/* Step 1: Search */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="relative">
              <input
                type="text"
                placeholder={defaultType === 'series' ? 'Search for a TV show...' : 'Search for a movie...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 pl-10 bg-[var(--bg-secondary)] border border-white/5 rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/50"
                autoFocus
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="max-h-80 overflow-y-auto space-y-2">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    className="w-full flex items-center gap-4 p-3 bg-[var(--bg-secondary)] rounded-xl hover:bg-[var(--bg-card-hover)] transition-colors text-left"
                  >
                    <div className="w-12 h-18 flex-shrink-0 rounded overflow-hidden bg-[var(--bg-primary)]">
                      {item.poster_path ? (
                        <img
                          src={getImageUrl(item.poster_path)}
                          alt={'title' in item ? item.title : item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--text-primary)] truncate">
                        {'title' in item ? item.title : item.name}
                      </p>
                      <p className="text-sm text-[var(--text-muted)]">
                        {'release_date' in item
                          ? (item.release_date ? new Date(item.release_date).getFullYear() : 'Unknown')
                          : (item.first_air_date ? new Date(item.first_air_date).getFullYear() : 'Unknown')}{' '}
                        • {(item.vote_average ?? 0).toFixed(1)} ★
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {isLoadingDetails && (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!tmdbConfigured && (
              <div className="text-center py-8 text-[var(--text-muted)]">
                <p>TMDB API not configured.</p>
                <p className="text-sm mt-1">Ask the admin to set up TMDB integration.</p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Details */}
        {step === 2 && selectedItem && (
          <div className="space-y-6">
            {/* Selected Movie */}
            <div className="flex items-start gap-4 p-4 bg-[var(--bg-secondary)] rounded-xl">
              <div className="w-16 h-24 flex-shrink-0 rounded-lg overflow-hidden">
                {(selectedItem as TMDBMovieDetails | TMDBTVDetails).poster_path ? (
                  <img
                    src={getImageUrl((selectedItem as TMDBMovieDetails | TMDBTVDetails).poster_path)}
                    alt={defaultType === 'series' ? (selectedItem as TMDBTVDetails).name : (selectedItem as TMDBMovieDetails).title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-[var(--bg-primary)] flex items-center justify-center text-2xl">🎬</div>
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-[var(--text-primary)]">
                  {defaultType === 'series' ? (selectedItem as TMDBTVDetails).name : (selectedItem as TMDBMovieDetails).title}
                </h3>
                <p className="text-sm text-[var(--text-muted)]">
                  {defaultType === 'series'
                    ? ((selectedItem as TMDBTVDetails).first_air_date ? new Date((selectedItem as TMDBTVDetails).first_air_date).getFullYear() : 'Unknown')
                    : ((selectedItem as TMDBMovieDetails).release_date ? new Date((selectedItem as TMDBMovieDetails).release_date).getFullYear() : 'Unknown')}{' '}
                  • {((selectedItem as TMDBMovieDetails | TMDBTVDetails).vote_average ?? 0).toFixed(1)} ★
                </p>
                <button
                  onClick={() => { setStep(1); setSelectedItem(null); setOttLinks([]); }}
                  className="text-sm text-[var(--accent)] hover:underline mt-1"
                >
                  {defaultType === 'series' ? 'Change show' : 'Change movie'}
                </button>
              </div>
            </div>

            {/* Personal Note */}
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-2">
                Why should they watch this? *
              </label>
              <textarea
                value={personalNote}
                onChange={(e) => setPersonalNote(e.target.value)}
                placeholder={defaultType === 'series'
                  ? 'Write your personal recommendation... What makes this show special?'
                  : 'Write your personal recommendation... What makes this movie special?'}
                rows={4}
                className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-white/5 rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/50 resize-none"
                required
              />
            </div>

            {/* Star Rating - Half stars supported */}
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-2">Your Rating</label>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <div key={star} className="relative flex">
                    {/* Left half (0.5) */}
                    <button
                      type="button"
                      onClick={() => setUserRating(star - 0.5)}
                      onMouseEnter={() => setHoverRating(star - 0.5)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="w-4 h-8 overflow-hidden transition-transform hover:scale-110"
                    >
                      <svg
                        className={`w-8 h-8 transition-colors ${
                          star - 0.5 <= (hoverRating || userRating)
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-[var(--bg-card-hover)] fill-[var(--bg-card-hover)]'
                        }`}
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </button>
                    {/* Right half (full) */}
                    <button
                      type="button"
                      onClick={() => setUserRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="w-4 h-8 overflow-hidden transition-transform hover:scale-110"
                    >
                      <svg
                        className={`w-8 h-8 -ml-4 transition-colors ${
                          star <= (hoverRating || userRating)
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-[var(--bg-card-hover)] fill-[var(--bg-card-hover)]'
                        }`}
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </button>
                  </div>
                ))}
                {userRating > 0 && (
                  <span className="ml-3 text-sm text-[var(--text-muted)]">{userRating}/5</span>
                )}
              </div>
            </div>

            {/* Moods */}
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-2">Mood tags</label>
              <div className="flex flex-wrap gap-2">
                {MOOD_OPTIONS.map((mood) => (
                  <button
                    key={mood}
                    type="button"
                    onClick={() => handleMoodToggle(mood)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                      moods.includes(mood)
                        ? 'mood-tag'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                    }`}
                  >
                    {mood}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-fetched OTT Links */}
            {ottLinks.length > 0 && (
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Available on</label>
                <div className="flex flex-wrap gap-2">
                  {ottLinks.map((link, index) => (
                    <a
                      key={index}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-[var(--bg-secondary)] rounded-full text-sm text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-[var(--bg-primary)] transition-colors flex items-center gap-1.5"
                    >
                      {link.platform}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ))}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-2">Click to open streaming link</p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 py-3 bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-medium rounded-xl hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!personalNote.trim() || isSubmitting}
                className="flex-1 py-3 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-xl hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Posting...' : 'Post Recommendation'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
