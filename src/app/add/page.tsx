'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  searchMovies,
  getMovieDetails,
  getImageUrl,
  isTMDBConfigured,
  tmdbToRecommendation,
  TMDBMovie,
  TMDBMovieDetails,
} from '@/lib/tmdb';
import data from '@/data/recommendations.json';

type OTTPlatform = 'Netflix' | 'Prime Video' | 'Hotstar' | 'Aha' | 'YouTube' | 'Zee5' | 'SonyLiv' | 'Jio Cinema' | 'Apple TV+' | 'Other';

const PLATFORMS: OTTPlatform[] = ['Netflix', 'Prime Video', 'Hotstar', 'Aha', 'Zee5', 'SonyLiv', 'Jio Cinema', 'YouTube', 'Apple TV+', 'Other'];

export default function AddMoviePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TMDBMovie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<TMDBMovieDetails | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Form state
  const [selectedRecommender, setSelectedRecommender] = useState(data.recommenders[0]?.id || '');
  const [personalNote, setPersonalNote] = useState('');
  const [watchWith, setWatchWith] = useState('');
  const [moods, setMoods] = useState<string[]>([]);
  const [ottLinks, setOttLinks] = useState<{ platform: OTTPlatform; url: string; availableIn: string }[]>([]);
  const [generatedJSON, setGeneratedJSON] = useState('');

  const tmdbConfigured = isTMDBConfigured();

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || !tmdbConfigured) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchMovies(searchQuery);
      setSearchResults(results?.results || []);
      setIsSearching(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, tmdbConfigured]);

  const handleSelectMovie = useCallback(async (movie: TMDBMovie) => {
    setIsLoadingDetails(true);
    setSearchResults([]);
    setSearchQuery('');

    const details = await getMovieDetails(movie.id);
    setSelectedMovie(details);
    setIsLoadingDetails(false);
  }, []);

  const addOttLink = () => {
    setOttLinks((prev) => [...prev, { platform: 'Netflix', url: '', availableIn: '' }]);
  };

  const updateOttLink = (index: number, field: 'platform' | 'url' | 'availableIn', value: string) => {
    setOttLinks((prev) =>
      prev.map((link, i) => (i === index ? { ...link, [field]: value } : link))
    );
  };

  const removeOttLink = (index: number) => {
    setOttLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoodToggle = (mood: string) => {
    setMoods((prev) =>
      prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood]
    );
  };

  const generateRecommendation = () => {
    if (!selectedMovie) return;

    const recommender = data.recommenders.find((r) => r.id === selectedRecommender);
    if (!recommender) return;

    const recommendation = tmdbToRecommendation(
      selectedMovie,
      recommender,
      personalNote,
      ottLinks.filter((link) => link.url.trim())
    );

    // Add custom fields
    recommendation.mood = moods;
    recommendation.watchWith = watchWith;

    // Generate pretty JSON
    const json = JSON.stringify(recommendation, null, 2);
    setGeneratedJSON(json);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedJSON);
  };

  const MOOD_OPTIONS = [
    'epic', 'thrilling', 'heartwarming', 'emotional', 'thought-provoking',
    'intense', 'inspiring', 'mind-bending', 'raw', 'slice-of-life',
    'funny', 'scary', 'romantic', 'action-packed', 'nostalgic'
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Cinema Chudu
            </Link>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">Add Recommendation</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!tmdbConfigured ? (
          <div className="bg-[var(--bg-card)] rounded-2xl p-8 border border-white/5 text-center">
            <div className="text-5xl mb-4">🔑</div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              TMDB API Key Required
            </h2>
            <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
              To search and fetch movie data automatically, you need to configure a TMDB API key.
            </p>
            <div className="bg-[var(--bg-secondary)] rounded-xl p-4 text-left max-w-lg mx-auto">
              <p className="text-sm text-[var(--text-muted)] mb-2">1. Get your free API key from:</p>
              <a
                href="https://www.themoviedb.org/settings/api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline text-sm"
              >
                https://www.themoviedb.org/settings/api
              </a>
              <p className="text-sm text-[var(--text-muted)] mt-4 mb-2">2. Create a <code className="text-[var(--accent)]">.env.local</code> file:</p>
              <code className="block bg-[var(--bg-primary)] p-3 rounded text-sm text-[var(--text-primary)]">
                NEXT_PUBLIC_TMDB_API_KEY=your_api_key_here
              </code>
              <p className="text-sm text-[var(--text-muted)] mt-4">3. Restart the dev server</p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Step 1: Search for a movie */}
            <div className="bg-[var(--bg-card)] rounded-2xl p-6 border border-white/5">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] text-sm flex items-center justify-center font-bold">1</span>
                Search for a Movie
              </h2>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Search TMDB for movies..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-3 pl-10 bg-[var(--bg-secondary)] border border-white/5 rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/50"
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
                <div className="mt-4 max-h-80 overflow-y-auto space-y-2">
                  {searchResults.map((movie) => (
                    <button
                      key={movie.id}
                      onClick={() => handleSelectMovie(movie)}
                      className="w-full flex items-center gap-4 p-3 bg-[var(--bg-secondary)] rounded-xl hover:bg-[var(--bg-card-hover)] transition-colors text-left"
                    >
                      <div className="w-12 h-18 flex-shrink-0 rounded overflow-hidden bg-[var(--bg-primary)]">
                        {movie.poster_path ? (
                          <img
                            src={getImageUrl(movie.poster_path)}
                            alt={movie.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[var(--text-primary)] truncate">{movie.title}</p>
                        <p className="text-sm text-[var(--text-muted)]">
                          {movie.release_date ? new Date(movie.release_date).getFullYear() : 'Unknown'} • {movie.vote_average.toFixed(1)} ★
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected Movie */}
              {isLoadingDetails && (
                <div className="mt-4 flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {selectedMovie && !isLoadingDetails && (
                <div className="mt-4 flex items-start gap-4 p-4 bg-[var(--bg-secondary)] rounded-xl">
                  <div className="w-20 h-30 flex-shrink-0 rounded-lg overflow-hidden">
                    {selectedMovie.poster_path ? (
                      <img
                        src={getImageUrl(selectedMovie.poster_path)}
                        alt={selectedMovie.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[var(--bg-primary)] flex items-center justify-center text-3xl">🎬</div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-[var(--text-primary)]">{selectedMovie.title}</h3>
                    {selectedMovie.original_title !== selectedMovie.title && (
                      <p className="text-sm text-[var(--text-muted)]">{selectedMovie.original_title}</p>
                    )}
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                      {new Date(selectedMovie.release_date).getFullYear()} •{' '}
                      {selectedMovie.runtime}m •{' '}
                      {selectedMovie.vote_average.toFixed(1)} ★
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selectedMovie.genres.slice(0, 4).map((g) => (
                        <span key={g.id} className="px-2 py-0.5 text-xs bg-[var(--bg-card)] rounded text-[var(--text-muted)]">
                          {g.name}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => setSelectedMovie(null)}
                      className="mt-2 text-sm text-[var(--accent)] hover:underline"
                    >
                      Change movie
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Add your personal touch */}
            {selectedMovie && (
              <div className="bg-[var(--bg-card)] rounded-2xl p-6 border border-white/5">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] text-sm flex items-center justify-center font-bold">2</span>
                  Add Your Personal Touch
                </h2>

                <div className="space-y-4">
                  {/* Recommender */}
                  <div>
                    <label className="block text-sm text-[var(--text-muted)] mb-2">Who&apos;s recommending?</label>
                    <div className="flex flex-wrap gap-2">
                      {data.recommenders.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => setSelectedRecommender(r.id)}
                          className={`px-4 py-2 rounded-full text-sm transition-all ${
                            selectedRecommender === r.id
                              ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                          }`}
                        >
                          {r.avatar} {r.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Personal Note */}
                  <div>
                    <label className="block text-sm text-[var(--text-muted)] mb-2">
                      Why should they watch this? (Required)
                    </label>
                    <textarea
                      value={personalNote}
                      onChange={(e) => setPersonalNote(e.target.value)}
                      placeholder="Write your personal recommendation... What makes this movie special? When should someone watch it?"
                      rows={4}
                      className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-white/5 rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/50 resize-none"
                    />
                  </div>

                  {/* Watch With */}
                  <div>
                    <label className="block text-sm text-[var(--text-muted)] mb-2">Best watched... (Optional)</label>
                    <input
                      type="text"
                      value={watchWith}
                      onChange={(e) => setWatchWith(e.target.value)}
                      placeholder="e.g., with family, alone, with friends on movie night"
                      className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-white/5 rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/50"
                    />
                  </div>

                  {/* Moods */}
                  <div>
                    <label className="block text-sm text-[var(--text-muted)] mb-2">Mood tags (Optional)</label>
                    <div className="flex flex-wrap gap-2">
                      {MOOD_OPTIONS.map((mood) => (
                        <button
                          key={mood}
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

                  {/* OTT Links */}
                  <div>
                    <label className="block text-sm text-[var(--text-muted)] mb-2">Where to watch (Optional)</label>
                    <div className="space-y-2">
                      {ottLinks.map((link, index) => (
                        <div key={index} className="flex gap-2">
                          <select
                            value={link.platform}
                            onChange={(e) => updateOttLink(index, 'platform', e.target.value)}
                            className="px-3 py-2 bg-[var(--bg-secondary)] border border-white/5 rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50"
                          >
                            {PLATFORMS.map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                          <input
                            type="url"
                            value={link.url}
                            onChange={(e) => updateOttLink(index, 'url', e.target.value)}
                            placeholder="https://..."
                            className="flex-1 px-3 py-2 bg-[var(--bg-secondary)] border border-white/5 rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50"
                          />
                          <input
                            type="text"
                            value={link.availableIn}
                            onChange={(e) => updateOttLink(index, 'availableIn', e.target.value)}
                            placeholder="Language"
                            className="w-28 px-3 py-2 bg-[var(--bg-secondary)] border border-white/5 rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50"
                          />
                          <button
                            onClick={() => removeOttLink(index)}
                            className="px-3 py-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={addOttLink}
                        className="text-sm text-[var(--accent)] hover:underline"
                      >
                        + Add streaming link
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Generate JSON */}
            {selectedMovie && personalNote.trim() && (
              <div className="bg-[var(--bg-card)] rounded-2xl p-6 border border-white/5">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] text-sm flex items-center justify-center font-bold">3</span>
                  Generate & Copy
                </h2>

                <button
                  onClick={generateRecommendation}
                  className="w-full py-3 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-xl hover:bg-[var(--accent-hover)] transition-colors"
                >
                  Generate Recommendation JSON
                </button>

                {generatedJSON && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-[var(--text-muted)]">
                        Add this to <code>src/data/recommendations.json</code>
                      </span>
                      <button
                        onClick={copyToClipboard}
                        className="text-sm text-[var(--accent)] hover:underline"
                      >
                        Copy to clipboard
                      </button>
                    </div>
                    <pre className="bg-[var(--bg-secondary)] rounded-xl p-4 overflow-x-auto text-sm text-[var(--text-primary)]">
                      {generatedJSON}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
