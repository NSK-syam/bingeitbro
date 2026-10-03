'use client';

import Link from 'next/link';
import { useId, type ReactNode } from 'react';

type PosterRowProps = {
  title: string;
  /** Optional link at the right of the heading ("See all", "3 new"). */
  action?: { label: string; href: string };
  children: ReactNode;
};

/** A titled, horizontally scrolling row of posters. */
export function PosterRow({ title, action, children }: PosterRowProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="mt-7">
      <div className="mb-3 flex items-baseline justify-between px-5">
        <h2 id={headingId} className="m-0 text-[19px] font-semibold">{title}</h2>
        {action ? (
          <Link href={action.href} className="text-[14px] text-[var(--app-accent)] no-underline">
            {action.label}
          </Link>
        ) : null}
      </div>
      <div className="app-hide-scrollbar flex snap-x gap-2.5 overflow-x-auto px-5 pb-1 [scroll-padding-inline:20px]">
        {children}
      </div>
    </section>
  );
}
