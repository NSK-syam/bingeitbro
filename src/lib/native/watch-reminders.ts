'use client';

import { isNativeApp } from '@/lib/native-app';
import type { FriendRecommendationReminder, WatchReminder } from '@/lib/supabase-rest';
import { getWatchReminderOpenPath } from '@/lib/watch-reminder-path';
import { registerNativeLogoutCleanup } from '@/lib/native/logout-cleanup';
import {
  createNativeAccountSync,
  readNotificationExtra,
  type NativeAccountSync,
  type NotificationsPort,
  type StoragePort,
} from '@/lib/native/account-sync-core';

/**
 * Capacitor wiring for the account-scoped native sync (on-device watch
 * reminders + offline caches). The logic, queueing and account checks live in
 * account-sync-core.ts. Every export is a no-op on the web.
 */

export { FRIEND_REMINDER_KIND, WATCH_REMINDER_KIND, notificationIdFor } from '@/lib/native/account-sync-core';

const notificationsPort: NotificationsPort = {
  async getPending() {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const { notifications } = await LocalNotifications.getPending();
    return notifications.map((n) => ({ id: n.id, extra: n.extra }));
  },
  async cancel(ids) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  },
  async schedule(notifications) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({ notifications });
  },
  async ensurePermission(prompt) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const status = await LocalNotifications.checkPermissions();
      if (status.display === 'granted') return true;
      if (!prompt || status.display === 'denied') return false;
      const requested = await LocalNotifications.requestPermissions();
      return requested.display === 'granted';
    } catch {
      return false;
    }
  },
};

const storagePort: StoragePort = {
  async get(key) {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key });
    return value;
  },
  async set(key, value) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key, value });
  },
  async remove(key) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key });
  },
};

let controller: NativeAccountSync | null = null;

/** The app-wide controller, or null on the web. */
export function getNativeAccountSync(): NativeAccountSync | null {
  if (!isNativeApp()) return null;
  if (!controller) {
    controller = createNativeAccountSync({
      notifications: notificationsPort,
      storage: storagePort,
      pathForMovie: getWatchReminderOpenPath,
    });
    // Startup: finish a sign-out that was interrupted (pending-logout marker).
    // Queued first, so it runs before any sync or cache write of this session.
    void controller.finishPendingLogout().catch(() => {});
  }
  return controller;
}

// Registered at module load (not in a React effect) so AuthProvider.signOut
// can await it before revoking the session and before callers navigate away.
// If the registry's timeout wins, the persisted marker makes the next startup
// finish the cleanup.
if (typeof window !== 'undefined') {
  registerNativeLogoutCleanup('device-sync', async (ctx) => {
    const sync = getNativeAccountSync();
    if (!sync) return;
    await sync.logout(ctx.userId);
  });
  // Create the controller now in the app so an interrupted sign-out is finished at startup.
  getNativeAccountSync();
}

/** Only allow in-app relative paths from notification payloads. */
export function safeInAppPath(extra: unknown): string | null {
  const parsed = readNotificationExtra(extra);
  if (!parsed) return null;
  const path = parsed.path;
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  return path;
}

/** After the user saves / reschedules a watch reminder. Ignored if `userId` is no longer the signed-in account. */
export async function scheduleNativeWatchReminder(reminder: WatchReminder, userId: string): Promise<void> {
  const sync = getNativeAccountSync();
  if (!sync) return;
  try {
    await sync.scheduleReminder(reminder, userId);
  } catch {
    // Server-side reminder (email / in-app toast) still works.
  }
}

/** After the user removes a scheduled watch. */
export async function cancelNativeWatchReminder(movieId: string): Promise<void> {
  const sync = getNativeAccountSync();
  if (!sync) return;
  try {
    await sync.cancelReminder(movieId);
  } catch {
    // Ignore.
  }
}

/** Due friend reminders as immediate local notifications (replaces the web Notification API in the app). */
export async function showNativeFriendReminders(
  reminders: FriendRecommendationReminder[],
  getPath: (reminder: FriendRecommendationReminder) => string,
  userId: string,
): Promise<void> {
  const sync = getNativeAccountSync();
  if (!sync) return;
  try {
    await sync.showFriendReminders(reminders, (r) => getPath(r as FriendRecommendationReminder), userId);
  } catch {
    // The in-app toast is still shown.
  }
}
