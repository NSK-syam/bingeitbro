'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getReceivedFriendRecommendations,
  getUpcomingWatchReminders,
  type ReceivedRecommendationRow,
  type WatchReminder,
} from '@/lib/supabase-rest';
import { getTrendingToday, type NewRelease } from '@/lib/tmdb';
import { getWatchReminderOpenPath } from '@/lib/watch-reminder-path';
import { mapToAppDestination } from '@/lib/native/app-routes';
import { getNativeAccountSync } from '@/lib/native/watch-reminders';

/** One poster-ready item for Home, already mapped to its app screen. */
export type HomeItem = {
  id: string;
  /** Watchlist key, same ids the website uses (tmdb-123 or a recommendation id). */
  movieId: string;
  title: string;
  poster: string | null;
  year: number | null;
  href: string | null;
  from?: { name: string; avatar?: string | null } | null;
  note?: string | null;
  unread?: boolean;
  at?: string | null;
};

export type SectionState<T> =
  | { status: 'loading' }
  | { status: 'ready'; items: T[] }
  | { status: 'error' }
  /** Network unavailable: items are what's saved on this phone (may be empty). */
  | { status: 'offline'; items: T[] };

function appHref(websitePath: string | null): string | null {
  if (!websitePath) return null;
  const dest = mapToAppDestination(websitePath, { signedIn: true });
  return dest?.kind === 'app' ? dest.path : null;
}

function recMovieId(rec: Pick<ReceivedRecommendationRow, 'tmdb_id' | 'recommendation_id'>): string | null {
  if (rec.tmdb_id !== null && rec.tmdb_id !== undefined && String(rec.tmdb_id).trim()) return `tmdb-${String(rec.tmdb_id).trim()}`;
  return rec.recommendation_id || null;
}

export function friendRecToItem(rec: ReceivedRecommendationRow): HomeItem {
  const movieId = recMovieId(rec);
  return {
    id: rec.id,
    movieId: movieId ?? rec.id,
    title: rec.movie_title || 'A movie',
    poster: rec.movie_poster || null,
    year: rec.movie_year ?? null,
    href: movieId ? appHref(`/movie/${encodeURIComponent(movieId)}`) : null,
    from: rec.sender ? { name: rec.sender.name || 'A friend', avatar: rec.sender.avatar ?? null } : null,
    note: rec.personal_message || null,
    unread: !rec.is_read,
    at: rec.created_at,
  };
}

export function reminderToItem(reminder: WatchReminder): HomeItem {
  return {
    id: reminder.id,
    movieId: reminder.movieId,
    title: reminder.movieTitle,
    poster: reminder.moviePoster,
    year: reminder.movieYear,
    href: appHref(getWatchReminderOpenPath(reminder.movieId)),
    at: reminder.remindAt,
  };
}

export function trendingToItem(movie: NewRelease): HomeItem {
  const movieId = `tmdb-${movie.id}`;
  return {
    id: String(movie.id),
    movieId,
    title: movie.title,
    poster: movie.poster_path,
    year: movie.release_date ? Number(movie.release_date.slice(0, 4)) || null : null,
    href: appHref(`/movie/${movieId}`),
  };
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

type HomeData = {
  picks: SectionState<HomeItem>;
  tonight: SectionState<HomeItem>;
  trending: SectionState<HomeItem>;
  reload: () => void;
};

/**
 * Loads Home's three sections in parallel; each fails independently. When the phone is offline,
 * picks and the schedule come from the account-scoped offline cache (native app only).
 */
export function useHomeData(userId: string | null): HomeData {
  const [picks, setPicks] = useState<SectionState<HomeItem>>({ status: 'loading' });
  const [tonight, setTonight] = useState<SectionState<HomeItem>>({ status: 'loading' });
  const [trending, setTrending] = useState<SectionState<HomeItem>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const runRef = useRef(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!userId) return;
    const run = ++runRef.current;
    const live = () => run === runRef.current;

    const offlineFallback = async () => {
      const saved = await getNativeAccountSync()?.readSaved(userId).catch(() => null);
      const fromCache = (entry: { items: { id: string; title: string; poster?: string | null; year?: number | null; path?: string; at?: string | null; note?: string | null }[] } | null | undefined): HomeItem[] =>
        (entry?.items ?? []).map((item) => ({
          id: item.id,
          movieId: item.id,
          title: item.title,
          poster: item.poster ?? null,
          year: item.year ?? null,
          href: appHref(item.path ?? null),
          note: item.note ?? null,
          at: item.at ?? null,
        }));
      return { picks: fromCache(saved?.friendRecs), tonight: fromCache(saved?.scheduled) };
    };

    void (async () => {
      setPicks({ status: 'loading' });
      setTonight({ status: 'loading' });
      setTrending({ status: 'loading' });
      const [recs, reminders, trend] = await Promise.allSettled([
        getReceivedFriendRecommendations(userId),
        getUpcomingWatchReminders(),
        getTrendingToday(),
      ]);
      if (!live()) return;

      const offline = isOffline();
      const cached = offline || recs.status === 'rejected' || reminders.status === 'rejected' ? await offlineFallback() : null;
      if (!live()) return;

      if (recs.status === 'fulfilled') setPicks({ status: 'ready', items: recs.value.map(friendRecToItem) });
      else setPicks(offline ? { status: 'offline', items: cached?.picks ?? [] } : { status: 'error' });

      if (reminders.status === 'fulfilled') {
        const now = Date.now();
        const upcoming = reminders.value
          .filter((r) => !r.canceledAt && new Date(r.remindAt).getTime() > now)
          .sort((a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime());
        setTonight({ status: 'ready', items: upcoming.map(reminderToItem) });
      } else {
        setTonight(offline ? { status: 'offline', items: cached?.tonight ?? [] } : { status: 'error' });
      }

      if (trend.status === 'fulfilled') setTrending({ status: 'ready', items: trend.value.map(trendingToItem) });
      else setTrending(offline ? { status: 'offline', items: [] } : { status: 'error' });
    })();

    return () => {
      // Unmount, reload or account change: results of this run are discarded.
      runRef.current += 1;
    };
  }, [userId, attempt]);

  // Reload automatically when the connection comes back.
  useEffect(() => {
    const onOnline = () => reload();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [reload]);

  return { picks, tonight, trending, reload };
}
