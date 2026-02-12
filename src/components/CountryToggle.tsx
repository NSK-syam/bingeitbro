'use client';

export type CountryCode = 'IN' | 'US';

type CountryToggleProps = {
  value: CountryCode;
  onChange: (value: CountryCode) => void;
  size?: 'sm' | 'md';
};

export function CountryToggle({ value, onChange, size = 'sm' }: CountryToggleProps) {
  const base =
    size === 'md'
      ? 'px-4 py-2.5 text-sm rounded-full'
      : 'px-3 py-2 text-xs rounded-full';

  return (
    <div className="inline-flex items-center gap-1.5 bg-[var(--bg-secondary)] border border-white/10 rounded-full p-1">
      <button
        type="button"
        onClick={() => onChange('IN')}
        className={[
          base,
          'transition-all font-medium',
          value === 'IN'
            ? 'bg-[var(--accent)] text-[var(--bg-primary)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)]',
        ].join(' ')}
        aria-pressed={value === 'IN'}
        title="India"
      >
        🇮🇳 India
      </button>
      <button
        type="button"
        onClick={() => onChange('US')}
        className={[
          base,
          'transition-all font-medium',
          value === 'US'
            ? 'bg-[var(--accent)] text-[var(--bg-primary)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)]',
        ].join(' ')}
        aria-pressed={value === 'US'}
        title="USA"
      >
        🇺🇸 USA
      </button>
    </div>
  );
}

