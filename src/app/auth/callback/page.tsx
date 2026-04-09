'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';

function safeRedirect(raw: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  try {
    const parsed = new URL(raw, 'http://localhost');
    if (parsed.hostname !== 'localhost') return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

function buildNativeAppCallbackUrl(params: URLSearchParams): string {
  const callbackUrl = new URL('bingeitbro://auth/callback');
  const code = params.get('code');
  const error = params.get('error');
  const errorDescription = params.get('error_description');
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (code) callbackUrl.searchParams.set('code', code);
  if (error) callbackUrl.searchParams.set('error', error);
  if (errorDescription) callbackUrl.searchParams.set('error_description', errorDescription);
  if (accessToken) callbackUrl.searchParams.set('access_token', accessToken);
  if (refreshToken) callbackUrl.searchParams.set('refresh_token', refreshToken);

  return callbackUrl.toString();
}

function AuthCallbackContent() {
  const [status, setStatus] = useState<'loading' | 'returning' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nativeOpenHref, setNativeOpenHref] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    const errorDescription = params.get('error_description');
    const next = safeRedirect(params.get('next') ?? '/');
    const code = params.get('code');
    const nativeApp = params.get('native_app') === '1';

    if (nativeApp) {
      if (errorParam) {
        const callbackUrl = buildNativeAppCallbackUrl(params);
        setNativeOpenHref(callbackUrl);
        setStatus('returning');
        window.location.replace(callbackUrl);
        return;
      }

      if (!isSupabaseConfigured()) {
        setStatus('error');
        setErrorMessage('Supabase is not configured.');
        return;
      }

      const supabase = createClient();
      let isActive = true;

      const handoffToNative = async () => {
        try {
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) {
              throw error;
            }
          }

          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session?.access_token || !session.refresh_token) {
            throw new Error('Missing session tokens for native handoff.');
          }

          const nativeParams = new URLSearchParams();
          nativeParams.set('access_token', session.access_token);
          nativeParams.set('refresh_token', session.refresh_token);
          const callbackUrl = buildNativeAppCallbackUrl(nativeParams);

          if (!isActive) {
            return;
          }

          setNativeOpenHref(callbackUrl);
          setStatus('returning');
          window.location.replace(callbackUrl);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Authentication failed';
          const failureParams = new URLSearchParams();
          failureParams.set('error', 'oauth_failed');
          failureParams.set('error_description', message);
          const callbackUrl = buildNativeAppCallbackUrl(failureParams);

          if (!isActive) {
            return;
          }

          setNativeOpenHref(callbackUrl);
          setStatus('returning');
          window.location.replace(callbackUrl);
        }
      };

      void handoffToNative();

      return () => {
        isActive = false;
      };
    }

    if (errorParam) {
      setStatus('error');
      setErrorMessage(errorDescription || errorParam || 'Authentication failed');
      return;
    }

    if (!isSupabaseConfigured()) {
      setStatus('error');
      setErrorMessage('Supabase is not configured.');
      return;
    }

    const supabase = createClient();
    let isActive = true;
    let completed = false;

    console.log('[Auth Callback] Processing auth callback...');

    const timeoutId = setTimeout(() => {
      if (!isActive) return;
      console.error('[Auth Callback] Timed out after 15s');
      setStatus('error');
      setErrorMessage('Sign-in timed out. Please try again.');
    }, 15000);

    const finish = () => {
      if (!isActive || completed) return;
      completed = true;
      clearTimeout(timeoutId);
      setStatus('success');
      window.location.replace(next);
    };

    const fail = (message: string) => {
      if (!isActive || completed) return;
      completed = true;
      clearTimeout(timeoutId);
      setStatus('error');
      setErrorMessage(message);
    };

    const withTimeout = async <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(message)), ms);
      });
      try {
        return await Promise.race([promise, timeout]);
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        finish();
      }
    });

    (async () => {
      try {
        // If we have a PKCE code, exchange it explicitly.
        if (code) {
          const { error } = await withTimeout(
            supabase.auth.exchangeCodeForSession(code),
            10000,
            'Authentication timed out. Please try again.'
          );
          if (error) {
            // If the exchange errored but a session exists, prefer the session.
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (session) {
                finish();
                return;
              }
            } catch {
              // Ignore and surface the original error below.
            }
            fail(error.message || 'Authentication failed');
            return;
          }
          // If auth state change fired, finish will no-op. Otherwise, check session.
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            finish();
          }
          return;
        }

        // Fallback: check for an existing session (e.g., already signed in).
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          8000,
          'Sign-in timed out. Please try again.'
        );
        if (session) {
          finish();
        } else {
          fail('Sign-in failed. Missing authentication code.');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Authentication failed';
        fail(message);
      }
    })();

    return () => {
      isActive = false;
      subscription.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center gap-4 px-4">
      {status === 'loading' && (
        <>
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-secondary)]">Signing you in...</p>
        </>
      )}

      {status === 'returning' && (
        <>
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-secondary)]">Returning you to the app...</p>
          {nativeOpenHref && (
            <a
              href={nativeOpenHref}
              className="inline-block px-6 py-2.5 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-full hover:opacity-90 transition-opacity"
            >
              Open app
            </a>
          )}
        </>
      )}

      {status === 'success' && (
        <>
          <div className="w-8 h-8 text-green-500">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-[var(--text-secondary)]">Success! Redirecting...</p>
        </>
      )}

      {status === 'error' && (
        <div className="text-center max-w-md">
          <div className="w-12 h-12 mx-auto mb-4 text-red-400">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-red-400 font-medium mb-2">Sign-in failed</p>
          <p className="text-sm text-[var(--text-secondary)] mb-6">{errorMessage}</p>
          <Link
            href="/"
            className="inline-block px-6 py-2.5 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-full hover:opacity-90 transition-opacity"
          >
            Back to home
          </Link>
        </div>
      )}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center gap-4">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-secondary)]">Loading...</p>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
