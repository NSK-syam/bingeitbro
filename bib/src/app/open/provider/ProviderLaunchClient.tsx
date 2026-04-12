'use client';

import Link from 'next/link';
import { useEffect } from 'react';

type ProviderLaunchClientProps = {
  appUrl: string;
  browserUrl: string;
  label: string;
};

function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod|android/i.test(navigator.userAgent || '');
}

export function ProviderLaunchClient({ appUrl, browserUrl, label }: ProviderLaunchClientProps) {
  useEffect(() => {
    if (!browserUrl && !appUrl) return;

    if (!isMobileBrowser() || !appUrl || appUrl === browserUrl) {
      if (browserUrl) {
        window.location.replace(browserUrl);
      }
      return;
    }

    const fallbackTimer = window.setTimeout(() => {
      window.location.replace(browserUrl);
    }, 1200);

    const clearFallback = () => window.clearTimeout(fallbackTimer);

    const onVisibilityChange = () => {
      if (document.hidden) clearFallback();
    };

    window.addEventListener('pagehide', clearFallback, { once: true });
    window.addEventListener('blur', clearFallback, { once: true });
    document.addEventListener('visibilitychange', onVisibilityChange, { once: true });

    window.location.href = appUrl;

    return () => {
      clearFallback();
      window.removeEventListener('pagehide', clearFallback);
      window.removeEventListener('blur', clearFallback);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [appUrl, browserUrl]);

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[var(--bg-card)] p-8 text-center shadow-2xl shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--accent)]">Opening provider</p>
        <h1 className="mt-4 text-3xl font-semibold">Launching {label}</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
          If the app is installed, your device should open it now. If not, continue in the browser.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href={browserUrl || '/'}
            className="inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-medium text-[var(--bg-primary)] transition hover:bg-[var(--accent-hover)]"
          >
            Continue in browser
          </a>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-white/5 hover:text-[var(--text-primary)]"
          >
            Back to BiB
          </Link>
        </div>
      </div>
    </main>
  );
}

