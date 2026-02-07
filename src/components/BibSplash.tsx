'use client';

import { useEffect, useState } from 'react';

interface BibSplashProps {
  enabled?: boolean;
}

export function BibSplash({ enabled = true }: BibSplashProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    if (typeof window === 'undefined') return;
    setVisible(true);

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReduced ? 800 : 2400;

    const playClap = async () => {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const bufferSize = Math.floor(ctx.sampleRate * 0.06);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i += 1) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const gain = ctx.createGain();
        gain.gain.value = 0.15;
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

        noise.connect(gain).connect(ctx.destination);
        noise.start();
        noise.stop(ctx.currentTime + 0.08);

        setTimeout(() => {
          ctx.close().catch(() => undefined);
        }, 300);
      } catch {
        // Ignore audio failures (autoplay restrictions or unsupported APIs)
      }
    };

    playClap();

    const timer = window.setTimeout(() => {
      setVisible(false);
    }, duration);

    return () => window.clearTimeout(timer);
  }, [enabled]);

  if (!visible) return null;

  return (
    <div className="bib-splash" aria-hidden="true">
      <div className="bib-splash-card">
        <div className="bib-clapper">
          <div className="bib-clapper-top">
            <div className="bib-clapper-stripes" />
          </div>
          <div className="bib-clapper-body">
            <div className="bib-clapper-title">BiB</div>
            <div className="bib-clapper-sub">Binge it bro</div>
            <div className="bib-clapper-meta">
              <span>WELCOME</span>
              <span>TAKE 01</span>
              <span>ROLL 07</span>
            </div>
          </div>
        </div>
        <p className="bib-splash-tagline">Friends recommend, you watch.</p>
      </div>
    </div>
  );
}
