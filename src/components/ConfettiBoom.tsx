'use client';

import { useEffect, useMemo } from 'react';

type Piece = {
  hue: number;
  size: number;
  dx: number;
  dy: number;
  rot: number;
  delay: number;
  dur: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function ConfettiBoom({
  isOpen,
  onDone,
}: {
  isOpen: boolean;
  onDone?: () => void;
}) {
  const pieces = useMemo(() => {
    const count = 140;
    const list: Piece[] = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 0.6);
      const dx = Math.cos(a) * (140 + radius * 520);
      const dy = Math.sin(a) * (90 + radius * 320) - 120;
      const hue = Math.floor(Math.random() * 360);
      const size = Math.floor(6 + Math.random() * 12);
      const rot = Math.floor(Math.random() * 720);
      const delay = Math.random() * 0.08;
      const dur = 1.8 + Math.random() * 0.7;
      list.push({
        hue,
        size,
        dx,
        dy,
        rot,
        delay,
        dur,
      });
    }
    return list;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (!onDone) return;
    const t = window.setTimeout(onDone, 2200);
    return () => window.clearTimeout(t);
  }, [isOpen, onDone]);

  if (!isOpen) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
      <div className="absolute inset-0 bg-black/0" />
      <div className="absolute left-1/2 top-[18%] -translate-x-1/2">
        <div className="bib-boom-ring" />
      </div>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="bib-boom-piece"
          style={{
            width: `${p.size}px`,
            height: `${clamp(Math.floor(p.size * 1.6), 10, 26)}px`,
            background: `hsl(${p.hue} 92% 60%)`,
            ['--dx' as any]: `${p.dx}px`,
            ['--dy' as any]: `${p.dy}px`,
            ['--rot' as any]: `${p.rot}deg`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}

      <style jsx global>{`
        @keyframes bibBoomPiece {
          0% { opacity: 0; transform: translate3d(0,0,0) rotate(0deg) scale(0.9); }
          10% { opacity: 1; }
          55% { opacity: 1; transform: translate3d(var(--dx), var(--dy), 0) rotate(var(--rot)) scale(1); }
          100% { opacity: 0; transform: translate3d(calc(var(--dx) * 0.7), calc(var(--dy) + 560px), 0) rotate(calc(var(--rot) * 1.2)) scale(1); }
        }
        @keyframes bibBoomRing {
          0% { opacity: 0; transform: scale(0.2); }
          15% { opacity: 0.9; }
          100% { opacity: 0; transform: scale(1.25); }
        }
        .bib-boom-ring {
          width: 520px;
          height: 520px;
          border-radius: 9999px;
          background: radial-gradient(circle at center, rgba(245,158,11,0.22) 0%, rgba(245,158,11,0.08) 35%, rgba(0,0,0,0) 70%);
          filter: blur(0.5px);
          animation: bibBoomRing 1.2s ease-out 1;
        }
        .bib-boom-piece {
          position: absolute;
          left: 50%;
          top: 18%;
          border-radius: 2px;
          filter: drop-shadow(0 10px 18px rgba(0,0,0,0.35));
          transform: translate3d(0,0,0);
          animation-name: bibBoomPiece;
          animation-timing-function: cubic-bezier(0.2, 0.75, 0.2, 1);
          animation-iteration-count: 1;
          will-change: transform, opacity;
        }
        @media (prefers-reduced-motion: reduce) {
          .bib-boom-piece, .bib-boom-ring { display: none; }
        }
      `}</style>
    </div>
  );
}

