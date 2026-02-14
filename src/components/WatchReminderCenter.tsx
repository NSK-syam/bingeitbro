'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import {
  pollDueWatchReminders,
  triggerWatchReminderEmailDispatch,
  type WatchReminder,
} from '@/lib/supabase-rest';
import { getWatchReminderOpenPath } from '@/lib/watch-reminder-path';

type ToastReminder = WatchReminder & { toastId: string };

const POLL_INTERVAL_MS = 45_000;
const TOAST_TTL_MS = 45_000;

function makeToastId(reminder: WatchReminder): string {
  return `${reminder.id}-${Date.now()}`;
}

export function WatchReminderCenter() {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<ToastReminder[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const permissionRequestedRef = useRef(false);
  const lastEmailDispatchMsRef = useRef(0);

  useEffect(() => {
    setToasts([]);
    seenIdsRef.current = new Set();
    permissionRequestedRef.current = false;
    lastEmailDispatchMsRef.current = 0;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const pushToast = (reminders: WatchReminder[]) => {
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

    const showBrowserNotifications = async (reminders: WatchReminder[]) => {
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
        const openPath = getWatchReminderOpenPath(reminder.movieId);
        try {
          const notification = new Notification('Movie reminder', {
            body: `Time to watch ${reminder.movieTitle}`,
            icon: '/bib-icon.svg',
            tag: `watch-reminder-${reminder.id}`,
          });
          notification.onclick = () => {
            if (typeof window !== 'undefined') {
              window.focus();
              window.location.href = openPath;
            }
          };
        } catch {
          // ignore
        }
      });
    };

    const poll = async () => {
      try {
        const now = Date.now();
        if (now - lastEmailDispatchMsRef.current > 2 * 60_000) {
          lastEmailDispatchMsRef.current = now;
          await triggerWatchReminderEmailDispatch(25);
        }

        const due = await pollDueWatchReminders(5);
        if (cancelled || due.length === 0) return;
        pushToast(due);
        await showBrowserNotifications(due);
      } catch {
        // ignore
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
    <div className="fixed bottom-4 right-4 z-[90] flex w-[min(92vw,360px)] flex-col gap-3">
      {toasts.map((toast) => (
        <div key={toast.toastId} className="rounded-xl border border-blue-400/25 bg-[var(--bg-card)]/95 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.14em] text-blue-300">Watch reminder</p>
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
              href={getWatchReminderOpenPath(toast.movieId)}
              prefetch={false}
              className="inline-flex items-center rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--bg-primary)]"
            >
              Open title
            </Link>
            <button
              onClick={() => dismiss(toast.toastId)}
              className="inline-flex items-center rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[var(--text-secondary)]"
            >
              Later
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
