import type { ReactNode } from 'react';

/** Large screen title used at the top of each tab. */
export function ScreenHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 px-5 pt-4">
      <div>
        <h1 className="app-display m-0 text-[40px] leading-none">{title}</h1>
        {subtitle ? <p className="mb-0 mt-1.5 text-[15px] text-[var(--app-muted)]">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

/** Designed empty / error / offline state. */
export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="mx-5 mt-6 flex flex-col items-start gap-3 rounded-[18px] bg-[var(--app-surface)] p-5">
      <h2 className="m-0 text-[17px] font-semibold">{title}</h2>
      {body ? <p className="m-0 text-[15px] leading-normal text-[var(--app-muted)]">{body}</p> : null}
      {action}
    </div>
  );
}
