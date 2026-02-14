'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import {
  pollDueFriendRecommendationReminders,
  type FriendRecommendationReminder,
} from '@/lib/supabase-rest';

type ToastReminder = FriendRecommendationReminder & { toastId: string };

const POLL_INTERVAL_MS = 45_000;
const TOAST_TTL_MS = 45_000;

function makeToastId(reminder: FriendRecommendationReminder): string {
  return `${reminder.id}-${Date.now()}`;
}

function getMoviePath(reminder: FriendRecommendationReminder): string {
  if (reminder.isTmdb) {
    return `/movie/tmdb-${encodeURIComponent(reminder.movieId)}`;
  }
  return `/movie/${encodeURIComponent(reminder.movieId)}`;
}

export function FriendRecommendationReminderCenter() {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<ToastReminder[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const permissionRequestedRef = useRef(false);

  useEffect(() => {
    setToasts([]);
    seenIdsRef.current = new Set();
    permissionRequestedRef.current = false;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const pushToast = (reminders: FriendRecommendationReminder[]) => {
      if (reminders.length === 0) return;
      setToasts((prev) => {
        const next = [...prev];
        reminders.forEach((reminder) => {
          if (seenIdsRef.current.has(reminder.id)) return;
          seenIdsRef.current.add(reminder.id);
          next.unshift({ ...reminder, toastId: makeToastId(reminder) });
        });
        return next.slice(0, 5);
      });
    };

    const showBrowserNotifications = async (reminders: FriendRecommendationReminder[]) => {
      if (typeof window === 'undefined' || reminders.length === 0) return;
      if (!('Notification' in window)) return;

      let permission = Notification.permission;
      if (permission === 'default' && !permissionRequestedRef.current) {
        permissionRequestedRef.current = true;
        try {
          permission = await Notification.requestPermission();
        } catch {
          permission = Notification.permission;
        }
      }
      if (permission !== 'granted') return;

      reminders.forEach((reminder) => {
        const path = getMoviePath(reminder);
        try {
          const notification = new Notification('Friend reminder', {
            body: `${reminder.senderName} reminded you to watch ${reminder.movieTitle}`,
            icon: '/bib-icon.svg',
            tag: `friend-recommendation-reminder-${reminder.id}`,
          });
          notification.onclick = () => {
            if (typeof window !== 'undefined') {
              window.focus();
              window.location.href = path;
            }
          };
        } catch {
          // ignore browser notification failures
        }
      });
    };

    const poll = async () => {
      try {
        const due = await pollDueFriendRecommendationReminders(5);
        if (cancelled || due.length === 0) return;
        pushToast(due);
        await showBrowserNotifications(due);
      } catch {
        // ignore polling failures
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user?.id]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.toastId !== toast.toastId));
      }, TOAST_TTL_MS),
    );

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [toasts]);

  const dismiss = (toastId: string) => {
    setToasts((prev) => prev.filter((toast) => toast.toastId !== toastId));
  };

  if (!user || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[89] flex w-[min(92vw,360px)] flex-col gap-3">
      {toasts.map((toast) => {
        const path = getMoviePath(toast);
        return (
          <div key={toast.toastId} className="rounded-xl border border-amber-300/25 bg-[var(--bg-card)]/95 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.14em] text-amber-200">Friend reminder</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)] truncate">{toast.senderName}</p>
                <p className="mt-1 text-sm font-semibold text-[var(--text-primary)] truncate">{toast.movieTitle}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Scheduled for {new Date(toast.remindAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => dismiss(toast.toastId)}
                className="h-7 w-7 rounded-full text-[var(--text-muted)] hover:bg-white/10"
                aria-label="Dismiss reminder"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Link
                href={path}
                prefetch={false}
                className="inline-flex items-center rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--bg-primary)]"
              >
                Open movie
              </Link>
              <button
                onClick={() => dismiss(toast.toastId)}
                className="inline-flex items-center rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[var(--text-secondary)]"
              >
                Later
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
