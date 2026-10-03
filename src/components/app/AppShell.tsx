'use client';

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { APP_HOME, RECOMMEND_SHEET_QUERY, mapToAppDestination } from '@/lib/native/app-routes';
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
 *
 * The Recommend sheet is driven by the URL only (`?sheet=recommend` on a tab screen). Opening it
 * pushes that URL as a normal route, so Back (Android button, browser, swipe-back) closes it with
 * ordinary navigation and no extra history entries are created or left behind.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname() || APP_HOME;
  const searchParams = useSearchParams();
  const router = useRouter();

  const query = searchParams.toString();
  const current = query ? `${pathname}?${query}` : pathname;
  const signedIn = Boolean(user);

  const target = useMemo(
    () => (loading ? null : mapToAppDestination(current, { signedIn })),
    [current, loading, signedIn],
  );
  // An invalid path (null) goes Home; only in-app destinations are expected for /app paths.
  const redirectTo = loading ? null : target === null ? APP_HOME : target.kind === 'app' && target.path !== current ? target.path : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  const sheetOpen = signedIn && searchParams.get('sheet') === 'recommend';
  // The sheet URL this shell pushed (so closing can step back instead of adding history).
  const pushedSheetUrlRef = useRef<string | null>(null);
  const closingRef = useRef(false);
  const recommendButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!sheetOpen) closingRef.current = false;
  }, [sheetOpen]);

  useEffect(() => {
    // Ownership only holds for the exact URL we pushed.
    if (pushedSheetUrlRef.current && pushedSheetUrlRef.current !== current) pushedSheetUrlRef.current = null;
  }, [current]);

  const openRecommend = useCallback(() => {
    if (sheetOpen) return;
    const url = `${pathname}?${RECOMMEND_SHEET_QUERY}`;
    pushedSheetUrlRef.current = url;
    router.push(url, { scroll: false });
  }, [pathname, router, sheetOpen]);

  const closeRecommend = useCallback(() => {
    if (!sheetOpen || closingRef.current) return;
    closingRef.current = true;
    if (pushedSheetUrlRef.current === current) {
      pushedSheetUrlRef.current = null;
      router.back();
    } else {
      // Opened from a link (e.g. /add): drop the flag without adding history.
      router.replace(pathname, { scroll: false });
    }
  }, [current, pathname, router, sheetOpen]);

  if (loading || redirectTo) return <BootScreen />;

  const showTabs = TAB_PATHS.includes(pathname);

  return (
    <>
      <main
        inert={sheetOpen}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: showTabs
            ? 'calc(var(--app-tabbar-height) + env(safe-area-inset-bottom) + 16px)'
            : 'calc(env(safe-area-inset-bottom) + 16px)',
        }}
      >
        {children}
      </main>
      {showTabs ? <TabBar onRecommend={openRecommend} inert={sheetOpen} actionRef={recommendButtonRef} /> : null}
      <Sheet open={sheetOpen} onClose={closeRecommend} title="Recommend" returnFocusRef={recommendButtonRef}>
        {/* Filled in by PR 3 (Picks and the Recommend sheet). */}
        <EmptyState title="Coming soon" body="Sending recommendations from here arrives in the next update." />
      </Sheet>
    </>
  );
}
