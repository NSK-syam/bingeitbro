'use client';

import { useMemo, useState } from 'react';

type StarRatingProps = {
  value: number; // 0-5
  onChange?: (value: number) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
};

export function StarRating({ value, onChange, disabled = false, size = 'sm' }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;

  const { starSize, gap, strokeWidth } = useMemo(() => {
    if (size === 'md') return { starSize: 18, gap: 'gap-1.5', strokeWidth: 1.7 };
    return { starSize: 16, gap: 'gap-1', strokeWidth: 1.7 };
  }, [size]);

  return (
    <div className={`inline-flex items-center ${gap}`}>
      {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => {
        const filled = display >= n;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled || !onChange}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onChange?.(n)}
            className={[
              'transition-transform duration-150',
              disabled || !onChange ? 'cursor-default' : 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0',
            ].join(' ')}
            aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
            title={`${n} star${n === 1 ? '' : 's'}`}
          >
            <svg
              width={starSize}
              height={starSize}
              viewBox="0 0 24 24"
              fill={filled ? 'currentColor' : 'none'}
              className={filled ? 'text-yellow-400 drop-shadow-[0_6px_18px_rgba(250,204,21,0.18)]' : 'text-white/40'}
              stroke="currentColor"
              strokeWidth={strokeWidth}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.48 3.499a.6.6 0 0 1 1.04 0l2.4 4.86a.6.6 0 0 0 .451.328l5.363.779a.6.6 0 0 1 .332 1.023l-3.88 3.782a.6.6 0 0 0-.173.531l.916 5.341a.6.6 0 0 1-.87.632l-4.796-2.52a.6.6 0 0 0-.56 0l-4.796 2.52a.6.6 0 0 1-.87-.632l.916-5.34a.6.6 0 0 0-.173-.532L2.934 10.49a.6.6 0 0 1 .332-1.023l5.363-.78a.6.6 0 0 0 .451-.327l2.4-4.861Z"
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

