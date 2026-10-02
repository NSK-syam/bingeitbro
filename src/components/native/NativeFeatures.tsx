'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useIsNativeApp } from '@/lib/native/use-is-native-app';
import { getRecentFriendRecommendations, getUpcomingWatchReminders } from '@/lib/supabase-rest';
import { getWatchReminderOpenPath } from '@/lib/watch-reminder-path';
import { safeInAppPath, syncNativeWatchReminders } from '@/lib/native/watch-reminders';
import {
  clearAccountOfflineCache,
  readOfflineCache,
  writeOfflineCache,
  type OfflineCacheEntry,
  type OfflineItem,
} from '@/lib/native/offline-cache';

/**
 * Native-only device features (Capacitor app). Mount once inside AuthProvider.
 * Renders nothing and runs nothing on the web.
 *
 * - Opens the right title when a local watch-reminder notification is tapped.
 * - Re-syncs on-device watch reminders with the server on start / resume.
 * - Caches watchlist, scheduled watches and recent friend picks into
 *   Capacitor Preferences while online.
 * - Shows an offline banner and a read-only "your saved list" view offline.
 */
export function NativeFeatures() {
  const native = useIsNativeApp();
  if (!native) return null;
  return <NativeFeaturesInner />;
}

const WATCHLIST_STORAGE_KEY = 'cinema-chudu-watchlist';
const LOCAL_STORAGE_SYNC_EVENT = 'bib-local-storage-sync';
const RESYNC_MIN_INTERVAL_MS = 60_000;

type WatchlistState = Record<string, { addedAt?: string; title?: string; poster?: string }>;

function watchlistToItems(state: unknown): OfflineItem[] {
  if (!state || typeof state !== 'object') return [];
  return Object.entries(state as WatchlistState)
    .filter(([, item]) => item && typeof item === 'object')
    .map(([id, item]) => ({
      id,
      title: item.title || 'Saved title',
      poster: item.poster ?? null,
      path: getWatchReminderOpenPath(id),
      at: item.addedAt ?? null,
    }))
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

function cacheWatchlistFromLocalStorage(userId: string | null) {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    void writeOfflineCache('watchlist', userId, watchlistToItems(raw ? JSON.parse(raw) : {}));
  } catch {
    // Ignore malformed storage.
  }
}

function NativeFeaturesInner() {
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const [online, setOnline] = useState(true);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const lastSyncRef = useRef(0);
  const wasOfflineRef = useRef(false);

  // 1. Notification taps -> open the title. Registered once, independent of auth.
  useEffect(() => {
    let disposed = false;
    let remove: (() => void) | null = null;
    void import('@capacitor/local-notifications')
      .then(async ({ LocalNotifications }) => {
        const handle = await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
          const path = safeInAppPath(action.notification?.extra);
          if (path && `${window.location.pathname}${window.location.search}` !== path) {
            window.location.href = path;
          }
        });
        if (disposed) {
          void handle.remove();
        } else {
          remove = () => void handle.remove();
        }
      })
      .catch(() => {
        // Plugin unavailable.
      });
    return () => {
      disposed = true;
      remove?.();
    };
  }, []);

  // 2. Server -> device sync (reminders + offline caches).
  const syncFromServer = useCallback(
    async (force: boolean) => {
      if (loading) return;
      if (!force && Date.now() - lastSyncRef.current < RESYNC_MIN_INTERVAL_MS) return;
      lastSyncRef.current = Date.now();

      cacheWatchlistFromLocalStorage(userId);

      if (!userId) {
        // Signed out: drop account data from the device.
        await syncNativeWatchReminders([]);
        await clearAccountOfflineCache();
        return;
      }

      const [remindersResult, recsResult] = await Promise.allSettled([
        getUpcomingWatchReminders(),
        getRecentFriendRecommendations(userId, 20),
      ]);

      if (remindersResult.status === 'fulfilled') {
        const now = Date.now();
        const upcoming = remindersResult.value
          .filter((r) => !r.canceledAt && new Date(r.remindAt).getTime() > now)
          .sort((a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime());
        await syncNativeWatchReminders(upcoming);
        await writeOfflineCache(
          'scheduled',
          userId,
          upcoming.map((r) => ({
            id: r.id,
            title: r.movieTitle,
            poster: r.moviePoster,
            year: r.movieYear,
            path: getWatchReminderOpenPath(r.movieId),
            at: r.remindAt,
          })),
        );
      }

      if (recsResult.status === 'fulfilled') {
        await writeOfflineCache(
          'friendRecs',
          userId,
          recsResult.value.map((rec) => ({
            id: rec.id,
            title: rec.movie_title || 'A movie',
            path: rec.tmdb_id
              ? `/movie/tmdb-${encodeURIComponent(String(rec.tmdb_id))}`
              : rec.recommendation_id
                ? `/movie/${encodeURIComponent(rec.recommendation_id)}`
                : undefined,
            at: rec.created_at,
            note: rec.sender?.name ? `From ${rec.sender.name}` : null,
          })),
        );
      }
    },
    [loading, userId],
  );

  useEffect(() => {
    if (!online) return;
    void syncFromServer(true);
  }, [online, syncFromServer]);

  // Keep the watchlist cache current as it changes (it lives in localStorage).
  useEffect(() => {
    const onLocalSync = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key === WATCHLIST_STORAGE_KEY) cacheWatchlistFromLocalStorage(userId);
    };
    window.addEventListener(LOCAL_STORAGE_SYNC_EVENT, onLocalSync);
    return () => window.removeEventListener(LOCAL_STORAGE_SYNC_EVENT, onLocalSync);
  }, [userId]);

  // 3. App resume -> throttled re-sync.
  useEffect(() => {
    let disposed = false;
    let remove: (() => void) | null = null;
    void import('@capacitor/app')
      .then(async ({ App }) => {
        const handle = await App.addListener('resume', () => {
          void syncFromServer(false);
        });
        if (disposed) {
          void handle.remove();
        } else {
          remove = () => void handle.remove();
        }
      })
      .catch(() => {});
    return () => {
      disposed = true;
      remove?.();
    };
  }, [syncFromServer]);

  // 4. Network status.
  useEffect(() => {
    let disposed = false;
    let remove: (() => void) | null = null;
    let backOnlineTimer: number | undefined;

    const apply = (connected: boolean) => {
      if (disposed) return;
      setOnline(connected);
      if (!connected) {
        wasOfflineRef.current = true;
        setShowBackOnline(false);
      } else if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        setShowBackOnline(true);
        window.clearTimeout(backOnlineTimer);
        backOnlineTimer = window.setTimeout(() => setShowBackOnline(false), 2500);
      }
    };

    void import('@capacitor/network')
      .then(async ({ Network }) => {
        const handle = await Network.addListener('networkStatusChange', (status) => apply(status.connected));
        if (disposed) {
          void handle.remove();
          return;
        }
        remove = () => void handle.remove();
        const status = await Network.getStatus();
        apply(status.connected);
      })
      .catch(() => {});

    return () => {
      disposed = true;
      window.clearTimeout(backOnlineTimer);
      remove?.();
    };
  }, []);

  return (
    <>
      {!online && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-[300] flex items-center justify-between gap-3 border-b border-amber-300/30 bg-[#1a1407]/95 px-4 py-2.5 text-sm text-amber-100 shadow-lg backdrop-blur-md"
          style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}
        >
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
            You&rsquo;re offline
          </span>
          <button
            type="button"
            onClick={() => setSavedOpen(true)}
            className="rounded-full bg-amber-400 px-3 py-1 text-xs font-semibold text-[#191205]"
          >
            Your saved list
          </button>
        </div>
      )}
      {online && showBackOnline && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-[300] bg-emerald-600/95 px-4 py-2 text-center text-sm font-medium text-white"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          Back online
        </div>
      )}
      {savedOpen && <OfflineSavedList online={online} onClose={() => setSavedOpen(false)} />}
    </>
  );
}

