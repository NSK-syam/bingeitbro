'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getReceivedFriendRecommendations, getUpcomingWatchReminders } from '@/lib/supabase-rest';
import { getTrendingToday } from '@/lib/tmdb';
import { getNativeAccountSync } from '@/lib/native/watch-reminders';
import {
  cachedToItems,
  failedSection,
  friendRecToItem,
  reminderToItem,
  sectionFor,
  trendingToItem,
  upcomingReminders,
  type HomeItem,
  type OwnedSection,
  type SectionState,
} from './home-data-core';

export type { HomeItem, SectionState } from './home-data-core';

const REQUEST_TIMEOUT_MS = 12_000;
const TRENDING_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function browserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

type Cached = { picks: HomeItem[]; tonight: HomeItem[] };

/** Account-scoped saved items (native app only; null on the web or when unreadable). */
async function readCached(userId: string): Promise<Cached | null> {
  try {
    const saved = await getNativeAccountSync()?.readSaved(userId);
    if (!saved) return null;
    const now = Date.now();
    return {
      picks: cachedToItems(saved.friendRecs?.items, { now }),
      tonight: cachedToItems(saved.scheduled?.items, { now, upcomingOnly: true }),
    };
  } catch {
    return null;
  }
}

type HomeData = {
  picks: SectionState;
  tonight: SectionState;
  trending: SectionState;
  /** The phone reported going offline (loaded content stays visible). */
  offline: boolean;
  reload: () => void;
};

const LOADING = (owner: string | null): OwnedSection => ({ owner, state: { status: 'loading' } });

/**
 * Loads Home's three sections independently (a slow section never holds the others). Every
 * section's state is tagged with the account it belongs to, so another account's data is never
 * returned, even for the first render after an account change. Offline: shows what's saved on
 * this phone, keeps loaded content when the connection drops, and reloads when it returns.
 */
export function useHomeData(userId: string | null): HomeData {
  const [picks, setPicks] = useState<OwnedSection>(LOADING(null));
  const [tonight, setTonight] = useState<OwnedSection>(LOADING(null));
  const [trending, setTrending] = useState<OwnedSection>(LOADING(null));
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const runRef = useRef(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!userId) return;
    const run = ++runRef.current;
    const live = () => run === runRef.current;
    let cachedPromise: Promise<Cached | null> | null = null;
    const cached = () => (cachedPromise ??= readCached(userId));
    const set = (setter: typeof setPicks, state: SectionState) => {
      if (live()) setter({ owner: userId, state });
    };

    void (async () => {
      set(setPicks, { status: 'loading' });
      set(setTonight, { status: 'loading' });
      set(setTrending, { status: 'loading' });
      if (live()) setOffline(browserOffline());

      if (browserOffline()) {
        // Known offline: don't wait on the network, show what's saved right away.
        const saved = await cached();
        set(setPicks, failedSection(saved?.picks ?? null, true));
        set(setTonight, failedSection(saved?.tonight ?? null, true));
        set(setTrending, { status: 'cached', items: [], reason: 'offline' });
        return;
      }

      const picksTask = withTimeout(getReceivedFriendRecommendations(userId), REQUEST_TIMEOUT_MS)
        .then((rows) => set(setPicks, { status: 'ready', items: rows.map(friendRecToItem) }))
        .catch(async () => {
          const saved = await cached();
          set(setPicks, failedSection(saved?.picks ?? null, browserOffline()));
        });

      const tonightTask = withTimeout(getUpcomingWatchReminders(), REQUEST_TIMEOUT_MS)
        .then((rows) => set(setTonight, { status: 'ready', items: upcomingReminders(rows, Date.now()).map(reminderToItem) }))
        .catch(async () => {
          const saved = await cached();
          set(setTonight, failedSection(saved?.tonight ?? null, browserOffline()));
        });

      const trendingTask = withTimeout(getTrendingToday({ throwOnError: true }), TRENDING_TIMEOUT_MS)
        .then((movies) => set(setTrending, { status: 'ready', items: movies.map(trendingToItem) }))
        .catch(() => set(setTrending, browserOffline() ? { status: 'cached', items: [], reason: 'offline' } : { status: 'error' }));

      await Promise.allSettled([picksTask, tonightTask, trendingTask]);
    })();

    return () => {
      // Unmount, reload or account change: results of this run are discarded.
      runRef.current += 1;
    };
  }, [userId, attempt]);

  // Connection changes: keep what's loaded when it drops; reload when it comes back.
  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => {
      setOffline(false);
      reload();
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [reload]);

  return {
    picks: sectionFor(picks, userId),
    tonight: sectionFor(tonight, userId),
    trending: sectionFor(trending, userId),
    offline,
    reload,
  };
}
