'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    const next = searchParams.get('next') ?? '/';

    if (errorParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('error');
      setErrorMessage(errorDescription || errorParam || 'Authentication failed');
      return;
    }

    if (!isSupabaseConfigured()) {
      setStatus('error');
      setErrorMessage('Supabase is not configured.');
      return;
    }

    // The Supabase client with detectSessionInUrl: true automatically
    // detects the ?code= parameter and exchanges it for a session.
    // We just need to listen for the auth state change.
    const supabase = createClient();

    console.log('[Auth Callback] Waiting for session from URL detection...');

    const timeoutId = setTimeout(() => {
      console.error('[Auth Callback] Timed out after 15s');
      setStatus('error');
      setErrorMessage('Sign-in timed out. Please try again.');
    }, 15000);

    // Listen for the SIGNED_IN event that fires after auto code exchange
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth Callback] Auth state changed:', event, !!session);

      if (event === 'SIGNED_IN' && session) {
        clearTimeout(timeoutId);
        setStatus('success');
        subscription.unsubscribe();
        window.location.replace(next);
      } else if (event === 'TOKEN_REFRESHED' && session) {
        // Also handle token refresh which can happen on redirect
        clearTimeout(timeoutId);
        setStatus('success');
        subscription.unsubscribe();
        window.location.replace(next);
      }
    });

    // Also check if session already exists (in case event already fired)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        console.log('[Auth Callback] Session already exists');
        clearTimeout(timeoutId);
        setStatus('success');
        subscription.unsubscribe();
        window.location.replace(next);
      }
    });

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
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
