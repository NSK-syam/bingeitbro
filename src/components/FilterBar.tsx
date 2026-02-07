'use client';

import { Recommendation, Recommender } from '@/types';

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-full transition-all ${
        active
          ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
          : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  );
}

interface FilterBarProps {
  recommendations: Recommendation[];
  recommenders: Recommender[];
  activeFilters: {
    type: string | null;
    genre: string | null;
    language: string | null;
    recommendedBy: string | null;
    year: number | null;
  };
  onFilterChange: (key: string, value: string | number | null) => void;
  onManageFriends?: () => void;
  onRemoveFriend?: (friendId: string) => void;
  showManageFriends?: boolean;
}

export function FilterBar({
  recommendations,
  recommenders,
  activeFilters,
  onFilterChange,
  onManageFriends,
  onRemoveFriend,
  showManageFriends,
}: FilterBarProps) {
  // Extract unique values (guard against undefined from DB)
  const types = [...new Set(recommendations.map((r) => r.type))];
  const genres = [...new Set(recommendations.flatMap((r) => Array.isArray(r.genres) ? r.genres : []))].sort();
  const languages = [...new Set(recommendations.map((r) => r.language ?? ''))].filter(Boolean).sort();
  const years = [...new Set(recommendations.map((r) => r.year).filter((y): y is number => typeof y === 'number' && y > 0))].sort((a, b) => b - a);

  const typeLabels: Record<string, string> = {
    movie: 'Movies',
    series: 'Series',
    documentary: 'Docs',
    anime: 'Anime',
  };

  return (
    <div className="space-y-4">
      {/* Type filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--text-muted)] w-16">Type:</span>
        <FilterButton
          active={activeFilters.type === null}
          onClick={() => onFilterChange('type', null)}
        >
          All
        </FilterButton>
        {types.map((type) => (
          <FilterButton
            key={type}
            active={activeFilters.type === type}
            onClick={() =>
              onFilterChange('type', activeFilters.type === type ? null : type)
            }
          >
            {typeLabels[type] || type}
          </FilterButton>
        ))}
      </div>

      {/* Friends filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--text-muted)] w-16">Friends:</span>
        <FilterButton
          active={activeFilters.recommendedBy === null}
          onClick={() => onFilterChange('recommendedBy', null)}
        >
          All
        </FilterButton>
        {recommenders.map((person) => (
          <div key={person.id} className="flex items-center">
            <button
              onClick={() =>
                onFilterChange(
                  'recommendedBy',
                  activeFilters.recommendedBy === person.id ? null : person.id
                )
              }
              className={`px-3 py-1.5 text-sm transition-all ${
                onRemoveFriend ? 'rounded-l-full' : 'rounded-full'
              } ${
                activeFilters.recommendedBy === person.id
                  ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'
              }`}
            >
              {person.avatar} {person.name}
            </button>
            {onRemoveFriend && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFriend(person.id);
                }}
                className="px-2 py-1.5 text-sm rounded-r-full bg-[var(--bg-secondary)] text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all border-l border-white/10"
                title="Remove friend"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {showManageFriends && onManageFriends && (
          <button
            onClick={onManageFriends}
            className="px-3 py-1.5 text-sm rounded-full bg-[var(--bg-card)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--bg-primary)] transition-all flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Friends
          </button>
        )}
      </div>

      {/* Genre filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--text-muted)] w-16">Genre:</span>
        <FilterButton
          active={activeFilters.genre === null}
          onClick={() => onFilterChange('genre', null)}
        >
          All
        </FilterButton>
        {genres.slice(0, 8).map((genre) => (
          <FilterButton
            key={genre}
            active={activeFilters.genre === genre}
            onClick={() =>
              onFilterChange('genre', activeFilters.genre === genre ? null : genre)
            }
          >
            {genre}
          </FilterButton>
        ))}
      </div>

      {/* Language filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--text-muted)] w-16">Lang:</span>
        <FilterButton
          active={activeFilters.language === null}
          onClick={() => onFilterChange('language', null)}
        >
          All
        </FilterButton>
        {languages.map((lang) => (
          <FilterButton
            key={lang}
            active={activeFilters.language === lang}
            onClick={() =>
              onFilterChange('language', activeFilters.language === lang ? null : lang)
            }
          >
            {lang}
          </FilterButton>
        ))}
      </div>

      {/* Year filters */}
      {years.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] w-16">Year:</span>
          <FilterButton
            active={activeFilters.year === null}
            onClick={() => onFilterChange('year', null)}
          >
            All
          </FilterButton>
          {years.slice(0, 12).map((y) => (
            <FilterButton
              key={y}
              active={activeFilters.year === y}
              onClick={() =>
                onFilterChange('year', activeFilters.year === y ? null : y)
              }
            >
              {y}
            </FilterButton>
          ))}
        </div>
      )}
    </div>
  );
}
