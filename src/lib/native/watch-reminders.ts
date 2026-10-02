'use client';

import { isNativeApp } from '@/lib/native-app';
import type { FriendRecommendationReminder, WatchReminder } from '@/lib/supabase-rest';
import { getWatchReminderOpenPath } from '@/lib/watch-reminder-path';

/**
 * On-device (Capacitor LocalNotifications) watch reminders for the native app.
 * The server keeps the source of truth (watch_reminders table + email); these
 * helpers mirror it into OS-scheduled notifications so reminders fire even
 * when the app is closed. Every function is a no-op on the web.
 */

type LocalNotificationsModule = typeof import('@capacitor/local-notifications');

export const WATCH_REMINDER_KIND = 'bib-watch-reminder';
export const FRIEND_REMINDER_KIND = 'bib-friend-reminder';

export type NativeNotificationExtra = {
  kind: typeof WATCH_REMINDER_KIND | typeof FRIEND_REMINDER_KIND;
  reminderId: string;
  movieId: string;
  /** In-app path opened when the notification is tapped. */
  path: string;
  remindAt?: string;
};

function loadPlugin(): Promise<LocalNotificationsModule> {
  return import('@capacitor/local-notifications');
}

/**
 * Stable positive 31-bit id from a reminder id (Android requires a Java int).
 * FNV-1a; namespaced so watch and friend reminders never collide.
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

function isFutureReminder(reminder: WatchReminder, now: number): boolean {
  if (reminder.canceledAt) return false;
  const at = new Date(reminder.remindAt).getTime();
  return Number.isFinite(at) && at > now + 5_000;
}

function toWatchNotification(reminder: WatchReminder) {
  const extra: NativeNotificationExtra = {
    kind: WATCH_REMINDER_KIND,
    reminderId: reminder.id,
    movieId: reminder.movieId,
    path: getWatchReminderOpenPath(reminder.movieId),
    remindAt: reminder.remindAt,
  };
  return {
    id: notificationIdFor(WATCH_REMINDER_KIND, reminder.id),
    title: 'Time to watch 🍿',
    body: `${reminder.movieTitle}${reminder.movieYear ? ` (${reminder.movieYear})` : ''} is on your schedule.`,
    schedule: { at: new Date(reminder.remindAt), allowWhileIdle: true },
    // Inexact on Android: never bounce the user to the "Alarms & reminders" settings screen.
    isExactNotification: false,
    extra,
  };
}

function readExtra(value: unknown): NativeNotificationExtra | null {
  if (!value || typeof value !== 'object') return null;
  const extra = value as Partial<NativeNotificationExtra>;
  if (extra.kind !== WATCH_REMINDER_KIND && extra.kind !== FRIEND_REMINDER_KIND) return null;
  if (typeof extra.path !== 'string') return null;
  return extra as NativeNotificationExtra;
}

/** Only allow in-app relative paths from notification payloads. */
export function safeInAppPath(extra: unknown): string | null {
  const parsed = readExtra(extra);
  if (!parsed) return null;
  const path = parsed.path;
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  return path;
}

async function hasPermission(mod: LocalNotificationsModule, prompt: boolean): Promise<boolean> {
  try {
    const status = await mod.LocalNotifications.checkPermissions();
    if (status.display === 'granted') return true;
    if (!prompt || status.display === 'denied') return false;
    const requested = await mod.LocalNotifications.requestPermissions();
    return requested.display === 'granted';
  } catch {
    return false;
  }
}

async function cancelWhere(
  mod: LocalNotificationsModule,
  predicate: (extra: NativeNotificationExtra, id: number) => boolean,
): Promise<void> {
  const { notifications } = await mod.LocalNotifications.getPending();
  const ids = notifications
    .filter((n) => {
      const extra = readExtra(n.extra);
      return extra ? predicate(extra, n.id) : false;
    })
    .map((n) => ({ id: n.id }));
  if (ids.length > 0) {
    await mod.LocalNotifications.cancel({ notifications: ids });
  }
}

