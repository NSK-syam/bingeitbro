'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { safeLocalStorageSet } from '@/lib/safe-storage';

type HubKey = 'movies' | 'shows' | 'songs';
type Placement = 'top' | 'center';
type Size = 'md' | 'lg';

const HUBS: Array<{ key: HubKey; label: string; href: string }> = [
  { key: 'movies', label: 'Movies', href: '/movies' },
  { key: 'shows', label: 'Shows', href: '/shows' },
  { key: 'songs', label: 'Songs', href: '/songs' },
];

const TAB_STYLES: Record<
  HubKey,
  {
    active: string;
    idle: string;
  }
> = {
  movies: {
    active:
      'bg-[#f59e0b] text-[#16110a]',
    idle:
      'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5',
  },
  shows: {
    active:
      'bg-[#38bdf8] text-[#061521]',
    idle:
      'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5',
  },
  songs: {
    active:
      'bg-[#c084fc] text-[#1b1026]',
    idle:
      'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5',
  },
};

export function HubTabs({
  placement = 'top',
  size = 'md',
}: {
  placement?: Placement;
  size?: Size;
}) {
  const pathname = usePathname();
  const active = ((): HubKey => {
    if (pathname?.startsWith('/shows')) return 'shows';
    if (pathname?.startsWith('/songs')) return 'songs';
    return 'movies';
  })();

  const wrapClass =
    placement === 'center'
      ? 'relative z-40 w-full flex items-center justify-center'
      : 'relative z-40 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';

  const pillClass =
    placement === 'center'
      ? 'mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#0a0e17]/92 backdrop-blur-xl p-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.35)]'
      : 'mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#0a0e17]/92 backdrop-blur-xl p-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.35)]';

  return (
    <nav className={wrapClass}>
      <div className={pillClass}>
        {HUBS.map((hub) => {
          const isActive = hub.key === active;
          const style = TAB_STYLES[hub.key];
          return (
            <Link
              key={hub.key}
              href={hub.href}
              onClick={() => {
                safeLocalStorageSet('bib-default-hub', hub.key);
              }}
              className={`rounded-full font-semibold transition-all border ${
                isActive
                  ? `${style.active} border-white/25`
                  : `${style.idle} border-transparent`
              } ${size === 'lg' ? 'px-7 py-3 text-base' : 'px-4 py-2 text-sm'}`}
            >
              {hub.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
