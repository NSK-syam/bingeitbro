'use client';

import { useEffect } from 'react';
import { isNativeApp } from '@/lib/native-app';
import { isSupabaseConfigured, createClient } from '@/lib/supabase';
import {
  disableNativePush,
  enableNativePush,
  getNativePlatform,
  loadMessaging,
  registerTokenWithServer,
  safePushPath,
} from '@/lib/native-push';

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

/**
 * Native push integration (FCM via @capacitor-firebase/messaging).
 * Self-gated: renders nothing and does nothing on the web. Uses the Supabase
 * singleton directly, so it can be mounted anywhere in the tree.
 */
export function NativePush() {
  useEffect(() => {
    if (!isNativeApp() || !isSupabaseConfigured()) return;

    let disposed = false;
    const removers: Array<() => void> = [];
    let userId: string | null = null;
    let accessToken: string | null = null;
    let registeredToken: string | null = null;
    let enabledFor: string | null = null;
    let queue: Promise<unknown> = Promise.resolve();

    const setup = async () => {
      const messaging = await loadMessaging();
      if (!messaging || disposed) return;
      const { FirebaseMessaging } = messaging;

      // Listeners first so a tap that cold-started the app is not missed
      // (the plugin retains these events until a listener is attached).
      const listeners = await Promise.all([
        FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
          const path = safePushPath(readData(event?.notification).path);
          if (!path) return;
          const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          if (path !== current) window.location.assign(path);
        }),
        FirebaseMessaging.addListener('notificationReceived', (event) => {
          // Foreground: nothing intrusive. iOS shows the banner per
          // presentationOptions; expose an event for an optional in-app toast.
          const notification = event?.notification;
          const detail: NativePushReceivedDetail = {
            title: notification?.title,
            body: notification?.body,
            path: safePushPath(readData(notification).path),
          };
          window.dispatchEvent(new CustomEvent(NATIVE_PUSH_RECEIVED_EVENT, { detail }));
        }),
        FirebaseMessaging.addListener('tokenReceived', (event) => {
          const token = event?.token;
          if (!token || !userId || !accessToken || enabledFor !== userId) return;
          const forUser = userId;
          const withToken = accessToken;
          void getNativePlatform().then((platform) => {
            if (!platform || disposed || userId !== forUser) return;
            void registerTokenWithServer(withToken, forUser, token, platform, true).then((ok) => {
              if (ok) registeredToken = token;
            });
          });
        }),
      ]).catch(() => []);
      listeners.forEach((listener) => removers.push(() => void listener.remove()));
      if (disposed) removers.forEach((remove) => remove());
    };

    const handleSession = (nextUserId: string | null, nextAccessToken: string | null) => {
      const previousUserId = userId;
      const previousAccessToken = accessToken;
      userId = nextUserId;
      accessToken = nextAccessToken;

      if (previousUserId && previousUserId !== nextUserId) {
        // Signed out (or switched account): unlink this device from the previous user.
        const tokenToDrop = registeredToken;
        registeredToken = null;
        enabledFor = null;
        queue = queue.then(() => disableNativePush(previousAccessToken, tokenToDrop));
        if (!nextUserId) return;
      }

      if (nextUserId && nextAccessToken && enabledFor !== nextUserId) {
        enabledFor = nextUserId;
        const forUser = nextUserId;
        // Serialized after any pending unlink so a fresh token isn't deleted.
        queue = queue
          .then(() => (disposed || userId !== forUser ? null : enableNativePush(nextAccessToken, forUser)))
          .then((token) => {
            if (disposed || userId !== forUser) return;
            if (token) registeredToken = token;
            else enabledFor = null; // allow a retry on a later auth event
          })
          .catch(() => undefined);
      }
    };

    void setup().catch(() => {
      // Never let push setup break the page.
    });

    try {
      const supabase = createClient();
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (disposed) return;
        handleSession(session?.user?.id ?? null, session?.access_token ?? null);
      });
      removers.push(() => data.subscription.unsubscribe());
    } catch {
      // Auth unavailable: nothing to do.
    }

    return () => {
      disposed = true;
      removers.forEach((remove) => remove());
    };
  }, []);

  return null;
}

export default NativePush;
