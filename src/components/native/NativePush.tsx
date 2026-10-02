'use client';

import { useEffect } from 'react';
import { isNativeApp } from '@/lib/native-app';
import { isSupabaseConfigured, createClient } from '@/lib/supabase';
import { createPushLifecycle, safePushPath, type PushLifecycle } from '@/lib/native-push';

/** Fired on window for foreground notifications; an in-app toast may listen for it. */
export const NATIVE_PUSH_RECEIVED_EVENT = 'bib:native-push-received';

export type NativePushReceivedDetail = {
  title?: string;
  body?: string;
  path?: string | null;
};

function readData(notification: unknown): Record<string, unknown> {
  if (!notification || typeof notification !== 'object') return {};
  const data = (notification as { data?: unknown }).data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
}

const browserStorage = {
  get(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      // Storage unavailable.
    }
  },
};

/**
 * Native push integration (FCM via @capacitor-firebase/messaging).
 * Self-gated: renders nothing and does nothing on the web. All token work is
 * serialized per account in createPushLifecycle (src/lib/native-push.ts).
 */
export function NativePush() {
  useEffect(() => {
    if (!isNativeApp() || !isSupabaseConfigured()) return;

    let disposed = false;
    let lifecycle: PushLifecycle | null = null;
    // Latest auth state seen before the plugin finished loading.
    let pendingSession: { userId: string | null; accessToken: string | null } | null = null;
    const removers: Array<() => void> = [];

    // Subscribe to auth immediately so no event is missed while the plugin loads.
    try {
      const { data } = createClient().auth.onAuthStateChange((_event, session) => {
        if (disposed) return;
        const userId = session?.user?.id ?? null;
        const accessToken = session?.access_token ?? null;
        if (lifecycle) void lifecycle.onSession(userId, accessToken);
        else pendingSession = { userId, accessToken };
      });
      removers.push(() => data.subscription.unsubscribe());
    } catch {
      // Auth unavailable: nothing to do.
    }

    const setup = async () => {
      const [messaging, { Capacitor }] = await Promise.all([
        import('@capacitor-firebase/messaging'),
        import('@capacitor/core'),
      ]);
      if (disposed) return;
      const platform = Capacitor.getPlatform();
      if (platform !== 'ios' && platform !== 'android') return;
      const { FirebaseMessaging, Importance } = messaging;

      const created = createPushLifecycle({
        messaging: FirebaseMessaging,
        platform,
        fetch: (input, init) => fetch(input, init),
        storage: browserStorage,
        androidImportanceHigh: Importance.High,
      });
      lifecycle = created;
      removers.push(() => created.dispose());

      // Listeners first so a tap that cold-started the app is not missed
      // (the plugin retains these events until a listener is attached).
      const listeners = await Promise.all([
        FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
          if (disposed) return;
          const path = safePushPath(readData(event?.notification).path, window.location.origin);
          if (!path) return;
          const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          if (path !== current) window.location.assign(path);
        }),
        FirebaseMessaging.addListener('notificationReceived', (event) => {
          if (disposed) return;
          // Foreground: nothing intrusive; expose an event for an optional in-app toast.
          const notification = event?.notification;
          const detail: NativePushReceivedDetail = {
            title: notification?.title,
            body: notification?.body,
            path: safePushPath(readData(notification).path, window.location.origin),
          };
          window.dispatchEvent(new CustomEvent(NATIVE_PUSH_RECEIVED_EVENT, { detail }));
        }),
        FirebaseMessaging.addListener('tokenReceived', (event) => {
          if (disposed || !event?.token) return;
          void created.onTokenRefresh(event.token);
        }),
      ]).catch(() => []);
      listeners.forEach((listener) => removers.push(() => void listener.remove()));
      if (disposed) {
        removers.forEach((remove) => remove());
        return;
      }

      if (pendingSession) {
        const { userId, accessToken } = pendingSession;
        pendingSession = null;
        void created.onSession(userId, accessToken);
      }
    };

    void setup().catch(() => {
      // Never let push setup break the page.
    });

    return () => {
      disposed = true;
      removers.forEach((remove) => remove());
    };
  }, []);

  return null;
}

export default NativePush;
