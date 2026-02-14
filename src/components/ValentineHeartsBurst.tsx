'use client';

import { useMemo } from 'react';

type HeartParticle = {
  id: string;
  left: number;
  size: number;
  duration: number;
  delay: number;
  sway: number;
  rotate: number;
  opacity: number;
  drift: number;
  startY: number;
  endY: number;
};

const HEARTS = ['❤', '💖', '💕', '💗', '💞'];
const TOTAL_HEARTS = 34;

function createParticles(seed: number): HeartParticle[] {
  let s = seed || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  return Array.from({ length: TOTAL_HEARTS }, (_, i) => ({
    id: `${seed}-${i}`,
    left: rand() * 100,
    size: 11 + rand() * 16,
    duration: 6400 + rand() * 5600,
    delay: -(rand() * 10000),
    sway: 8 + rand() * 20,
    rotate: -18 + rand() * 36,
    opacity: 0.4 + rand() * 0.45,
    drift: -32 + rand() * 64,
    startY: -140 - rand() * 70,
    endY: 106 + rand() * 18,
  }));
}

export function ValentineHeartsBurst({ active }: { active: boolean }) {
  const particles = useMemo(() => createParticles(214748364), []);
  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[170] overflow-hidden" aria-hidden>
      {particles.map((p, idx) => (
        <span
          key={p.id}
          className="bib-heart-particle absolute top-0 will-change-transform select-none"
          style={{
            left: `${p.left}%`,
            opacity: p.opacity,
            transform: 'translate3d(0, 0, 0)',
            animation: `bib-heart-rain ${p.duration}ms linear ${p.delay}ms infinite`,
            ['--bib-heart-start-x' as string]: `${p.drift * -0.25}px`,
            ['--bib-heart-end-x' as string]: `${p.drift}px`,
            ['--bib-heart-start-y' as string]: `${p.startY}vh`,
            ['--bib-heart-end-y' as string]: `${p.endY}vh`,
          }}
        >
          <span
            className="bib-heart-inner block"
            style={{
              fontSize: `${p.size}px`,
              filter: 'drop-shadow(0 2px 7px rgba(244,63,94,0.32))',
              animation: [
                `bib-heart-sway ${1350 + (idx % 7) * 180}ms ease-in-out ${p.delay}ms infinite alternate`,
                `bib-heart-spin ${2300 + (idx % 6) * 240}ms linear ${p.delay}ms infinite`,
              ].join(', '),
              ['--bib-heart-sway' as string]: `${idx % 2 === 0 ? p.sway : -p.sway}px`,
              ['--bib-heart-rotate' as string]: `${p.rotate}deg`,
            }}
          >
            {HEARTS[idx % HEARTS.length]}
          </span>
        </span>
      ))}

      <style jsx global>{`
        @keyframes bib-heart-rain {
          0% {
            transform: translate3d(var(--bib-heart-start-x), var(--bib-heart-start-y), 0) scale(0.8);
          }
          100% {
            transform: translate3d(var(--bib-heart-end-x), var(--bib-heart-end-y), 0) scale(1.08);
          }
        }
        @keyframes bib-heart-sway {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(var(--bib-heart-sway));
          }
        }
        @keyframes bib-heart-spin {
          0% {
            rotate: calc(var(--bib-heart-rotate) * -1);
          }
          100% {
            rotate: var(--bib-heart-rotate);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .bib-heart-particle,
          .bib-heart-inner {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
