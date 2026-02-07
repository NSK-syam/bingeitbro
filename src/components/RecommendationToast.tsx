'use client';

import { useEffect } from 'react';

interface RecommendationToastProps {
  senderName: string;
  movieTitle: string;
  count: number;
  onClose: () => void;
  onAction?: () => void;
}

export function RecommendationToast({
  senderName,
  movieTitle,
  count,
  onClose,
  onAction,
}: RecommendationToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => onClose(), 7000);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  const headline = count > 1
    ? `${senderName} sent ${count} recommendations`
    : `${senderName} sent a recommendation`;

  const detail = count > 1
    ? `Latest: ${movieTitle}`
    : movieTitle;

  return (
    <div className="fixed bottom-6 right-6 z-[70] w-[min(92vw,360px)]">
      <div className="rounded-2xl border border-white/10 bg-[var(--bg-card)] shadow-2xl backdrop-blur">
        <div className="flex items-start gap-3 p-4">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center text-lg">
            🎬
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{headline}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1 truncate">{detail}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
        {onAction && (
          <button
            onClick={onAction}
            className="w-full text-sm font-medium text-[var(--bg-primary)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors rounded-b-2xl py-2"
          >
            View recommendations
          </button>
        )}
      </div>
    </div>
  );
}
