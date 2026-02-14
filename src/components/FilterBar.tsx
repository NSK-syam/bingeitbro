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
          ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-semibold'
          : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] border border-white/10'
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
  /** When true, do not render the Friends row (friends list lives in Friends tab dropdown) */
  hideFriendsSection?: boolean;
}

export function FilterBar({
  recommendations,
  recommenders,
  activeFilters,
  onFilterChange,
  onManageFriends,
  onRemoveFriend,
  showManageFriends,
  hideFriendsSection = false,
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
    <div className="space-y-5">
      {/* Type filters */}
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] mb-2">Type</p>
        <div className="flex flex-wrap gap-2">
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
      </div>

      {!hideFriendsSection && (
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] mb-2">Friends</p>
          <div className="flex flex-wrap gap-2">
            <FilterButton
              active={activeFilters.recommendedBy === null}
              onClick={() => onFilterChange('recommendedBy', null)}
            >
              All
            </FilterButton>
            {[...recommenders]
              .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
              .map((person) => (
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
                      ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-semibold'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] border border-white/10'
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
                    className="px-2 py-1.5 text-sm rounded-r-full bg-[var(--bg-secondary)] text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all border border-white/10 border-l-0"
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
                className="px-3 py-1.5 text-sm rounded-full bg-[var(--bg-card)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--bg-primary)] transition-all flex items-center gap-1 border border-white/10"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Friends
              </button>
            )}
          </div>
        </div>
      )}

      {/* Genre filters */}
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] mb-2">Genre</p>
        <div className="flex flex-wrap gap-2">
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
      </div>

      {/* Language filters */}
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] mb-2">Language</p>
        <div className="flex flex-wrap gap-2">
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

      {/* Year filters */}
      {years.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] mb-2">Year</p>
          <div className="flex flex-wrap gap-2">
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
        </div>
      )}
    </div>
  );
}
