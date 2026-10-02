'use client';

import { isNativeApp } from '@/lib/native-app';

/**
 * On-device cache (Capacitor Preferences) of the user's lists so the app can
 * show something useful offline. Keys and shapes are also read by the static
 * fallback page capacitor-www/index.html; keep them in sync.
 */
export const OFFLINE_CACHE_KEYS = {
  watchlist: 'bib_offline_watchlist',
  scheduled: 'bib_offline_scheduled',
  friendRecs: 'bib_offline_friend_recs',
} as const;

export type OfflineCacheKind = keyof typeof OFFLINE_CACHE_KEYS;

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
  userId: string | null;
  items: OfflineItem[];
};

const MAX_ITEMS = 100;

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export async function writeOfflineCache(
  kind: OfflineCacheKind,
  userId: string | null,
  items: OfflineItem[],
): Promise<void> {
  if (!isNativeApp()) return;
  const entry: OfflineCacheEntry = {
    version: 1,
    savedAt: new Date().toISOString(),
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
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: OFFLINE_CACHE_KEYS[kind], value: JSON.stringify(entry) });
  } catch {
    // Cache is best effort.
  }
}

export async function readOfflineCache(kind: OfflineCacheKind): Promise<OfflineCacheEntry | null> {
  if (!isNativeApp()) return null;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: OFFLINE_CACHE_KEYS[kind] });
    if (!value) return null;
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

/** Remove per-account caches (scheduled watches, friend recommendations), e.g. on sign-out. */
export async function clearAccountOfflineCache(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Promise.all([
      Preferences.remove({ key: OFFLINE_CACHE_KEYS.scheduled }),
      Preferences.remove({ key: OFFLINE_CACHE_KEYS.friendRecs }),
    ]);
  } catch {
    // Best effort.
  }
}
