'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthProvider';
import {
  isNativeAppShell,
  postNativePushEnableMessage,
  postNativePushRefreshMessage,
  postNativePushTestMessage,
} from '@/lib/native-webview';

type NativePushPermission = 'granted' | 'denied' | 'default' | 'unsupported';

type NativePushStatus = {
  enabled: boolean;
  permission: NativePushPermission;
  message?: string;
  platform: 'ios' | 'android';
};

declare global {
  interface WindowEventMap {
    'bib-native-push-status': CustomEvent<NativePushStatus>;
  }

  interface Window {
    __BIB_NATIVE_PUSH_STATUS?: NativePushStatus;
  }
}

export function NativePushStatusCard() {
  const { session } = useAuth();
  const [status, setStatus] = useState<NativePushStatus | null>(
    () => (typeof window !== 'undefined' ? window.__BIB_NATIVE_PUSH_STATUS ?? null : null),
  );
  const [busy, setBusy] = useState(false);

  const isShell = typeof window !== 'undefined' && isNativeAppShell();
  const canControl = isShell && Boolean(session?.user?.id);

  useEffect(() => {
    if (!isShell) return;

    const handler = (event: CustomEvent<NativePushStatus>) => {
      setStatus(event.detail);
      setBusy(false);
    };

    window.addEventListener('bib-native-push-status', handler as EventListener);

    postNativePushRefreshMessage();

    return () => {
      window.removeEventListener(
        'bib-native-push-status',
        handler as EventListener,
      );
    };
  }, [isShell]);

  const handleEnable = useCallback(() => {
    if (!canControl) return;
    const userId = session?.user?.id ?? '';
    const accessToken = session?.access_token ?? '';
    if (!userId || !accessToken) return;
    setBusy(true);
    postNativePushEnableMessage({ userId, accessToken });
  }, [canControl, session?.access_token, session?.user?.id]);

  const handleTest = useCallback(() => {
    if (!canControl) return;
    setBusy(true);
    postNativePushTestMessage();
  }, [canControl]);

  if (!isShell) return null;

  const headline =
    status?.enabled && status.permission === 'granted'
      ? 'BiB app notifications are on for this device.'
      : 'BiB app notifications are currently off on this device.';

  const detail =
    status?.message ||
    (status?.permission === 'denied'
      ? 'Notifications are blocked in your iPhone settings. Turn them back on in Settings → Notifications.'
      : 'Turn on in‑app alerts so BiB can notify you on this iPhone.');

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-[var(--bg-secondary)] px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
            iPhone app
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
            {headline}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {detail}
          </p>
        </div>
        {canControl ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={busy}
              onClick={handleEnable}
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--bg-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {busy ? 'Working…' : status?.enabled ? 'Refresh status' : 'Turn on in‑app alerts'}
            </button>
            <button
              type="button"
              disabled={busy || !status?.enabled || status.permission !== 'granted'}
              onClick={handleTest}
              className="rounded-full border border-white/15 bg-[var(--bg-card)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--accent)]/40 disabled:opacity-50"
            >
              Send test alert
            </button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-[var(--text-muted)] sm:mt-0">
            Sign in inside the iPhone app to manage app notifications.
          </p>
        )}
      </div>
    </div>
  );
}

