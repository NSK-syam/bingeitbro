'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type HubKey = 'movies' | 'shows' | 'songs';
type Placement = 'top' | 'center';
type Size = 'md' | 'lg';

const HUBS: Array<{ key: HubKey; label: string; href: string }> = [
  { key: 'movies', label: 'Movies', href: '/movies' },
  { key: 'shows', label: 'Shows', href: '/shows' },
  { key: 'songs', label: 'Songs', href: '/songs' },
];

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
      ? 'mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-[var(--bg-primary)]/55 backdrop-blur-xl p-1 shadow-lg shadow-black/20'
      : 'mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-[var(--bg-primary)]/55 backdrop-blur-xl p-1 shadow-lg shadow-black/20';

  return (
    <nav className={wrapClass}>
      <div className={pillClass}>
        {HUBS.map((hub) => {
          const isActive = hub.key === active;
          return (
            <Link
              key={hub.key}
              href={hub.href}
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem('bib-default-hub', hub.key);
                }
              }}
              className={`rounded-full font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--accent)] text-[var(--bg-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5'
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
