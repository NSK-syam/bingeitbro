/**
 * Pure data logic for the app shell's Home screen (no React, no window): mapping rows and cached
 * entries to poster items, account ownership of loaded state, and cache freshness. Unit-tested in
 * scripts/mobile/test-home-data.mjs.
 */
import { mapToAppDestination } from '../../../lib/native/app-routes.ts';
import { getWatchReminderOpenPath } from '../../../lib/watch-reminder-path.ts';
import type { ReceivedRecommendationRow, WatchReminder } from '../../../lib/supabase-rest';
import type { NewRelease } from '../../../lib/tmdb';

/** One poster-ready item for Home, already mapped to its app screen. */
export type HomeItem = {
  /** Row id (friend_recommendations / watch_reminders / TMDB id). Never a watchlist key. */
  id: string;
  /**
   * Watchlist key: the title id the website uses (`tmdb-123` or a recommendation id). Null when no
   * safe title identity exists (then Save is not offered).
   */
  movieId: string | null;
  title: string;
  poster: string | null;
  year: number | null;
  href: string | null;
  from?: { name: string; avatar?: string | null } | null;
  note?: string | null;
  unread?: boolean;
  at?: string | null;
};

export type SectionState =
  | { status: 'loading' }
  | { status: 'ready'; items: HomeItem[] }
  /** Request failed and nothing is saved on this phone. */
  | { status: 'error' }
  /** Showing what's saved on this phone: because the phone is offline, or the request failed. */
  | { status: 'cached'; items: HomeItem[]; reason: 'offline' | 'error' };

/** A section's state tagged with the account it was loaded for. */
export type OwnedSection = { owner: string | null; state: SectionState };

/** State for `userId`, or loading when it belongs to another account (never shows A's data to B). */
export function sectionFor(owned: OwnedSection, userId: string | null): SectionState {
  if (!userId || owned.owner !== userId) return { status: 'loading' };
  return owned.state;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function appHref(websitePath: string | null | undefined): string | null {
  if (!websitePath) return null;
  const dest = mapToAppDestination(websitePath, { signedIn: true });
  return dest?.kind === 'app' ? dest.path : null;
}

/**
 * The watchlist key for a movie path like `/movie/tmdb-123` (or `/app/title/movie/…`). Shows and
 * anything else return null: the Home hero only offers Save for movies.
 */
export function movieIdFromPath(path: string | null | undefined): string | null {
  const match = /^\/(?:app\/title\/)?movie\/([^/?#]+)/.exec(String(path ?? ''));
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return ID_RE.test(id) ? id : null;
}

function recMovieId(rec: Pick<ReceivedRecommendationRow, 'tmdb_id' | 'recommendation_id'>): string | null {
  const tmdb = rec.tmdb_id === null || rec.tmdb_id === undefined ? '' : String(rec.tmdb_id).trim();
  if (tmdb && /^\d+$/.test(tmdb)) return `tmdb-${tmdb}`;
  return rec.recommendation_id && ID_RE.test(rec.recommendation_id) ? rec.recommendation_id : null;
}

export function friendRecToItem(rec: ReceivedRecommendationRow): HomeItem {
  const movieId = recMovieId(rec);
  return {
    id: rec.id,
    movieId,
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
  const websitePath = getWatchReminderOpenPath(reminder.movieId);
  return {
    id: reminder.id,
    movieId: movieIdFromPath(websitePath),
    title: reminder.movieTitle,
    poster: reminder.moviePoster,
    year: reminder.movieYear,
    href: appHref(websitePath),
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

/** Upcoming, non-canceled reminders, soonest first. */
export function upcomingReminders(reminders: WatchReminder[], now: number): WatchReminder[] {
  return reminders
    .filter((r) => !r.canceledAt && new Date(r.remindAt).getTime() > now)
    .sort((a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime());
}

/** Shape of one cached item (see OfflineItem in lib/native/account-sync-core.ts). */
export type CachedItem = {
  id: string;
  title: string;
  poster?: string | null;
  year?: number | null;
  path?: string;
  at?: string | null;
  note?: string | null;
};

/**
 * Maps cached entries to Home items. The cache's `id` is a row id, so the watchlist key comes from
 * the cached title path. With `upcomingOnly`, expired scheduled watches are dropped.
 */
export function cachedToItems(items: CachedItem[] | null | undefined, opts: { now: number; upcomingOnly?: boolean }): HomeItem[] {
  const list = (items ?? []).map((item) => ({
    id: item.id,
    movieId: movieIdFromPath(item.path),
    title: item.title,
    poster: item.poster ?? null,
    year: item.year ?? null,
    href: appHref(item.path ?? null),
    note: item.note ?? null,
    at: item.at ?? null,
  }));
  if (!opts.upcomingOnly) return list;
  return list
    .filter((item) => item.at && Number.isFinite(new Date(item.at).getTime()) && new Date(item.at).getTime() > opts.now)
    .sort((a, b) => new Date(a.at as string).getTime() - new Date(b.at as string).getTime());
}

/** After a failed request: saved items if there are any, else an error. */
export function failedSection(cached: HomeItem[] | null, offline: boolean): SectionState {
  if (cached && cached.length > 0) return { status: 'cached', items: cached, reason: offline ? 'offline' : 'error' };
  if (offline) return { status: 'cached', items: [], reason: 'offline' };
  return { status: 'error' };
}