type SavedSections = {
  scheduled: OfflineCacheEntry | null;
  watchlist: OfflineCacheEntry | null;
  friendRecs: OfflineCacheEntry | null;
};

function formatWhen(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function OfflineSavedList({ online, onClose }: { online: boolean; onClose: () => void }) {
  const [sections, setSections] = useState<SavedSections | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([readOfflineCache('scheduled'), readOfflineCache('watchlist'), readOfflineCache('friendRecs')]).then(
      ([scheduled, watchlist, friendRecs]) => {
        if (!cancelled) setSections({ scheduled, watchlist, friendRecs });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const savedAt = [sections?.scheduled?.savedAt, sections?.watchlist?.savedAt, sections?.friendRecs?.savedAt]
    .filter((v): v is string => !!v)
    .sort()
    .pop();
  const isEmpty =
    !!sections &&
    !sections.scheduled?.items.length &&
    !sections.watchlist?.items.length &&
    !sections.friendRecs?.items.length;

  return (
    <div className="fixed inset-0 z-[310] flex flex-col bg-[#0A0A0C] text-[var(--text-primary)]">
      <div
        className="flex items-center justify-between gap-3 border-b border-white/10 px-4 pb-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-amber-300">{online ? 'Saved on this device' : 'Offline'}</p>
          <h2 className="text-lg font-bold">Your saved list</h2>
          {savedAt && <p className="text-xs text-[var(--text-muted)]">Last updated {formatWhen(savedAt)}</p>}
        </div>
        <div className="flex items-center gap-2">
          {online && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--bg-primary)]"
            >
              Reload
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-white/10 text-[var(--text-muted)]"
            aria-label="Close saved list"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-4" style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}>
        {!sections && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
        {isEmpty && (
          <p className="text-sm text-[var(--text-muted)]">
            Nothing saved yet. Your watchlist, scheduled watches and friends&rsquo; picks are saved here automatically
            whenever you use BingeItBro online.
          </p>
        )}
        {sections && (
          <>
            <SavedSection
              heading="Scheduled watches"
              items={sections.scheduled?.items ?? []}
              renderMeta={(item) => formatWhen(item.at)}
            />
            <SavedSection heading="Watchlist" items={sections.watchlist?.items ?? []} />
            <SavedSection
              heading="From your friends"
              items={sections.friendRecs?.items ?? []}
              renderMeta={(item) => item.note || ''}
            />
          </>
        )}
        <p className="mt-6 text-xs text-[var(--text-muted)]">Read-only while offline. Changes sync when you&rsquo;re back online.</p>
      </div>
    </div>
  );
}

function SavedSection({
  heading,
  items,
  renderMeta,
}: {
  heading: string;
  items: OfflineItem[];
  renderMeta?: (item: OfflineItem) => string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {heading} <span className="text-[var(--text-muted)]/70">({items.length})</span>
      </h3>
      <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {items.map((item) => {
          const meta = renderMeta?.(item);
          return (
            <li key={item.id} className="px-4 py-3">
              <p className="truncate text-sm font-medium">
                {item.title}
                {item.year ? <span className="text-[var(--text-muted)]"> ({item.year})</span> : null}
              </p>
              {meta && <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{meta}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
