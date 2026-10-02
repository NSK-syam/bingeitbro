/**
 * Platform-independent core of the native app's account-scoped device sync:
 * on-device watch-reminder notifications and the offline caches.
 *
 * Plugins are injected (see watch-reminders.ts for the Capacitor wiring), so
 * this file has no imports and can be exercised from Node
 * (scripts/mobile/test-native-account-sync.mjs). Keep it to erasable
 * TypeScript syntax only (no enums / parameter properties / namespaces).
 *
 * Invariants:
 * - Every native mutation (schedule, cancel, cache write, clear) runs through
 *   one serial queue, so an account clear never interleaves with an older
 *   in-flight mutation.
 * - setAccount() bumps a generation counter. Async work captures the
 *   generation + account before awaiting and re-checks after every await;
 *   stale results are dropped.
 * - Account transitions (sign-out, A -> B) cancel this app's notifications and
 *   clear private caches regardless of network state.
 * - Sign-out persists a pending-logout marker before cleaning up and only
 *   removes it after the cleanup really finished (never on a timeout); a
 *   leftover marker hides private data and is honored on the next startup.
 * - Private caches (scheduled watches, friend recommendations) carry the
 *   owner's userId and are only returned for that owner. The watchlist is
 *   device-local (localStorage) and is cached with userId null.
 */

export const OFFLINE_CACHE_KEYS = {
  watchlist: 'bib_offline_watchlist',
  scheduled: 'bib_offline_scheduled',
  friendRecs: 'bib_offline_friend_recs',
} as const;

/** userId of the signed-in account that owns the private caches; absent when signed out. */
export const OFFLINE_OWNER_KEY = 'bib_offline_owner';

/**
 * Pending sign-out marker: `{ token, userId, at }`. Written before sign-out
 * cleanup starts and removed (by the same token only) once cancel + cache
 * clear + owner removal have really completed. While it exists no private
 * offline data is shown, and the next startup finishes the cleanup.
 */
export const LOGOUT_PENDING_KEY = 'bib_offline_logout_pending';

export type OfflineCacheKind = keyof typeof OFFLINE_CACHE_KEYS;
export type PrivateCacheKind = Exclude<OfflineCacheKind, 'watchlist'>;

export type OfflineItem = {
  id: string;
  title: string;
  poster?: string | null;
  year?: number | null;
  /** In-app path, e.g. /movie/tmdb-123. */
  path?: string;
  /** ISO time: scheduled watch time, or when it was added / sent. */
  at?: string | null;
  /** Secondary line, e.g. "From Ravi". */
  note?: string | null;
};

export type OfflineCacheEntry = {
  version: 1;
  savedAt: string;
  /** Owner account for private caches; null for device-local data (watchlist). */
  userId: string | null;
  items: OfflineItem[];
};

export const WATCH_REMINDER_KIND = 'bib-watch-reminder';
export const FRIEND_REMINDER_KIND = 'bib-friend-reminder';

export type NativeNotificationExtra = {
  kind: typeof WATCH_REMINDER_KIND | typeof FRIEND_REMINDER_KIND;
  reminderId: string;
  movieId: string;
  /** In-app path opened when the notification is tapped. */
  path: string;
  remindAt?: string;
  /** Account the notification belongs to. */
  userId?: string;
};

export type NativeNotification = {
  id: number;
  title: string;
  body: string;
  schedule?: { at: Date; allowWhileIdle: boolean };
  isExactNotification?: boolean;
  extra: NativeNotificationExtra;
};

export type ReminderLike = {
  id: string;
  movieId: string;
  movieTitle: string;
  moviePoster: string | null;
  movieYear: number | null;
  remindAt: string;
  canceledAt: string | null;
};

export type FriendReminderLike = {
  id: string;
  movieId: string;
  movieTitle: string;
  senderName: string;
};

export interface NotificationsPort {
  getPending(): Promise<Array<{ id: number; extra?: unknown }>>;
  cancel(ids: number[]): Promise<void>;
  schedule(notifications: NativeNotification[]): Promise<void>;
  /** Resolve true when display permission is granted; may prompt only when `prompt` is true. */
  ensurePermission(prompt: boolean): Promise<boolean>;
}

