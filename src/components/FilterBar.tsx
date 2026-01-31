'use client';

import { Recommendation, Recommender } from '@/types';

interface FilterBarProps {
  recommendations: Recommendation[];
  recommenders: Recommender[];
  activeFilters: {
    type: string | null;
    genre: string | null;
    language: string | null;
    recommendedBy: string | null;
  };
  onFilterChange: (key: string, value: string | null) => void;
}

export function FilterBar({
  recommendations,
  recommenders,
  activeFilters,
  onFilterChange,
}: FilterBarProps) {
  // Extract unique values
  const types = [...new Set(recommendations.map((r) => r.type))];
  const genres = [...new Set(recommendations.flatMap((r) => r.genres))].sort();
  const languages = [...new Set(recommendations.map((r) => r.language))].sort();

  const typeLabels: Record<string, string> = {
    movie: 'Movies',
    series: 'Series',
    documentary: 'Docs',
    anime: 'Anime',
  };

  const FilterButton = ({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
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

      {/* Recommender filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--text-muted)] w-16">From:</span>
        <FilterButton
          active={activeFilters.recommendedBy === null}
          onClick={() => onFilterChange('recommendedBy', null)}
        >
          Everyone
        </FilterButton>
        {recommenders.map((person) => (
          <FilterButton
            key={person.id}
            active={activeFilters.recommendedBy === person.id}
            onClick={() =>
              onFilterChange(
                'recommendedBy',
                activeFilters.recommendedBy === person.id ? null : person.id
              )
            }
          >
            {person.avatar} {person.name}
          </FilterButton>
        ))}
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
    </div>
  );
}
