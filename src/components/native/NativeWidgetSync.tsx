'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createClient } from '@/lib/supabase';
import { clearWidgetData, ensureWidgetOwner, isBibNativeAvailable, setWidgetData, type WidgetItemInput } from '@/lib/native/bib-native';
import { registerNativeLogoutCleanup } from '@/lib/native/logout-cleanup';

/**
 * Incremented by the sign-out cleanup. A sync that started before sign-out checks it before
 * every native call, so it can never re-reserve or re-write the signed-out account's data.
 */
let widgetLogoutEpoch = 0;

// Registered at module load (not in an effect) so it is in place before any sign-out.
// clearWidgetData synchronously marks the widget signed out natively (sentinel expected owner
// + generation bump) before removing the snapshot, so even if the 5s cleanup budget is cut
// short no pending poster write can commit, and the widget hides the snapshot immediately.
registerNativeLogoutCleanup('widget', async () => {
  widgetLogoutEpoch += 1;
  await clearWidgetData().catch(() => undefined);
});

const MAX_ITEMS = 3;
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';

/** Small (w185) https poster URL for the widget, or null. */
function toWidgetPosterUrl(poster: string | null | undefined): string | null {
  const raw = String(poster ?? '').trim();
  if (!raw || raw.startsWith('data:')) return null;
  if (/^https:\/\/image\.tmdb\.org\/t\/p\//i.test(raw)) {
    return raw.replace(/\/t\/p\/(?:w\d+|original|h\d+)\//i, '/t/p/w185/');
  }
  if (raw.startsWith('/t/p/')) {
    return `https://image.tmdb.org${raw.replace(/\/t\/p\/(?:w\d+|original|h\d+)\//i, '/t/p/w185/')}`;
  }
  // Bare TMDB file path, e.g. "/abc123.jpg".
  if (/^\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(raw)) return `${TMDB_IMAGE_BASE}w185${raw}`;
  if (/^https:\/\//i.test(raw)) return raw;
  return null;
}

function toItemPath(row: { tmdb_id: string | number | null; recommendation_id: string | null; id: string }): string {
  // Same ids MoviesHome uses for received picks (/movie/[id]).
  if (row.tmdb_id) return `/movie/${encodeURIComponent(`tmdb-${row.tmdb_id}`)}`;
  if (row.recommendation_id) return `/movie/${encodeURIComponent(row.recommendation_id)}`;
  return '/';
}

type ReceivedRow = {
  id: string;
  sender_id: string;
  movie_title: string | null;
  movie_poster: string | null;
  movie_year: number | null;
  tmdb_id: string | number | null;
  recommendation_id: string | null;
};

async function countUnwatched(userId: string): Promise<number> {
  const supabase = createClient();
  const watched = await supabase
    .from('friend_recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .neq('sender_id', userId)
    .not('is_watched', 'is', true);
  if (!watched.error) return watched.count ?? 0;

  // Older schema without is_watched: fall back to unread picks.
  const unread = await supabase
    .from('friend_recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .neq('sender_id', userId)
    .eq('is_read', false);
  return unread.error ? 0 : unread.count ?? 0;
}

async function buildWidgetPayload(userId: string): Promise<{ items: WidgetItemInput[]; unwatchedCount: number }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('friend_recommendations')
    .select('id, sender_id, movie_title, movie_poster, movie_year, tmdb_id, recommendation_id')
    .eq('recipient_id', userId)
    .neq('sender_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_ITEMS);
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []) as ReceivedRow[];

  // Sender names: separate query (no embed) because the sender's profile may not be
  // readable for one-way friendships; fall back to "A friend".
  const senderNames = new Map<string, string>();
  const senderIds = [...new Set(rows.map((r) => r.sender_id))];
  if (senderIds.length > 0) {
    try {
      const { data: users } = await supabase.from('users').select('id, name').in('id', senderIds);
      for (const u of (Array.isArray(users) ? users : []) as Array<{ id: string; name: string | null }>) {
        if (u.name) senderNames.set(u.id, u.name);
      }
    } catch {
      // Names are optional.
    }
  }

  const items: WidgetItemInput[] = rows.map((row) => ({
    title: String(row.movie_title ?? '').slice(0, 120) || 'Untitled',
    year: typeof row.movie_year === 'number' && row.movie_year > 0 ? row.movie_year : null,
    sender: (senderNames.get(row.sender_id) ?? 'A friend').slice(0, 60),
    posterUrl: toWidgetPosterUrl(row.movie_poster),
    path: toItemPath(row),
  }));

  const unwatchedCount = await countUnwatched(userId).catch(() => 0);
  return { items, unwatchedCount };
}

/**
 * Keeps the iOS home screen widget ("Latest from friends") in sync with the signed-in
 * user's received picks. Self-gated: renders nothing and does nothing outside the
 * Capacitor iOS app. Must be mounted inside <AuthProvider>.
 */
export function NativeWidgetSync() {
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const inFlightRef = useRef<Promise<void> | null>(null);
  const queuedRef = useRef(false);
  const latestSyncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (loading || !isBibNativeAvailable()) return;

    let disposed = false;
    const removers: Array<() => void> = [];

    const runSync = async (): Promise<void> => {
      if (disposed) return;
      const epoch = widgetLogoutEpoch;
      const stale = () => disposed || epoch !== widgetLogoutEpoch;
      if (!userId) {
        // Also covers startup while signed out: any leftover snapshot is removed.
        await clearWidgetData().catch(() => undefined);
        return;
      }
      // The snapshot's owner is persisted natively (App Group). Clear another account's
      // snapshot BEFORE fetching, so a failed fetch can never leave it visible.
      try {
        await ensureWidgetOwner(userId);
      } catch {
        await clearWidgetData().catch(() => undefined);
      }
      if (stale()) return;
      try {
        const payload = await buildWidgetPayload(userId);
        if (stale()) return;
        await setWidgetData({ ownerId: userId, ...payload });
      } catch {
        // Keep this user's last snapshot on transient failures.
      }
    };

    // Serialize: at most one native write in flight, coalescing extra requests.
    const sync = () => {
      if (inFlightRef.current) {
        queuedRef.current = true;
        return;
      }
      inFlightRef.current = runSync().finally(() => {
        inFlightRef.current = null;
        if (queuedRef.current) {
          queuedRef.current = false;
          // Run the newest effect's sync (the user may have changed meanwhile).
          latestSyncRef.current?.();
        }
      });
    };

    latestSyncRef.current = sync;
    sync();

    if (userId) {
      const interval = window.setInterval(() => {
        if (document.visibilityState === 'visible') sync();
      }, REFRESH_INTERVAL_MS);
      removers.push(() => window.clearInterval(interval));

      void (async () => {
        try {
          const { App } = await import('@capacitor/app');
          const listener = await App.addListener('appStateChange', ({ isActive }) => {
            if (isActive) sync();
          });
          if (disposed) {
            void listener.remove();
          } else {
            removers.push(() => void listener.remove());
          }
        } catch {
          // App plugin unavailable: interval refresh still runs.
        }
      })();
    }

    return () => {
      disposed = true;
      if (latestSyncRef.current === sync) latestSyncRef.current = null;
      removers.forEach((remove) => remove());
    };
  }, [loading, userId]);

  return null;
}
