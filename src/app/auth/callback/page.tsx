'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    if (!code) {
      window.location.href = `${origin}/?error=auth`;
      return;
    }

    const supabase = createClient();
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          setStatus('error');
          window.location.href = `${origin}/?error=auth`;
          return;
        }
        setStatus('ok');
        window.location.href = `${origin}${next}`;
      })
      .catch(() => {
        setStatus('error');
        window.location.href = `${origin}/?error=auth`;
      });
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
      {status === 'loading' && (
        <p className="text-[var(--text-secondary)]">Signing you in...</p>
      )}
      {status === 'error' && (
        <p className="text-red-400">Sign-in failed. Redirecting...</p>
      )}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">Signing you in...</p>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
