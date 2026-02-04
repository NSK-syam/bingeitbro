'use client';

import { useNudges } from '@/hooks';
import Link from 'next/link';

interface NudgesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Relative time helper
function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
  return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
}

export function NudgesModal({ isOpen, onClose }: NudgesModalProps) {
  const { receivedNudges, loading, markAsRead, markAllAsRead, unreadCount } = useNudges();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[85vh] bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Nudges</h2>
              <p className="text-sm text-[var(--text-muted)]">
                {unreadCount > 0 ? `${unreadCount} new` : 'No new'} reminders
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : receivedNudges.length > 0 ? (
            <div className="divide-y divide-white/5">
              {receivedNudges.map((nudge) => (
                <Link
                  key={nudge.id}
                  href={`/movie/${nudge.recommendation_id}`}
                  onClick={() => {
                    if (!nudge.is_read) markAsRead(nudge.id);
                    onClose();
                  }}
                  className={`flex items-center gap-4 p-4 hover:bg-white/5 transition-colors ${
                    !nudge.is_read ? 'bg-[var(--accent)]/5' : ''
                  }`}
                >
                  {/* Movie poster */}
                  <div className="w-12 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--bg-secondary)]">
                    {nudge.recommendation?.poster ? (
                      <img
                        src={nudge.recommendation.poster}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{nudge.from_user?.avatar || '👤'}</span>
                      <span className="font-medium text-[var(--text-primary)] truncate">
                        {nudge.from_user?.name || 'Someone'}
                      </span>
                      {!nudge.is_read && (
                        <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                      wants you to watch <span className="text-[var(--text-primary)] font-medium">{nudge.recommendation?.title || 'this movie'}</span>
                    </p>
                    {nudge.message && (
                      <p className="text-xs text-[var(--text-muted)] mt-1 italic">
                        &ldquo;{nudge.message}&rdquo;
                      </p>
                    )}
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {getRelativeTime(nudge.created_at)}
                    </p>
                  </div>

                  {/* Arrow */}
                  <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 px-6">
              <div className="text-5xl mb-4">🔔</div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                No nudges yet
              </h3>
              <p className="text-[var(--text-muted)] text-sm">
                When friends remind you to watch their recommendations, they&apos;ll appear here
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
