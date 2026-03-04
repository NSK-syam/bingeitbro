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

function NativeAuthBridgeContent() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!isSupabaseConfigured()) {
      setStatus('error');
      setErrorMessage('Supabase is not configured.');
      return;
    }

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    const next = safeRedirect(hash.get('next') || '/');
    window.history.replaceState(null, '', window.location.pathname);

    if (!accessToken || !refreshToken) {
      setStatus('error');
      setErrorMessage('Missing authentication tokens.');
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    void (async () => {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (cancelled) return;

      if (error) {
        setStatus('error');
        setErrorMessage(error.message || 'Could not complete sign-in.');
        return;
      }

      setStatus('success');
      window.location.replace(next);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center gap-4 px-4">
      {status === 'loading' && (
        <>
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-secondary)]">Completing mobile sign-in...</p>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="w-8 h-8 text-green-500">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-[var(--text-secondary)]">Signed in. Redirecting...</p>
        </>
      )}

      {status === 'error' && (
        <div className="text-center max-w-md">
          <div className="w-12 h-12 mx-auto mb-4 text-red-400">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-red-400 font-medium mb-2">Mobile sign-in failed</p>
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

export default function NativeAuthBridgePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center gap-4">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-secondary)]">Loading...</p>
        </div>
      }
    >
      <NativeAuthBridgeContent />
    </Suspense>
  );
}
