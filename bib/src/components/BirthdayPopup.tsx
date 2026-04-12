'use client';

export function BirthdayPopup({
  isOpen,
  onClose,
  username,
}: {
  isOpen: boolean;
  onClose: () => void;
  username: string;
}) {
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
      </div>
    </div>
  );
}
