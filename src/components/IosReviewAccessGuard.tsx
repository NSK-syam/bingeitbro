'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIosReviewMode } from '@/hooks/useIosReviewMode';

export function IosReviewAccessGuard({
  children,
  fallbackHref = '/movies',
}: {
  children: ReactNode;
  fallbackHref?: string;
}) {
  const router = useRouter();
  const iosReviewMode = useIosReviewMode();

  useEffect(() => {
    if (!iosReviewMode) return;
    router.replace(fallbackHref);
  }, [fallbackHref, iosReviewMode, router]);

  if (iosReviewMode) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
