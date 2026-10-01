'use client';

import { useEffect } from 'react';
import { isNativeApp } from '@/lib/native-app';
import { createClient } from '@/lib/supabase';

// Codes already handled in this page load. appUrlOpen and getLaunchUrl can both
// deliver the same URL, and React strict mode runs effects twice.
const handledAuthCodes = new Set<string>();

// URL.protocol of NATIVE_AUTH_CALLBACK_URL (com.bingeitbro.app://auth/callback).
const NATIVE_AUTH_SCHEME = 'com.bingeitbro.app:';

const SITE_HOSTS = new Set(['bingeitbro.com', 'www.bingeitbro.com']);

function goToCallbackError(error: string, description?: string | null) {
  const params = new URLSearchParams({ error });
  if (description) params.set('error_description', description);
  window.location.replace(`/auth/callback?${params.toString()}`);
}

async function closeSystemBrowser() {
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.close();
  } catch {
    // Not open, or unsupported on this platform (Android).
  }
}

async function handleAuthCallbackUrl(url: URL) {
  // Supabase may put errors in the query or (implicit-style) in the hash.
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const error = url.searchParams.get('error') || hashParams.get('error');
  const errorDescription = url.searchParams.get('error_description') || hashParams.get('error_description');
  if (error || errorDescription) {
    await closeSystemBrowser();
    goToCallbackError(error || 'auth', errorDescription);
    return;
  }

  const code = url.searchParams.get('code');
  if (!code || handledAuthCodes.has(code)) return;
  handledAuthCodes.add(code);

  await closeSystemBrowser();

  try {
    const { error: exchangeError } = await createClient().auth.exchangeCodeForSession(code);
    if (exchangeError) {
      goToCallbackError('auth', exchangeError.message || 'Authentication failed');
      return;
    }
    // onAuthStateChange in AuthProvider picks up the session; go home if we
    // are somewhere else (e.g. the /auth/callback error page).
    if (window.location.pathname !== '/') {
      window.location.replace('/');
    }
  } catch (err) {
    goToCallbackError('auth', err instanceof Error ? err.message : 'Authentication failed');
  }
}

function handleAppUrl(rawUrl: string | undefined | null) {
  if (!rawUrl) return;

  if (rawUrl.startsWith(NATIVE_AUTH_SCHEME)) {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return;
    }
    // Strict match on com.bingeitbro.app://auth/callback only.
    if (parsed.protocol !== NATIVE_AUTH_SCHEME || parsed.hostname !== 'auth' || parsed.pathname !== '/callback') {
      return;
    }
    void handleAuthCallbackUrl(parsed);
    return;
  }

  // Universal / app links to the website: navigate in-app (same site only).
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' || !SITE_HOSTS.has(parsed.hostname)) return;
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (path !== current) window.location.assign(path);
  } catch {
    // Ignore malformed URLs.
  }
}

/** Native (Capacitor) shell integration. Renders nothing and does nothing on the web. */
export function NativeAppBridge() {
  useEffect(() => {
    if (!isNativeApp()) return;

    let disposed = false;
    const removers: Array<() => void> = [];

    document.documentElement.classList.add('native-app');

    const setup = async () => {
      const [{ App }, { StatusBar, Style }, { SplashScreen }, { Capacitor }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/status-bar'),
        import('@capacitor/splash-screen'),
        import('@capacitor/core'),
      ]);
      if (disposed) return;

      try {
        await StatusBar.setStyle({ style: Style.Dark });
        if (Capacitor.getPlatform() === 'android') {
          await StatusBar.setBackgroundColor({ color: '#0A0A0C' });
        }
      } catch {
        // Ignore status bar failures.
      }

      try {
        await SplashScreen.hide();
      } catch {
        // Ignore splash failures.
      }

      const listeners = await Promise.all([
        App.addListener('appUrlOpen', ({ url }) => handleAppUrl(url)),
        App.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
          } else {
            void App.exitApp();
          }
        }),
      ]);
      listeners.forEach((listener) => removers.push(() => void listener.remove()));
      if (disposed) {
        removers.forEach((remove) => remove());
        return;
      }

      try {
        const launch = await App.getLaunchUrl();
        if (!disposed) handleAppUrl(launch?.url);
      } catch {
        // No launch URL.
      }
    };

    void setup().catch(() => {
      // Never let bridge setup break the page.
    });

    return () => {
      disposed = true;
      removers.forEach((remove) => remove());
    };
  }, []);

  return null;
}
