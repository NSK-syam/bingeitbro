'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthProvider';
import {
  deleteWatchReminder,
  getWatchReminderForMovie,
  upsertWatchReminder,
  type WatchReminder,
} from '@/lib/supabase-rest';
import { formatLocalDateTimeInput, getResolvedTimeZone, parseLocalDateTimeInput } from '@/lib/local-datetime';

interface ScheduleWatchButtonProps {
  movieId: string;
  movieTitle: string;
  moviePoster?: string;
  movieYear?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

function toLocalInputValue(dateIso: string): string {
  const date = new Date(dateIso);
  return formatLocalDateTimeInput(date);
}

function fromLocalInputValue(value: string): string | null {
  const date = parseLocalDateTimeInput(value);
  if (!date) return null;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getDefaultInputValue(): string {
  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  return toLocalInputValue(nextHour.toISOString());
}

function formatReminder(value: string): string {
  return new Date(value).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ScheduleWatchButton({
  movieId,
  movieTitle,
  moviePoster,
  movieYear,
  size = 'md',
  showLabel = false,
}: ScheduleWatchButtonProps) {
  const { user } = useAuth();
  const [reminder, setReminder] = useState<WatchReminder | null>(null);
  const [loadingReminder, setLoadingReminder] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [remindAtInput, setRemindAtInput] = useState(getDefaultInputValue);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userTimeZone = useMemo(() => getResolvedTimeZone(), []);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setReminder(null);
      return;
    }

    const load = async () => {
      setLoadingReminder(true);
      try {
        const existing = await getWatchReminderForMovie(movieId);
        if (!cancelled) {
          setReminder(existing);
          if (existing?.remindAt) {
            setRemindAtInput(toLocalInputValue(existing.remindAt));
          } else {
            setRemindAtInput(getDefaultInputValue());
          }
        }
      } catch {
        if (!cancelled) {
          setReminder(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingReminder(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [movieId, user?.id]);

  const scheduledLabel = useMemo(() => {
    if (!reminder?.remindAt) return null;
    return formatReminder(reminder.remindAt);
  }, [reminder?.remindAt]);

  const sizeClasses = {
    sm: 'w-7 h-7 text-sm',
    md: 'w-9 h-9 text-base',
    lg: 'w-11 h-11 text-lg',
  };

  const handleOpen = () => {
    setError(null);
    if (reminder?.remindAt) {
      setRemindAtInput(toLocalInputValue(reminder.remindAt));
    } else {
      setRemindAtInput(getDefaultInputValue());
    }
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!user?.id) {
      setError('Please sign in to schedule reminders.');
      return;
    }
    const remindAtIso = fromLocalInputValue(remindAtInput);
    if (!remindAtIso) {
      setError('Pick a valid date and time.');
      return;
    }
    if (new Date(remindAtIso).getTime() < Date.now()) {
      setError('Reminder must be in the future.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await upsertWatchReminder({
        movieId,
        movieTitle,
        moviePoster: moviePoster || null,
        movieYear: movieYear ?? null,
        remindAt: remindAtIso,
      });
      setReminder(saved);
      setIsOpen(false);

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save reminder.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user?.id) {
      setError('Please sign in to manage reminders.');
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteWatchReminder(movieId);
      setReminder(null);
      setIsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove reminder.');
    } finally {
      setDeleting(false);
    }
  };

  const disabled = loadingReminder || saving || deleting;
  const baseStateClass = reminder
    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
    : 'bg-[var(--bg-primary)]/80 text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]';
  const labeledStateClass = reminder
    ? 'bg-indigo-500 text-white border border-indigo-300/55 shadow-lg shadow-indigo-500/35'
    : 'bg-violet-500/20 text-violet-100 border border-violet-300/40 hover:bg-violet-500/30 hover:text-white';

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleOpen();
        }}
        disabled={loadingReminder}
        className={[
          sizeClasses[size],
          showLabel ? labeledStateClass : baseStateClass,
          'backdrop-blur-sm rounded-full flex items-center justify-center gap-1.5 transition-all duration-200',
          showLabel ? 'px-3 w-auto' : '',
          loadingReminder ? 'opacity-60 cursor-wait' : '',
        ].join(' ')}
        title={reminder ? `Scheduled: ${scheduledLabel || ''}` : 'Schedule when to watch'}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z"
          />
        </svg>
        {showLabel && (
          <span className="text-sm font-medium">
            {reminder ? (scheduledLabel ? `Scheduled · ${scheduledLabel}` : 'Scheduled') : 'Schedule Watch'}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[var(--bg-card)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Watch Reminder</p>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mt-1">{movieTitle}</h3>
                {scheduledLabel && (
                  <p className="text-sm text-blue-300 mt-1">Current reminder: {scheduledLabel}</p>
                )}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-white/10 text-[var(--text-muted)]"
                aria-label="Close schedule modal"
              >
                ✕
              </button>
            </div>

            <div className="mt-4">
              <label className="block text-sm text-[var(--text-secondary)] mb-2">Date & time</label>
              <input
                type="datetime-local"
                value={remindAtInput}
                onChange={(e) => setRemindAtInput(e.target.value)}
                min={getDefaultInputValue()}
                className="w-full rounded-xl border border-white/10 bg-[var(--bg-secondary)] px-3 py-2.5 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <p className="text-xs text-[var(--text-muted)] mt-2">
                We will remind you at this time on this device.
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Your timezone: {userTimeZone}</p>
              {error && (
                <p className="text-sm text-red-400 mt-3">{error}</p>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                onClick={handleDelete}
                disabled={disabled || !reminder}
                className="px-4 py-2 rounded-lg border border-red-500/30 text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Remove
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsOpen(false)}
                  disabled={disabled}
                  className="px-4 py-2 rounded-lg border border-white/10 text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={disabled || !user}
                  className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg-primary)] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : reminder ? 'Reschedule' : 'Save reminder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
