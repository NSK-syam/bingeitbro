'use client';

import { useEffect } from 'react';
import { isNativeApp } from '@/lib/native-app';
import { registerNativeLogoutCleanup } from '@/lib/native/logout-cleanup';
import { isSupabaseConfigured, createClient } from '@/lib/supabase';
import { createPushLifecycle, safePushPath, type AsyncStore, type PushLifecycle } from '@/lib/native-push';

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

/** Capacitor Preferences: survives reloads and app restarts (unlike page memory). */
const preferencesStore: AsyncStore = {
  async get(key) {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key });
    return value;
  },
  async set(key, value) {
    const { Preferences } = await import('@capacitor/preferences');
    if (value === null) await Preferences.remove({ key });
    else await Preferences.set({ key, value });
  },
};

// One lifecycle per page load (module singleton), so it outlives component
// re-mounts and is reachable from the sign-out registry below.
let lifecyclePromise: Promise<PushLifecycle | null> | null = null;

function getPushLifecycle(): Promise<PushLifecycle | null> {
  if (!isNativeApp()) return Promise.resolve(null);
  lifecyclePromise ??= (async () => {
    try {
      const [messaging, { Capacitor }] = await Promise.all([
        import('@capacitor-firebase/messaging'),
        import('@capacitor/core'),
      ]);
      const platform = Capacitor.getPlatform();
      if (platform !== 'ios' && platform !== 'android') return null;
      return createPushLifecycle({
        messaging: messaging.FirebaseMessaging,
        platform,
        fetch: (input, init) => fetch(input, init),
        store: preferencesStore,
        androidImportanceHigh: messaging.Importance.High,
      });
    } catch {
      return null;
    }
  })();
  return lifecyclePromise;
}

// Registered at module load (not in an effect): AuthProvider.signOut awaits this
// with the still-valid session before revoking it and before navigating away.
if (typeof window !== 'undefined') {
  registerNativeLogoutCleanup('push', async (ctx) => {
    if (!isNativeApp()) return;
    const lifecycle = await getPushLifecycle();
    await lifecycle?.logout(ctx);
  });
}

/**
 * Native push integration (FCM via @capacitor-firebase/messaging).
 * Self-gated: renders nothing and does nothing on the web. All token work is
 * serialized and persisted by createPushLifecycle (src/lib/native-push.ts).
 */
export function NativePush() {
  useEffect(() => {
    if (!isNativeApp() || !isSupabaseConfigured()) return;

    let disposed = false;
    const removers: Array<() => void> = [];

    const setup = async () => {
      const lifecycle = await getPushLifecycle();
      if (!lifecycle || disposed) return;
      const [{ FirebaseMessaging }, { App }] = await Promise.all([
        import('@capacitor-firebase/messaging'),
        import('@capacitor/app'),
      ]);
      if (disposed) return;

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
          void lifecycle.onTokenRefresh(event.token);
        }),
        App.addListener('resume', () => {
          if (!disposed) void lifecycle.onResume();
        }),
      ]).catch(() => []);
      listeners.forEach((listener) => removers.push(() => void listener.remove()));
      if (disposed) {
        removers.forEach((remove) => remove());
        return;
      }

      // Subscribe after the lifecycle exists; Supabase replays the current
      // session as INITIAL_SESSION, which runs the startup cleanup first.
      try {
        const { data } = createClient().auth.onAuthStateChange((_event, session) => {
          if (disposed) return;
          void lifecycle.onSession(session?.user?.id ?? null, session?.access_token ?? null);
        });
        removers.push(() => data.subscription.unsubscribe());
      } catch {
        // Auth unavailable: nothing to do.
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
