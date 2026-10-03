/**
 * Offline cache keys and shapes (Capacitor Preferences). Also read by the
 * static fallback page capacitor-www/index.html; keep them in sync. Reads and
 * writes go through the account-scoped controller in watch-reminders.ts.
 */
export {
  OFFLINE_CACHE_KEYS,
  OFFLINE_OWNER_KEY,
  LOGOUT_PENDING_KEY,
  type OfflineCacheEntry,
  type OfflineCacheKind,
  type OfflineItem,
  type SavedLists,
} from '@/lib/native/account-sync-core';
