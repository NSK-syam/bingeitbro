'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  defaultNotificationPreferences,
  normalizeNotificationPreferences,
  notificationPreferenceOptions,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from '@/lib/notification-preferences';
import { resolveSupabaseAccessToken } from '@/lib/supabase-rest';
import { useAuth } from './AuthProvider';

type MessageTone = 'success' | 'error' | 'info';

type StatusMessage = {
  tone: MessageTone;
  text: string;
};

type NotificationPreferencesPayload = {
  preferences?: Partial<NotificationPreferences>;
  message?: string;
};

async function requestNotificationPreferences(
  accessToken?: string | null,
  options?: { method?: 'GET' | 'PATCH'; preferences?: Partial<NotificationPreferences> },
): Promise<NotificationPreferences> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const normalizedAccessToken = accessToken?.trim() || '';
  if (normalizedAccessToken) {
    headers.Authorization = `Bearer ${normalizedAccessToken}`;
  }

  const response = await fetch('/api/notification-preferences', {
    method: options?.method ?? 'GET',
    credentials: 'include',
    headers,
    body: options?.method === 'PATCH'
      ? JSON.stringify({ preferences: options.preferences ?? {} })
      : undefined,
  });
  const payload = (await response.json().catch(() => null)) as NotificationPreferencesPayload | null;
  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to load notification preferences.');
  }
  return normalizeNotificationPreferences(payload?.preferences);
}

export function NotificationPreferencesCard() {
  const { session } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [savingPreferenceKey, setSavingPreferenceKey] = useState<NotificationPreferenceKey | null>(null);
  const [message, setMessage] = useState<StatusMessage | null>(null);

  const resolveAccessToken = useCallback(async () => {
    return (await resolveSupabaseAccessToken()) || session?.access_token?.trim() || '';
  }, [session?.access_token, session?.user?.id]);

  const loadPreferences = useCallback(async () => {
    const accessToken = await resolveAccessToken();
    if (!accessToken && !session?.user?.id) {
      setPreferences(defaultNotificationPreferences);
      setPreferencesLoading(false);
      return;
    }

    setPreferencesLoading(true);
    try {
      const nextPreferences = await requestNotificationPreferences(accessToken);
      setPreferences(nextPreferences);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Failed to load notification settings.',
      });
    } finally {
      setPreferencesLoading(false);
    }
  }, [resolveAccessToken, session?.user?.id]);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const handleTogglePreference = async (key: NotificationPreferenceKey) => {
    const accessToken = await resolveAccessToken();
    if (!accessToken && !session?.user?.id) {
      setMessage({
        tone: 'error',
        text: 'Sign in again to update notification settings.',
      });
      return;
    }

    const nextValue = !preferences[key];
    const previousPreferences = preferences;
    setSavingPreferenceKey(key);
    setMessage(null);
    setPreferences((current) => ({
      ...current,
      [key]: nextValue,
    }));

    try {
      const nextPreferences = await requestNotificationPreferences(accessToken, {
        method: 'PATCH',
        preferences: { [key]: nextValue },
      });
      setPreferences(nextPreferences);
      setMessage({
        tone: 'success',
        text: `${notificationPreferenceOptions.find((option) => option.key === key)?.label ?? 'Notification'} alerts ${nextPreferences[key] ? 'enabled' : 'disabled'}.`,
      });
    } catch (error) {
      setPreferences(previousPreferences);
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Failed to update notification settings.',
      });
    } finally {
      setSavingPreferenceKey(null);
    }
  };

  const messageClasses = message?.tone === 'error'
    ? 'border-red-400/25 bg-red-500/10 text-red-200'
    : message?.tone === 'success'
      ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
      : 'border-sky-400/20 bg-sky-500/10 text-sky-100';

  return (
    <div className="bg-[var(--bg-card)] rounded-2xl p-6 border border-white/10 mb-8">
      <div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Notifications</p>
          <h2 className="mt-1 text-xl font-bold text-[var(--text-primary)]">Alert types</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
            Choose which BiB alerts you want. Everything starts on by default, and you can turn off any category you do not want.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Your notification categories</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            These settings control alerts for your account across the site and the iPhone app.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {notificationPreferenceOptions.map((option) => {
            const isEnabled = preferences[option.key];
            const isSaving = savingPreferenceKey === option.key;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={isEnabled}
                onClick={() => void handleTogglePreference(option.key)}
                disabled={isSaving || preferencesLoading}
                className="rounded-2xl border border-white/10 bg-[var(--bg-secondary)] p-4 text-left transition-colors hover:border-white/20 disabled:cursor-wait disabled:opacity-60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{option.label}</p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{option.description}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                    isEnabled
                      ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
                      : 'border-white/10 bg-white/5 text-[var(--text-muted)]'
                  }`}>
                    {isSaving ? 'Saving' : isEnabled ? 'On' : 'Off'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {message && (
        <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${messageClasses}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
