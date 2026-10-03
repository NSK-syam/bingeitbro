'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { mapToAppDestination } from '@/lib/native/app-routes';
import { Sheet } from './Sheet';
import { TabBar, TAB_PATHS } from './TabBar';
import { EmptyState } from './ScreenHeader';

/** Neutral boot state while the session settles: never the website's landing page. */
function BootScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
      <span className="app-display text-[34px] text-[var(--app-accent)]">bib</span>
    </div>
  );
}

/**
 * App shell for /app/*: sign-in gating via the shared route mapping, safe areas, bottom bar and
 * the Recommend sheet. Inactive for users until the activation gate (see the redesign spec):
 * nothing links or redirects here yet.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname() || '/app';
  const searchParams = useSearchParams();
  const router = useRouter();

  const query = searchParams.toString();
  const current = query ? `${pathname}?${query}` : pathname;
  const signedIn = Boolean(user);

  const target = useMemo(
    () => (loading ? null : mapToAppDestination(current, { signedIn })),
    [current, loading, signedIn],
  );
  const needsRedirect = target?.kind === 'app' && target.path !== current;

  useEffect(() => {
    if (needsRedirect && target?.kind === 'app') router.replace(target.path);
  }, [needsRedirect, router, target]);

  const [recommendOpen, setRecommendOpen] = useState(false);
  const sheetFromUrl = searchParams.get('sheet') === 'recommend';
  const closeRecommend = useCallback(() => {
    setRecommendOpen(false);
    if (sheetFromUrl) router.replace(pathname);
  }, [pathname, router, sheetFromUrl]);

  if (loading || needsRedirect) return <BootScreen />;

  const showTabs = TAB_PATHS.includes(pathname);

  return (
    <>
      <main
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: showTabs
            ? 'calc(var(--app-tabbar-height) + env(safe-area-inset-bottom) + 16px)'
            : 'calc(env(safe-area-inset-bottom) + 16px)',
        }}
      >
        {children}
      </main>
      {showTabs ? <TabBar onRecommend={() => setRecommendOpen(true)} /> : null}
      <Sheet open={signedIn && (recommendOpen || sheetFromUrl)} onClose={closeRecommend} title="Recommend">
        {/* Filled in by PR 3 (Picks and the Recommend sheet). */}
        <EmptyState title="Coming soon" body="Sending recommendations from here arrives in the next update." />
      </Sheet>
    </>
  );
}
