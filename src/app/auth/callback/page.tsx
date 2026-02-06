'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const exchangeStarted = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    const next = searchParams.get('next') ?? '/';

    if (errorParam) {
      setStatus('error');
      setErrorMessage(errorDescription || errorParam || 'Authentication failed');
      return;
    }

    if (!code) {
      setStatus('error');
      setErrorMessage('No authorization code received. Please try signing in again.');
      return;
    }

    if (!isSupabaseConfigured()) {
      setStatus('error');
      setErrorMessage('Supabase is not configured. Please set environment variables.');
      return;
    }

    // Prevent duplicate exchange on React Strict Mode double-mount
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;

    const supabase = createClient();

    console.log('[Auth Callback] Starting code exchange...');

    const timeoutId = setTimeout(() => {
      console.error('[Auth Callback] Code exchange timed out after 15s');
      setStatus('error');
      setErrorMessage('Sign-in timed out. Please try again.');
    }, 15000);

    supabase.auth.exchangeCodeForSession(code)
      .then(({ data, error }) => {
        clearTimeout(timeoutId);
        console.log('[Auth Callback] Exchange response:', {
          hasData: !!data,
          hasSession: !!data?.session,
          error: error?.message,
        });

        if (error) {
          console.error('Code exchange error:', error);
          setStatus('error');
          setErrorMessage(error.message || 'Failed to complete sign-in');
          return;
        }

        if (!data.session) {
          setStatus('error');
          setErrorMessage('No session received. Please try again.');
          return;
        }

        setStatus('success');
        window.location.replace(next);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        console.error('[Auth Callback] Exception:', err);
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
      });

    // Don't abort on cleanup — let the exchange complete even if component remounts
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center gap-4 px-4">
      {status === 'loading' && (
        <>
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-secondary)]">Signing you in...</p>
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
          <a
            href="/"
            className="inline-block px-6 py-2.5 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-full hover:opacity-90 transition-opacity"
          >
            Back to home
          </a>
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
