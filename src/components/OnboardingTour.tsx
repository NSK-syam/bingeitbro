'use client';

import { useEffect, useMemo, useState } from 'react';

const STEPS = [
  {
    title: 'Find the vibe fast',
    body: 'Use search + filters to jump to Telugu, year, or your mood. Trending is your shortcut to what people are actually watching.',
    icon: '🔎',
    tip: 'Try: Language filter 🎇 Telugu',
  },
  {
    title: 'Add your own picks',
    body: 'Tap Add to drop a recommendation with your context. That note is what makes your rec valuable.',
    icon: '✍️',
    tip: 'A short why-to-watch is enough.',
  },
  {
    title: 'Send to friends',
    body: 'On any card, hit Send to share a title directly. It lands in their Friends inbox.',
    icon: '📩',
    tip: 'Send works best with a personal note.',
  },
  {
    title: 'Remind with Nudges',
    body: 'Use the bell icon to nudge friends to watch your picks or see reminders they sent you.',
    icon: '🔔',
    tip: 'Gentle nudges = more watches.',
  },
  {
    title: 'Share your profile',
    body: 'Open the profile menu and share on WhatsApp so friends can follow your taste instantly.',
    icon: '📣',
    tip: 'Invite the group and build a circle.',
  },
] as const;

interface OnboardingTourProps {
  isOpen: boolean;
  onComplete: () => void;
}

export function OnboardingTour({ isOpen, onComplete }: OnboardingTourProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (isOpen) setStep(0);
  }, [isOpen]);

  const current = useMemo(() => STEPS[step], [step]);

  if (!isOpen) return null;

  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onComplete} />

      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-[var(--bg-card)] shadow-2xl">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.2),_transparent_60%)]" />

        <div className="relative p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-xs font-semibold text-[var(--text-muted)]">
              Step {step + 1} of {STEPS.length}
            </div>
            <button
              type="button"
              onClick={onComplete}
              className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Skip
            </button>
          </div>

          <div className="mt-6 flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg-secondary)] text-2xl shadow-inner">
              {current.icon}
            </div>
            <div>
              <h3 className="text-2xl font-bold text-[var(--text-primary)]">{current.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{current.body}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">{current.tip}</p>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {STEPS.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2.5 rounded-full transition-all ${idx === step ? 'w-8 bg-[var(--accent)]' : 'w-2.5 bg-white/15'}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((prev) => Math.max(0, prev - 1))}
                  className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-white/5"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => (isLast ? onComplete() : setStep((prev) => Math.min(prev + 1, STEPS.length - 1)))}
                className="rounded-full bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-[var(--bg-primary)] hover:bg-[var(--accent-hover)]"
              >
                {isLast ? 'Start exploring' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