/**
 * Called right after the user saves / reschedules a watch reminder. Asks for
 * notification permission (user-initiated, so a prompt is appropriate), then
 * replaces any pending notification for the same title.
 */
export async function scheduleNativeWatchReminder(reminder: WatchReminder): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const mod = await loadPlugin();
    await cancelWhere(mod, (extra) => extra.kind === WATCH_REMINDER_KIND && extra.movieId === reminder.movieId);
    if (!isFutureReminder(reminder, Date.now())) return;
    if (!(await hasPermission(mod, true))) return;
    await mod.LocalNotifications.schedule({ notifications: [toWatchNotification(reminder)] });
  } catch {
    // Server-side reminder (email / in-app toast) still works.
  }
}

/** Called when the user removes a scheduled watch. */
export async function cancelNativeWatchReminder(movieId: string): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const mod = await loadPlugin();
    await cancelWhere(mod, (extra) => extra.kind === WATCH_REMINDER_KIND && extra.movieId === movieId);
  } catch {
    // Ignore.
  }
}

/**
 * Reconcile OS-scheduled notifications with the server list (app start /
 * resume): schedule missing or moved reminders, cancel stale ones. Prompts
 * for permission only when there is something to schedule; pass an empty
 * list on sign-out to clear everything.
 */
export async function syncNativeWatchReminders(reminders: WatchReminder[]): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const mod = await loadPlugin();
    const now = Date.now();
    const desired = new Map<number, WatchReminder>();
    reminders
      .filter((reminder) => isFutureReminder(reminder, now))
      .forEach((reminder) => desired.set(notificationIdFor(WATCH_REMINDER_KIND, reminder.id), reminder));

    const { notifications: pending } = await mod.LocalNotifications.getPending();
    const alreadyScheduled = new Set<number>();
    const stale: { id: number }[] = [];
    pending.forEach((n) => {
      const extra = readExtra(n.extra);
      if (!extra || extra.kind !== WATCH_REMINDER_KIND) return;
      const want = desired.get(n.id);
      if (want && want.remindAt === extra.remindAt && want.movieId === extra.movieId) {
        alreadyScheduled.add(n.id);
      } else {
        stale.push({ id: n.id });
      }
    });
    if (stale.length > 0) {
      await mod.LocalNotifications.cancel({ notifications: stale });
    }

    const toSchedule = [...desired.entries()]
      .filter(([id]) => !alreadyScheduled.has(id))
      .map(([, reminder]) => toWatchNotification(reminder));
    if (toSchedule.length === 0) return;
    // Only reached when the user has upcoming scheduled watches, so asking here is in context.
    if (!(await hasPermission(mod, true))) return;
    await mod.LocalNotifications.schedule({ notifications: toSchedule });
  } catch {
    // Ignore: next sync retries.
  }
}

/**
 * Show a friend's due reminder as an immediate local notification (replaces
 * the web Notification API inside the app). Does not prompt for permission.
 */
export async function showNativeFriendReminders(
  reminders: FriendRecommendationReminder[],
  getPath: (reminder: FriendRecommendationReminder) => string,
): Promise<void> {
  if (!isNativeApp() || reminders.length === 0) return;
  try {
    const mod = await loadPlugin();
    if (!(await hasPermission(mod, false))) return;
    await mod.LocalNotifications.schedule({
      notifications: reminders.map((reminder) => {
        const extra: NativeNotificationExtra = {
          kind: FRIEND_REMINDER_KIND,
          reminderId: reminder.id,
          movieId: reminder.movieId,
          path: getPath(reminder),
        };
        return {
          id: notificationIdFor(FRIEND_REMINDER_KIND, reminder.id),
          title: 'Friend reminder',
          body: `${reminder.senderName} reminded you to watch ${reminder.movieTitle}`,
          extra,
        };
      }),
    });
  } catch {
    // The in-app toast is still shown.
  }
}
