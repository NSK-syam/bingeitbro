'use client';

import { useState, useEffect, useMemo } from 'react';
import { MOVIE_QUOTES } from '@/data/movie-quotes';

const STORAGE_KEY = 'bingeitbro-daily-quote-date';
const POPUP_DELAY_MS = 800;
const EXIT_ANIMATION_MS = 220;

function getTodayKey(): string {
  return new Date().toDateString();
}

function getQuoteForToday(): (typeof MOVIE_QUOTES)[number] {
  const today = new Date();
  const dayIndex =
    today.getFullYear() * 10000 +
    (today.getMonth() + 1) * 100 +
    today.getDate();
  const index = Math.abs(dayIndex) % MOVIE_QUOTES.length;
  return MOVIE_QUOTES[index];
}

type PopupState = 'idle' | 'showing' | 'visible' | 'closing';

export function DailyQuoteBanner() {
  const [state, setState] = useState<PopupState>('idle');
  const [mounted, setMounted] = useState(false);

  const quote = useMemo(() => getQuoteForToday(), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setMounted(true);
    const lastShown = localStorage.getItem(STORAGE_KEY);
    const today = getTodayKey();
    if (lastShown !== today) {
      const timer = setTimeout(() => {
        setState('showing');
        localStorage.setItem(STORAGE_KEY, today);
        const t2 = setTimeout(() => setState('visible'), 50);
        return () => clearTimeout(t2);
      }, POPUP_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    if (state !== 'visible' && state !== 'showing') return;
    setState('closing');
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, getTodayKey());
    }
    setTimeout(() => setState('idle'), EXIT_ANIMATION_MS);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    handleDismiss();
  };

  if (!mounted || state === 'idle') return null;

  const isClosing = state === 'closing';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Daily movie quote"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm ${
          isClosing ? 'quote-popup-backdrop-out' : 'quote-popup-backdrop-in'
        }`}
        onClick={handleBackdropClick}
      />

      {/* Popup card */}
      <div
        className={`relative w-full max-w-md rounded-2xl border border-white/15 bg-[var(--bg-secondary)] shadow-2xl shadow-black/50 p-6 sm:p-8 ${
          isClosing ? 'quote-popup-out' : 'quote-popup-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Clapper icon */}
        <div className="flex justify-center mb-4">
          <span
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--accent)]/20 text-3xl quote-popup-text-in"
            aria-hidden
          >
            🎬
          </span>
        </div>

        <p
          className="text-[var(--text-primary)] font-medium text-xl sm:text-2xl text-center italic quote-popup-text-in"
        >
          &ldquo;{quote.quote}&rdquo;
        </p>
        <p className="text-[var(--text-muted)] text-sm sm:text-base text-center mt-3 quote-popup-text-in">
          — {quote.film}
        </p>

        <p className="text-[var(--text-muted)] text-xs text-center mt-4 quote-popup-text-in">
          Today&apos;s quote · See you tomorrow
        </p>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors quote-popup-text-in"
          aria-label="Dismiss quote"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
