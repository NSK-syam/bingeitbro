'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { MOVIE_QUOTES } from '@/data/movie-quotes';

const STORAGE_KEY_PREFIX = 'bingeitbro-daily-quote';
const POPUP_DELAY_MS = 800;
const EXIT_ANIMATION_MS = 260;
const SNAP_EXIT_ANIMATION_MS = 640;

function getTodayKey(): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getStorageKey(userId: string, todayKey: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}:${todayKey}`;
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
type DismissVariant = 'normal' | 'snap';

type DailyQuoteBannerProps = {
  userId?: string | null;
};

export function DailyQuoteBanner({ userId }: DailyQuoteBannerProps) {
  const [state, setState] = useState<PopupState>('idle');
  const [dismissVariant, setDismissVariant] = useState<DismissVariant>('normal');
  const closeTimerRef = useRef<number | null>(null);

  const quote = useMemo(() => getQuoteForToday(), []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!userId) return undefined;

    const today = getTodayKey();
    const storageKey = getStorageKey(userId, today);
    const alreadyShown = localStorage.getItem(storageKey);
    if (alreadyShown) return undefined;

    const openTimer = window.setTimeout(() => {
      setState('showing');
      localStorage.setItem(storageKey, '1');
      const settleTimer = window.setTimeout(() => setState('visible'), 70);
      closeTimerRef.current = settleTimer;
    }, POPUP_DELAY_MS);

    return () => {
      window.clearTimeout(openTimer);
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [userId]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (state !== 'showing' && state !== 'visible') return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setDismissVariant('normal');
      setState((prev) => {
        if (prev !== 'showing' && prev !== 'visible') return prev;
        return 'closing';
      });
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = window.setTimeout(() => {
        setState('idle');
      }, EXIT_ANIMATION_MS);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [state]);

  const markSeenToday = () => {
    if (typeof window === 'undefined') return;
    if (!userId) return;
    const today = getTodayKey();
    localStorage.setItem(getStorageKey(userId, today), '1');
  };

  const handleDismiss = (variant: DismissVariant = 'normal') => {
    if (state !== 'visible' && state !== 'showing') return;
    markSeenToday();
    setDismissVariant(variant);
    setState('closing');
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    const closeMs = variant === 'snap' ? SNAP_EXIT_ANIMATION_MS : EXIT_ANIMATION_MS;
    closeTimerRef.current = window.setTimeout(() => {
      setState('idle');
    }, closeMs);
  };

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    handleDismiss('normal');
  };

  if (!userId || state === 'idle') return null;

  const isClosing = state === 'closing';
  const isSnapClosing = isClosing && dismissVariant === 'snap';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Daily movie quote"
      onClick={handleBackdropClick}
    >
      <div
        className={`absolute inset-0 bg-black/78 backdrop-blur-[3px] ${
          isClosing ? 'daily-quote-backdrop-out' : 'daily-quote-backdrop-in'
        }`}
      />

      <div
        className={`daily-quote-card relative w-full max-w-4xl rounded-[30px] border border-white/14 bg-[#0a0b15]/95 px-6 py-8 sm:px-12 sm:py-12 ${
          isSnapClosing ? 'daily-quote-card-snap-out' : isClosing ? 'daily-quote-card-out' : 'daily-quote-card-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`daily-quote-snap-dust absolute inset-0 rounded-[30px] ${isSnapClosing ? 'daily-quote-snap-dust-on' : ''}`}
          aria-hidden
        />

        <button
          type="button"
          onClick={() => handleDismiss('snap')}
          className="daily-quote-close absolute right-5 top-5 sm:right-7 sm:top-7 inline-flex h-11 w-11 items-center justify-center rounded-full text-[#6f7387] transition-colors hover:text-[#cfd2df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          aria-label="Dismiss quote"
        >
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex justify-center">
          <span className="daily-quote-icon-shell inline-flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px]" aria-hidden>
            <Image
              src="/bib-icon.svg"
              alt=""
              width={84}
              height={84}
              className="daily-quote-logo h-[84px] w-[84px] object-contain"
              priority
            />
          </span>
        </div>

        <blockquote className="mt-8 text-center">
          <p className="daily-quote-line text-[clamp(2rem,4vw,4rem)] font-medium italic tracking-[-0.01em] text-[#f3f4f8]">
            &ldquo;{quote.quote}&rdquo;
          </p>
          <footer className="daily-quote-film mt-4 text-[clamp(1.3rem,2.1vw,2.2rem)] font-medium text-[#777d95]">
            — {quote.film}
          </footer>
        </blockquote>

        <p className="daily-quote-sub mt-8 text-center text-base text-[#666c84]">
          Today&apos;s quote · See you tomorrow
        </p>
      </div>
    </div>
  );
}
