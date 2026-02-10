'use client';

import { useMemo } from 'react';

type Balloon = {
  left: string;
  delay: string;
  duration: string;
  scale: number;
  hue: number;
  sway: number;
};

function todayKeyLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function BalloonRain({ isOn }: { isOn: boolean }) {
  const balloons = useMemo(() => {
    const seed = todayKeyLocal().split('-').reduce((a, n) => a + Number(n), 0);
    const rand = (i: number) => {
      const x = Math.sin(seed * 911 + i * 987.123) * 10000;
      return x - Math.floor(x);
    };

    return Array.from({ length: 18 }, (_, i): Balloon => {
      const r1 = rand(i * 3 + 1);
      const r2 = rand(i * 3 + 2);
      const r3 = rand(i * 3 + 3);
      return {
        left: `${Math.floor(r1 * 100)}%`,
        delay: `${(r2 * 3.5).toFixed(2)}s`,
        duration: `${(7.5 + r3 * 6.5).toFixed(2)}s`,
        scale: 0.7 + r2 * 0.65,
        hue: Math.floor(10 + r3 * 340),
        sway: Math.floor(18 + r1 * 46),
      };
    });
  }, []);

  if (!isOn) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[86] overflow-hidden">
      {balloons.map((b, i) => (
        <span
          key={i}
          className="bib-balloon"
          style={{
            left: b.left,
            animationDelay: b.delay,
            animationDuration: b.duration,
            transform: `translate3d(0,-120px,0) scale(${b.scale})`,
            ['--hue' as any]: b.hue,
            ['--sway' as any]: `${b.sway}px`,
          }}
        />
      ))}

      <style jsx global>{`
        @keyframes bibBalloonFall {
          0% { transform: translate3d(calc(var(--sway) * -0.2), -140px, 0) scale(var(--scale, 1)); opacity: 0; }
          6% { opacity: 0.95; }
          100% { transform: translate3d(var(--sway), 110vh, 0) scale(var(--scale, 1)); opacity: 0.9; }
        }
        @keyframes bibBalloonSway {
          0%, 100% { margin-left: calc(var(--sway) * -0.55); }
          50% { margin-left: calc(var(--sway) * 0.55); }
        }
        .bib-balloon {
          position: absolute;
          top: 0;
          width: 42px;
          height: 56px;
          border-radius: 9999px;
          background:
            radial-gradient(circle at 30% 28%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 28%),
            radial-gradient(circle at 50% 70%, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 50%),
            hsl(var(--hue) 85% 58%);
          box-shadow: 0 18px 40px rgba(0,0,0,0.35);
          animation-name: bibBalloonFall, bibBalloonSway;
          animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1), ease-in-out;
          animation-iteration-count: infinite, infinite;
          animation-direction: normal, alternate;
        }
        .bib-balloon::after {
          content: '';
          position: absolute;
          left: 50%;
          bottom: -8px;
          width: 10px;
          height: 10px;
          transform: translateX(-50%) rotate(45deg);
          background: hsl(var(--hue) 85% 52%);
          border-radius: 2px;
          filter: brightness(0.95);
        }
        .bib-balloon::before {
          content: '';
          position: absolute;
          left: 50%;
          top: 56px;
          width: 1.5px;
          height: 120px;
          transform: translateX(-50%);
          background: linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0));
          opacity: 0.55;
        }
        @media (prefers-reduced-motion: reduce) {
          .bib-balloon { display: none; }
        }
      `}</style>
    </div>
  );
}

