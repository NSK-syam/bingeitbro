'use client';

import { useState, useMemo } from 'react';
import { Header, MovieCard, FilterBar, RandomPicker } from '@/components';
import { Recommendation, Recommender } from '@/types';
import { useWatched } from '@/hooks';
import data from '@/data/recommendations.json';

export default function Home() {
  const recommendations = data.recommendations as Recommendation[];
  const recommenders = data.recommenders as Recommender[];
  const { getWatchedCount, isWatched } = useWatched();

  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<{
    type: string | null;
    genre: string | null;
    language: string | null;
    recommendedBy: string | null;
    watchedStatus: 'all' | 'watched' | 'unwatched';
  }>({
    type: null,
    genre: null,
    language: null,
    recommendedBy: null,
    watchedStatus: 'all',
  });

  const handleFilterChange = (key: string, value: string | null) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const filteredRecommendations = useMemo(() => {
    return recommendations.filter((rec) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          rec.title.toLowerCase().includes(query) ||
          rec.originalTitle?.toLowerCase().includes(query) ||
          rec.genres.some((g) => g.toLowerCase().includes(query)) ||
          rec.recommendedBy.name.toLowerCase().includes(query) ||
          rec.personalNote.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Type filter
      if (filters.type && rec.type !== filters.type) return false;

      // Genre filter
      if (filters.genre && !rec.genres.includes(filters.genre)) return false;

      // Language filter
      if (filters.language && rec.language !== filters.language) return false;

      // Recommender filter
      if (filters.recommendedBy && rec.recommendedBy.id !== filters.recommendedBy)
        return false;

      // Watched status filter
      if (filters.watchedStatus === 'watched' && !isWatched(rec.id)) return false;
      if (filters.watchedStatus === 'unwatched' && isWatched(rec.id)) return false;

      return true;
    });
  }, [recommendations, searchQuery, filters, isWatched]);

  // Sort by date added (newest first)
  const sortedRecommendations = useMemo(() => {
    return [...filteredRecommendations].sort(
      (a, b) => new Date(b.addedOn).getTime() - new Date(a.addedOn).getTime()
    );
  }, [filteredRecommendations]);

  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value !== null && value !== 'all'
  ).length;

  const watchedCount = getWatchedCount();
  const totalCount = recommendations.length;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <Header onSearch={setSearchQuery} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero section */}
        <div className="text-center mb-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-gradient mb-4">
            What are we watching tonight?
          </h2>
          <p className="text-[var(--text-secondary)] max-w-2xl mx-auto mb-6">
            Recommendations from friends who actually know your taste. No algorithms,
            just good vibes and great stories.
          </p>

          {/* Stats and Random Picker */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <RandomPicker recommendations={recommendations} />

            {/* Watch Progress */}
            <div className="flex items-center gap-3 px-4 py-2 bg-[var(--bg-secondary)] rounded-full">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {watchedCount} / {totalCount} watched
                  </p>
                  <div className="w-24 h-1.5 bg-[var(--bg-card)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all duration-500"
                      style={{ width: `${totalCount > 0 ? (watchedCount / totalCount) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-[var(--bg-secondary)] rounded-2xl p-4 sm:p-6 mb-8 border border-white/5">
          <FilterBar
            recommendations={recommendations}
            recommenders={recommenders}
            activeFilters={filters}
            onFilterChange={handleFilterChange}
          />

          {/* Watched status filter */}
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-white/5">
            <span className="text-xs text-[var(--text-muted)] w-16">Status:</span>
            {(['all', 'unwatched', 'watched'] as const).map((status) => (
              <button
                key={status}
                onClick={() => handleFilterChange('watchedStatus', status)}
                className={`px-3 py-1.5 text-sm rounded-full transition-all ${
                  filters.watchedStatus === status
                    ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                    : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                {status === 'all' ? 'All' : status === 'watched' ? '✓ Watched' : '○ Unwatched'}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-[var(--text-muted)]">
            {sortedRecommendations.length}{' '}
            {sortedRecommendations.length === 1 ? 'recommendation' : 'recommendations'}
            {activeFilterCount > 0 && (
              <span className="text-[var(--accent)]"> (filtered)</span>
            )}
          </p>
          {activeFilterCount > 0 && (
            <button
              onClick={() =>
                setFilters({ type: null, genre: null, language: null, recommendedBy: null, watchedStatus: 'all' })
              }
              className="text-sm text-[var(--accent)] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Movie grid */}
        {sortedRecommendations.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
            {sortedRecommendations.map((rec, index) => (
              <MovieCard key={rec.id} recommendation={rec} index={index} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🎬</div>
            <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              No matches found
            </h3>
            <p className="text-[var(--text-secondary)]">
              Try adjusting your filters or search query
            </p>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-white/5 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            Cinema Chudu • Made with ❤️ for movie lovers
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            Add your recommendations by editing{' '}
            <code className="text-[var(--accent)]">src/data/recommendations.json</code>
          </p>
        </footer>
      </main>
    </div>
  );
}
