'use client';

import { useEffect } from 'react';
import { isNativeApp } from '@/lib/native-app';
import { createClient } from '@/lib/supabase';
import { getWidgetOpenPath } from '@/lib/native/widget-deeplink';

// Auth callback URLs already handled. appUrlOpen and getLaunchUrl can both
// deliver the same URL, React strict mode runs effects twice, and getLaunchUrl
// keeps returning the cold-start URL after every full page load, so remember
// handled URLs in sessionStorage too (codes are single-use).
const HANDLED_AUTH_URLS_KEY = 'bib_native_handled_auth_urls';
const handledAuthUrls = new Set<string>();

function claimAppUrl(rawUrl: string): boolean {
  if (handledAuthUrls.has(rawUrl)) return false;
  handledAuthUrls.add(rawUrl);
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(HANDLED_AUTH_URLS_KEY) || '[]');
    const list = Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : [];
    if (list.includes(rawUrl)) return false;
    window.sessionStorage.setItem(HANDLED_AUTH_URLS_KEY, JSON.stringify([...list, rawUrl].slice(-10)));
  } catch {
    // Storage unavailable: fall back to the in-memory set.
  }
  return true;
}

// URL.protocol of NATIVE_AUTH_CALLBACK_URL (com.bingeitbro.app://auth/callback).
const NATIVE_AUTH_SCHEME = 'com.bingeitbro.app:';

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
    // Best effort: the browser may already be closed.
  }
}

async function handleAuthCallbackUrl(url: URL) {
  if (!claimAppUrl(url.href)) return;

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
  if (!code) return;

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

function handleAppUrl(rawUrl: string | undefined | null, fromLaunch = false) {
  if (!rawUrl) return;

  // Home screen widget: com.bingeitbro.app://open?path=/movie/... (same-origin paths only).
  const widgetPath = getWidgetOpenPath(rawUrl);
  if (widgetPath) {
    // getLaunchUrl() repeats the cold-start URL after every full page load; follow it once.
    if (fromLaunch && !claimAppUrl(rawUrl)) return;
    if (widgetPath !== `${window.location.pathname}${window.location.search}`) {
      window.location.assign(widgetPath);
    }
    return;
  }

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

      // Listen for deep links first so a warm OAuth return isn't missed.
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

      try {
        const launch = await App.getLaunchUrl();
        if (!disposed) handleAppUrl(launch?.url, true);
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
