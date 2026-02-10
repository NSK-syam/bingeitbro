'use client';

import { useMemo } from 'react';

type ConfettiPiece = {
  left: string;
  delay: string;
  duration: string;
  rotate: string;
  hue: number;
  size: number;
  xDrift: number;
};

function todayKeyLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function BirthdayPopup({
  isOpen,
  onClose,
  username,
}: {
  isOpen: boolean;
  onClose: () => void;
  username: string;
}) {
  const pieces = useMemo(() => {
    // Deterministic per day so it doesn't jitter on rerender.
    const seed = todayKeyLocal().split('-').reduce((a, n) => a + Number(n), 0);
    const rand = (i: number) => {
      const x = Math.sin(seed * 999 + i * 1234.567) * 10000;
      return x - Math.floor(x);
    };

    return Array.from({ length: 46 }, (_, i): ConfettiPiece => {
      const r1 = rand(i * 3 + 1);
      const r2 = rand(i * 3 + 2);
      const r3 = rand(i * 3 + 3);
      const hue = Math.floor(20 + r2 * 320);
      const size = Math.floor(6 + r3 * 10);
      return {
        left: `${Math.floor(r1 * 100)}%`,
        delay: `${(r2 * 0.9).toFixed(2)}s`,
        duration: `${(1.9 + r3 * 1.6).toFixed(2)}s`,
        rotate: `${Math.floor(r1 * 260)}deg`,
        hue,
        size,
        xDrift: Math.floor(-40 + r2 * 80),
      };
    });
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-card)] p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="relative z-10 text-center">
          <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--text-muted)]">Today</p>
          <h2 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">Happy Birthday</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Happy birthday <span className="font-semibold text-[var(--text-primary)]">{username}</span>. Hope today hits like a perfect final scene.
          </p>
          <button
            onClick={onClose}
            className="mt-5 w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--bg-primary)] font-medium hover:bg-[var(--accent-hover)] transition-colors"
          >
            Let&apos;s go
          </button>
        </div>

        <div className="pointer-events-none absolute inset-0">
          {pieces.map((p, i) => (
            <span
              key={i}
              className="bib-confetti"
              style={{
                left: p.left,
                width: `${p.size}px`,
                height: `${Math.max(10, Math.floor(p.size * 1.6))}px`,
                background: `hsl(${p.hue} 90% 60%)`,
                animationDelay: p.delay,
                animationDuration: p.duration,
                transform: `translate3d(${p.xDrift}px,-20px,0) rotate(${p.rotate})`,
              }}
            />
          ))}
        </div>

        <style jsx global>{`
          @keyframes bibConfettiFall {
            0% { opacity: 0; transform: translate3d(var(--x, 0px), -20px, 0) rotate(0deg); }
            10% { opacity: 1; }
            100% { opacity: 0.95; transform: translate3d(calc(var(--x, 0px) * 0.6), 520px, 0) rotate(720deg); }
          }
          .bib-confetti{
            position:absolute;
            top:0;
            border-radius: 2px;
            filter: drop-shadow(0 6px 12px rgba(0,0,0,0.35));
            animation-name: bibConfettiFall;
            animation-timing-function: cubic-bezier(0.2, 0.75, 0.2, 1);
            animation-iteration-count: 1;
          }
          @media (prefers-reduced-motion: reduce) {
            .bib-confetti{ display:none; }
          }
        `}</style>
      </div>
    </div>
  );
}

