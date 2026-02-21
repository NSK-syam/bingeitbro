'use client';

import { useEffect, useRef } from 'react';
import { ADSENSE_CLIENT_ID, ADSENSE_SCRIPT_SRC } from '@/lib/adsense';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const DISPLAY_SLOT_ID = (process.env.NEXT_PUBLIC_ADSENSE_DISPLAY_SLOT || '').trim();

export function AdDisplayUnit({ className = '' }: { className?: string }) {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!DISPLAY_SLOT_ID) return;
    if (pushedRef.current) return;

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src^="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]`,
    );

    if (!existingScript) {
      const script = document.createElement('script');
      script.async = true;
      script.src = ADSENSE_SCRIPT_SRC;
      script.crossOrigin = 'anonymous';
      script.setAttribute('data-bib-adsense', ADSENSE_CLIENT_ID);
      document.head.appendChild(script);
    }

    const pushAd = (): boolean => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        pushedRef.current = true;
        return true;
      } catch {
        return false;
      }
    };

    if (pushAd()) return;

    let attempts = 0;
    const intervalId = window.setInterval(() => {
      attempts += 1;
      if (pushAd() || attempts >= 30) {
        window.clearInterval(intervalId);
      }
    }, 500);

    return () => window.clearInterval(intervalId);
  }, []);

  if (!DISPLAY_SLOT_ID) return null;

  return (
    <div className={`rounded-2xl border border-white/10 bg-[var(--bg-secondary)]/75 p-3 ${className}`}>
      <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Sponsored</p>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={DISPLAY_SLOT_ID}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
