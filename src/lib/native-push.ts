'use client';

/**
 * Native (Capacitor iOS/Android) push notifications via @capacitor-firebase/messaging.
 * Everything here is a no-op on the web; plugin code is dynamically imported.
 *
 * If Firebase isn't configured in the native build (GoogleService-Info.plist /
 * google-services.json missing), getToken rejects as "unavailable" and push
 * is skipped quietly: no permission prompt, no error UI.
 */

import { isNativeApp } from '@/lib/native-app';

const REGISTER_ENDPOINT = '/api/native-push/register';
const REGISTERED_KEY = 'bib_native_push_registered';
const REREGISTER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
export const ANDROID_PUSH_CHANNEL_ID = 'bib_default';

type MessagingModule = typeof import('@capacitor-firebase/messaging');
type Platform = 'ios' | 'android';

let messagingPromise: Promise<MessagingModule | null> | null = null;

export function loadMessaging(): Promise<MessagingModule | null> {
  if (!isNativeApp()) return Promise.resolve(null);
  if (!messagingPromise) {
    messagingPromise = import('@capacitor-firebase/messaging').catch(() => null);
  }
  return messagingPromise;
}

export async function getNativePlatform(): Promise<Platform | null> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    const platform = Capacitor.getPlatform();
    return platform === 'ios' || platform === 'android' ? platform : null;
  } catch {
    return null;
  }
}

function errorText(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err ?? '');
  const e = err as { code?: unknown; message?: unknown };
  return `${typeof e.code === 'string' ? e.code : ''} ${typeof e.message === 'string' ? e.message : ''}`;
}

/** Firebase missing from the native build: stop quietly. */
function isNotConfiguredError(err: unknown): boolean {
  return /UNAVAILABLE|UNIMPLEMENTED|not configured|GoogleService-Info|FirebaseApp is not initialized|google-services/i.test(
    errorText(err),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

type TokenProbe = { status: 'ok'; token: string } | { status: 'not-configured' } | { status: 'error' };

async function probeToken(messaging: MessagingModule): Promise<TokenProbe> {
  try {
    const { token } = await withTimeout(messaging.FirebaseMessaging.getToken(), 15000);
    return token ? { status: 'ok', token } : { status: 'error' };
  } catch (err) {
    return isNotConfiguredError(err) ? { status: 'not-configured' } : { status: 'error' };
  }
}

function readRegistered(): { key: string; at: number } | null {
  try {
    const raw = window.localStorage.getItem(REGISTERED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: unknown; at?: unknown };
    return typeof parsed.key === 'string' && typeof parsed.at === 'number' ? { key: parsed.key, at: parsed.at } : null;
  } catch {
    return null;
  }
}

function writeRegistered(value: { key: string; at: number } | null) {
  try {
    if (value) window.localStorage.setItem(REGISTERED_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(REGISTERED_KEY);
  } catch {
    // Storage unavailable: we just re-register next time.
  }
}

/** POST the FCM token for the signed-in user. Skips if recently registered. */
export async function registerTokenWithServer(
  accessToken: string,
  userId: string,
  token: string,
  platform: Platform,
  force = false,
): Promise<boolean> {
  const key = `${userId}:${token}`;
  const previous = readRegistered();
  if (!force && previous?.key === key && Date.now() - previous.at < REREGISTER_AFTER_MS) return true;
  try {
    const res = await fetch(REGISTER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token, platform }),
    });
    if (!res.ok) return false;
    writeRegistered({ key, at: Date.now() });
    return true;
  } catch {
    return false;
  }
}

async function unregisterTokenWithServer(accessToken: string | null, token: string): Promise<void> {
  try {
    await fetch(REGISTER_ENDPOINT, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ token }),
      keepalive: true,
    });
  } catch {
    // Best effort; deleteToken() below also invalidates it at FCM.
  }
}

/**
 * After sign-in: if Firebase is configured, ask for permission and register
 * the token. Returns the token when registered, else null. Never throws.
 */
export async function enableNativePush(accessToken: string, userId: string): Promise<string | null> {
  try {
    const messaging = await loadMessaging();
    const platform = await getNativePlatform();
    if (!messaging || !platform) return null;

    // getToken works before notification permission is granted (iOS + Android),
    // so it doubles as the "is Firebase configured?" check before we prompt.
    let probe = await probeToken(messaging);
    if (probe.status === 'not-configured') return null;

    if (platform === 'android') {
      try {
        await messaging.FirebaseMessaging.createChannel({
          id: ANDROID_PUSH_CHANNEL_ID,
          name: 'BingeItBro',
          description: 'Friend recommendations and watch reminders',
          importance: messaging.Importance.High,
        });
      } catch {
        // Channel creation is optional.
      }
    }

    let permission = (await messaging.FirebaseMessaging.checkPermissions()).receive;
    if (permission === 'prompt' || permission === 'prompt-with-rationale') {
      permission = (await messaging.FirebaseMessaging.requestPermissions()).receive;
    }
    if (permission !== 'granted') return null;

    // iOS may not have the APNs token on the first try; retry briefly.
    for (let attempt = 0; probe.status !== 'ok' && attempt < 3; attempt += 1) {
      await sleep(1500 * (attempt + 1));
      probe = await probeToken(messaging);
      if (probe.status === 'not-configured') return null;
    }
    if (probe.status !== 'ok') return null;

    const ok = await registerTokenWithServer(accessToken, userId, probe.token, platform);
    return ok ? probe.token : null;
  } catch {
    return null;
  }
}

/**
 * Sign-out: unlink the token server-side and delete it at FCM so this device
 * stops receiving the previous user's notifications. Never throws.
 */
export async function disableNativePush(lastAccessToken: string | null, token: string | null): Promise<void> {
  writeRegistered(null);
  try {
    const messaging = await loadMessaging();
    if (!messaging) return;
    let current = token;
    if (!current) {
      const probe = await probeToken(messaging);
      if (probe.status !== 'ok') return;
      current = probe.token;
    }
    await unregisterTokenWithServer(lastAccessToken, current);
    try {
      await messaging.FirebaseMessaging.deleteToken();
    } catch {
      // Ignore.
    }
  } catch {
    // Ignore.
  }
}

/** Only same-site relative paths ("/movie/123", "/?view=friends"); else null. */
export function safePushPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const path = raw.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.length > 300) return null;
  try {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
