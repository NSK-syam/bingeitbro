'use client';

import { useEffect, useMemo, useState } from 'react';
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/safe-storage';

const UPDATE_VERSION = '2026-02-email-primary-tip';
const STORAGE_KEY = 'bib-helpbot-last-seen-update';

type HelpUpdate = {
  id: string;
  title: string;
  detail: string;
  tag: string;
};

const HELP_UPDATES: HelpUpdate[] = [
  {
    id: UPDATE_VERSION,
    tag: 'New update',
    title: 'Email delivery tip',
    detail:
      'If friend recommendations or schedule reminders land in Spam, open the mail and click "Report not spam" so future BiB emails reach Primary.',
  },
];

export function HelpBotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnseen, setHasUnseen] = useState(true);

  const latestUpdateId = useMemo(() => HELP_UPDATES[0]?.id ?? '', []);

  useEffect(() => {
    const seen = safeLocalStorageGet(STORAGE_KEY);
    setHasUnseen(seen !== latestUpdateId);
  }, [latestUpdateId]);

  const markSeen = () => {
    if (!latestUpdateId) return;
    safeLocalStorageSet(STORAGE_KEY, latestUpdateId);
    setHasUnseen(false);
  };

  const openBot = () => {
    setIsOpen(true);
    markSeen();
  };

  return (
    <div className="fixed bottom-5 right-5 z-[120] flex flex-col items-end gap-3">
      {isOpen && (
        <div className="w-[min(92vw,360px)] rounded-2xl border border-cyan-200/35 bg-[#090d19]/95 backdrop-blur-2xl shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
          <div className="flex items-start justify-between gap-3 p-4 border-b border-white/10">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-200/70">BiB Helpbot</p>
              <h3 className="text-base font-semibold text-[var(--text-primary)] mt-1">New updates</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8 rounded-full border border-white/15 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-white/35 transition-colors"
              aria-label="Close help updates"
            >
              ✕
            </button>
          </div>

          <div className="p-4 space-y-3">
            {HELP_UPDATES.map((item) => (
              <article key={item.id} className="rounded-xl border border-rose-300/30 bg-rose-500/10 p-3">
                <div className="inline-flex items-center rounded-full border border-rose-200/45 bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-100">
                  {item.tag}
                </div>
                <h4 className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{item.title}</h4>
                <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={openBot}
        className="relative h-14 w-14 rounded-full border border-amber-100/65 bg-gradient-to-br from-amber-300 via-orange-400 to-rose-500 text-[#fff7e0] shadow-[0_14px_40px_rgba(245,158,11,0.45)] hover:scale-[1.03] active:scale-100 transition-transform"
        aria-label="Open help updates"
        title="Help & updates"
      >
        <span className="absolute inset-[3px] rounded-full bg-black/18" aria-hidden />
        <svg
          className="relative z-10 mx-auto h-7 w-7 drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <rect x="3.5" y="8.5" width="17" height="11" rx="2.3" stroke="currentColor" strokeWidth="1.6" />
          <path d="M4.2 8.5L6.8 4.8H10l-2.6 3.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M10.6 8.5L13.2 4.8h3.2l-2.6 3.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M11 12.2l3.8 2.3-3.8 2.3v-4.6z" fill="currentColor" />
          <circle cx="18.2" cy="6" r="1.2" fill="currentColor" opacity="0.9" />
        </svg>
        {hasUnseen && (
          <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white border border-white/70">
            New
          </span>
        )}
      </button>
    </div>
  );
}