export interface StoragePort {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export type AccountSyncDeps = {
  notifications: NotificationsPort;
  storage: StoragePort;
  /** In-app path for a watch reminder's movieId. */
  pathForMovie: (movieId: string) => string;
  now?: () => number;
};

export type SyncFetchers = {
  reminders: () => Promise<ReminderLike[]>;
  friendRecs: () => Promise<OfflineItem[]>;
};

export type SyncOutcome = 'synced' | 'stale' | 'skipped';

export type SavedLists = {
  owner: string | null;
  watchlist: OfflineCacheEntry | null;
  scheduled: OfflineCacheEntry | null;
  friendRecs: OfflineCacheEntry | null;
};

const MAX_ITEMS = 100;

/** Promise queue: each task starts after the previous one settled. A failing task does not break the chain. */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

/**
 * Stable positive 31-bit id (Android requires a Java int). FNV-1a, namespaced
 * so watch and friend reminders never collide.
 */
export function notificationIdFor(namespace: string, reminderId: string): number {
  let hash = 0x811c9dc5;
  const input = `${namespace}:${reminderId}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const id = hash & 0x7fffffff;
  return id === 0 ? 1 : id;
}

export function readNotificationExtra(value: unknown): NativeNotificationExtra | null {
  if (!value || typeof value !== 'object') return null;
  const extra = value as Partial<NativeNotificationExtra>;
  if (extra.kind !== WATCH_REMINDER_KIND && extra.kind !== FRIEND_REMINDER_KIND) return null;
  if (typeof extra.path !== 'string') return null;
  return extra as NativeNotificationExtra;
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function serializeCacheEntry(userId: string | null, items: OfflineItem[], now: number): string {
  const entry: OfflineCacheEntry = {
    version: 1,
    savedAt: new Date(now).toISOString(),
    userId,
    items: items.slice(0, MAX_ITEMS).map((item) => ({
      id: String(item.id),
      title: truncate(item.title, 200) || 'Untitled',
      poster: truncate(item.poster, 500),
      year: item.year ?? null,
      path: item.path,
      at: item.at ?? null,
      note: truncate(item.note, 200),
    })),
  };
  return JSON.stringify(entry);
}

export function parseCacheEntry(value: string | null): OfflineCacheEntry | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<OfflineCacheEntry>;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return {
      version: 1,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
      userId: typeof parsed.userId === 'string' ? parsed.userId : null,
      items: parsed.items.filter(
        (item): item is OfflineItem => !!item && typeof item.id === 'string' && typeof item.title === 'string',
      ),
    };
  } catch {
    return null;
  }
}

export function createNativeAccountSync(deps: AccountSyncDeps) {
  const enqueue = createSerialQueue();
  const now = deps.now ?? (() => Date.now());
  const { notifications, storage } = deps;

  let generation = 0;
  /** undefined until the first setAccount(); null when signed out. */
  let account: string | null | undefined;

  const isCurrent = (gen: number, userId: string | null) => gen === generation && account === userId;

  const isFuture = (reminder: ReminderLike) => {
    if (reminder.canceledAt) return false;
    const at = new Date(reminder.remindAt).getTime();
    return Number.isFinite(at) && at > now() + 5_000;
  };

  const toWatchNotification = (reminder: ReminderLike, userId: string): NativeNotification => ({
    id: notificationIdFor(WATCH_REMINDER_KIND, reminder.id),
    title: 'Time to watch 🍿',
    body: `${reminder.movieTitle}${reminder.movieYear ? ` (${reminder.movieYear})` : ''} is on your schedule.`,
    schedule: { at: new Date(reminder.remindAt), allowWhileIdle: true },
    // Inexact on Android: never bounce the user to the "Alarms & reminders" settings screen.
    isExactNotification: false,
    extra: {
      kind: WATCH_REMINDER_KIND,
      reminderId: reminder.id,
      movieId: reminder.movieId,
      path: deps.pathForMovie(reminder.movieId),
      remindAt: reminder.remindAt,
      userId,
    },
  });

  const cancelWhere = async (predicate: (extra: NativeNotificationExtra) => boolean) => {
    const pending = await notifications.getPending();
    const ids = pending
      .filter((n) => {
        const extra = readNotificationExtra(n.extra);
        return extra ? predicate(extra) : false;
      })
      .map((n) => n.id);
    if (ids.length > 0) await notifications.cancel(ids);
  };

  /** Cancel every notification this app scheduled and drop private caches. Runs inside the queue. */
  /** Returns true only if every step succeeded. */
  const clearAccountData = async (): Promise<boolean> => {
    const results = await Promise.allSettled([
      cancelWhere(() => true),
      storage.remove(OFFLINE_CACHE_KEYS.scheduled),
      storage.remove(OFFLINE_CACHE_KEYS.friendRecs),
    ]);
    return results.every((r) => r.status === 'fulfilled');
  };

  /** Full sign-out cleanup: notifications, private caches, owner key. True only if all completed. */
  const clearEverythingPrivate = async (): Promise<boolean> => {
    const cleared = await clearAccountData();
    try {
      await storage.remove(OFFLINE_OWNER_KEY);
    } catch {
      return false;
    }
    return cleared;
  };

  // Marker reads/writes get their own queue so a marker write is never stuck
  // behind a slow native mutation, and compare-and-delete can't race a newer write.
  const markerQueue = createSerialQueue();
  let tokenCounter = 0;

  const readMarker = async (): Promise<{ token: string; userId: string | null } | null> => {
    let raw: string | null = null;
    try {
      raw = await storage.get(LOGOUT_PENDING_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { token?: unknown; userId?: unknown };
      return {
        token: typeof parsed.token === 'string' ? parsed.token : raw,
        userId: typeof parsed.userId === 'string' ? parsed.userId : null,
      };
    } catch {
      // Unreadable marker still counts as pending.
      return { token: raw, userId: null };
    }
  };

  const writeMarker = (userId: string | null): Promise<string> =>
    markerQueue(async () => {
      tokenCounter += 1;
      const token = `${now()}-${tokenCounter}-${Math.random().toString(36).slice(2, 10)}`;
      await storage.set(LOGOUT_PENDING_KEY, JSON.stringify({ token, userId, at: new Date(now()).toISOString() }));
      return token;
    });

  /** Remove the marker only if it is still the one this task owns. */
  const clearMarkerIf = (token: string): Promise<boolean> =>
    markerQueue(async () => {
      const current = await readMarker();
      if (!current || current.token !== token) return false;
      await storage.remove(LOGOUT_PENDING_KEY);
      return true;
    });

  /** Finish an interrupted sign-out (queued). True when no marker remains for that run. */
  const finishPendingLogout = (): Promise<boolean> =>
    enqueue(async () => {
      const marker = await markerQueue(readMarker);
      if (!marker) return true;
      if (!(await clearEverythingPrivate())) return false;
      await clearMarkerIf(marker.token);
      return true;
    });

  /**
   * Tell the controller which account is signed in (null = signed out). Call
   * whenever auth settles, online or offline. On any change it cancels
   * reminders and clears private caches before recording the new owner.
   */
  function setAccount(userId: string | null): Promise<void> {
    if (account === userId) return Promise.resolve();
    const previous = account;
    account = userId;
    generation += 1;
    return enqueue(async () => {
      let storedOwner: string | null = null;
      try {
        storedOwner = await storage.get(OFFLINE_OWNER_KEY);
      } catch {
        storedOwner = null;
      }
      const marker = await markerQueue(readMarker);
      // Known in-memory switch, the device was left with another owner's data
      // (sign-out / switch in a previous session), or an unfinished sign-out.
      const switched = previous !== undefined || storedOwner !== userId || marker !== null;
      if (switched) {
        const cleared = await clearEverythingPrivate();
        if (cleared && marker) await clearMarkerIf(marker.token);
      }
      try {
        if (userId) {
          await storage.set(OFFLINE_OWNER_KEY, userId);
        } else {
          await storage.remove(OFFLINE_OWNER_KEY);
        }
      } catch {
        // Ignore storage failures.
      }
    });
  }

  /** Server -> device reconcile for the given account. Network fetches run outside the queue. */
  async function sync(userId: string | null, fetchers: SyncFetchers): Promise<SyncOutcome> {
    if (!userId || account !== userId) return 'skipped';
    const gen = generation;
    const [remindersResult, recsResult] = await Promise.allSettled([fetchers.reminders(), fetchers.friendRecs()]);
    if (!isCurrent(gen, userId)) return 'stale';

    return enqueue(async (): Promise<SyncOutcome> => {
      if (!isCurrent(gen, userId)) return 'stale';

      if (remindersResult.status === 'fulfilled') {
        const upcoming = remindersResult.value
          .filter(isFuture)
          .sort((a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime());

        await storage.set(
          OFFLINE_CACHE_KEYS.scheduled,
          serializeCacheEntry(
            userId,
            upcoming.map((r) => ({
              id: r.id,
              title: r.movieTitle,
              poster: r.moviePoster,
              year: r.movieYear,
              path: deps.pathForMovie(r.movieId),
              at: r.remindAt,
            })),
            now(),
          ),
        );
        if (!isCurrent(gen, userId)) return 'stale';

        const desired = new Map<number, ReminderLike>();
        upcoming.forEach((r) => desired.set(notificationIdFor(WATCH_REMINDER_KIND, r.id), r));

        const pending = await notifications.getPending();
        if (!isCurrent(gen, userId)) return 'stale';
        const keep = new Set<number>();
        const stale: number[] = [];
        pending.forEach((n) => {
          const extra = readNotificationExtra(n.extra);
          if (!extra || extra.kind !== WATCH_REMINDER_KIND) return;
          const want = desired.get(n.id);
          if (want && extra.userId === userId && want.remindAt === extra.remindAt && want.movieId === extra.movieId) {
            keep.add(n.id);
          } else {
            stale.push(n.id);
          }
        });
        if (stale.length > 0) {
          await notifications.cancel(stale);
          if (!isCurrent(gen, userId)) return 'stale';
        }

        const toSchedule = [...desired.entries()]
          .filter(([id]) => !keep.has(id))
          .map(([, r]) => toWatchNotification(r, userId));
        if (toSchedule.length > 0) {
          // Only reached when the user has upcoming scheduled watches, so asking is in context.
          const granted = await notifications.ensurePermission(true);
          if (!isCurrent(gen, userId)) return 'stale';
          if (granted) await notifications.schedule(toSchedule);
        }
      }

      if (recsResult.status === 'fulfilled') {
        if (!isCurrent(gen, userId)) return 'stale';
        await storage.set(OFFLINE_CACHE_KEYS.friendRecs, serializeCacheEntry(userId, recsResult.value, now()));
      }
      return isCurrent(gen, userId) ? 'synced' : 'stale';
    });
  }

  /**
   * Sign-out cleanup (awaited by AuthProvider.signOut via the logout registry).
   * 1. Invalidate in-flight work and mark the account signed out (sync).
   * 2. Persist the pending-logout marker BEFORE any cleanup.
   * 3. Cancel notifications, clear private caches, remove the owner key.
   * 4. Remove the marker (only this run's token) once 3 fully succeeded.
   * Resolves true when cleanup completed. If the caller gives up (timeout)
   * the marker stays and the next startup finishes the job.
   */
  async function logout(userId: string | null = null): Promise<boolean> {
    account = null;
    generation += 1;
    let token: string | null = null;
    try {
      token = await writeMarker(userId);
    } catch {
      // Could not persist the marker; still clean up now. The startup check
      // (owner key present while signed out) remains as a fallback.
    }
    return enqueue(async () => {
      if (!(await clearEverythingPrivate())) return false;
      if (token) await clearMarkerIf(token);
      return true;
    });
  }

  /** After the user saves / reschedules a watch reminder (user-initiated: may prompt). */
  function scheduleReminder(reminder: ReminderLike, userId: string): Promise<boolean> {
    const gen = generation;
    return enqueue(async () => {
      if (!isCurrent(gen, userId)) return false;
      await cancelWhere((extra) => extra.kind === WATCH_REMINDER_KIND && extra.movieId === reminder.movieId);
      if (!isFuture(reminder) || !isCurrent(gen, userId)) return false;
      const granted = await notifications.ensurePermission(true);
      if (!granted || !isCurrent(gen, userId)) return false;
      await notifications.schedule([toWatchNotification(reminder, userId)]);
      return true;
    });
  }

  /** After the user removes a scheduled watch. */
  function cancelReminder(movieId: string): Promise<void> {
    return enqueue(() =>
      cancelWhere((extra) => extra.kind === WATCH_REMINDER_KIND && extra.movieId === movieId),
    );
  }

  /** Immediate local notifications for due friend reminders (never prompts). */
  function showFriendReminders(
    reminders: FriendReminderLike[],
    getPath: (reminder: FriendReminderLike) => string,
    userId: string,
  ): Promise<boolean> {
    const gen = generation;
    if (reminders.length === 0) return Promise.resolve(false);
    return enqueue(async () => {
      if (!isCurrent(gen, userId)) return false;
      const granted = await notifications.ensurePermission(false);
      if (!granted || !isCurrent(gen, userId)) return false;
      await notifications.schedule(
        reminders.map((reminder) => ({
          id: notificationIdFor(FRIEND_REMINDER_KIND, reminder.id),
          title: 'Friend reminder',
          body: `${reminder.senderName} reminded you to watch ${reminder.movieTitle}`,
          extra: {
            kind: FRIEND_REMINDER_KIND,
            reminderId: reminder.id,
            movieId: reminder.movieId,
            path: getPath(reminder),
            userId,
          },
        })),
      );
      return true;
    });
  }

  /** Device-local watchlist mirror (not account-scoped, matching localStorage). */
  function writeWatchlist(items: OfflineItem[]): Promise<void> {
    return enqueue(() => storage.set(OFFLINE_CACHE_KEYS.watchlist, serializeCacheEntry(null, items, now())));
  }

  /**
   * Read the offline lists. Private lists are returned only when their stored
   * userId matches the owner: `currentUserId` when known, otherwise the last
   * signed-in owner recorded on the device. No owner -> no private data.
   */
  async function readSaved(currentUserId: string | null | undefined): Promise<SavedLists> {
    const read = async (key: string) => {
      try {
        return parseCacheEntry(await storage.get(key));
      } catch {
        return null;
      }
    };
    let storedOwner: string | null = null;
    try {
      storedOwner = await storage.get(OFFLINE_OWNER_KEY);
    } catch {
      storedOwner = null;
    }
    // An unfinished sign-out hides all private data until it is completed.
    const pendingLogout = (await markerQueue(readMarker)) !== null;
    const owner = pendingLogout ? null : currentUserId === undefined ? storedOwner : currentUserId;
    const [watchlist, scheduled, friendRecs] = await Promise.all([
      read(OFFLINE_CACHE_KEYS.watchlist),
      read(OFFLINE_CACHE_KEYS.scheduled),
      read(OFFLINE_CACHE_KEYS.friendRecs),
    ]);
    const owned = (entry: OfflineCacheEntry | null) =>
      entry && owner && entry.userId === owner ? entry : null;
    return { owner: owner ?? null, watchlist, scheduled: owned(scheduled), friendRecs: owned(friendRecs) };
  }

  /** Resolves once every queued mutation so far has finished (tests / diagnostics). */
  function idle(): Promise<void> {
    return enqueue(async () => undefined);
  }

  return {
    setAccount,
    logout,
    finishPendingLogout,
    sync,
    scheduleReminder,
    cancelReminder,
    showFriendReminders,
    writeWatchlist,
    readSaved,
    idle,
    /** Current generation (tests). */
    getGeneration: () => generation,
  };
}

export type NativeAccountSync = ReturnType<typeof createNativeAccountSync>;
