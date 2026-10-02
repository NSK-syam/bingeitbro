'use client';

import { isNativeApp } from '@/lib/native-app';

/**
 * Tiny haptic feedback helpers for the Capacitor app. Every helper is
 * fire-and-forget, never throws, and does nothing on the web.
 */

type HapticsModule = typeof import('@capacitor/haptics');

let hapticsModule: Promise<HapticsModule> | null = null;

function run(fn: (mod: HapticsModule) => Promise<void>): void {
  if (!isNativeApp()) return;
  hapticsModule ??= import('@capacitor/haptics');
  void hapticsModule.then(fn).catch(() => {
    // Haptics are best effort.
  });
}

/** Light tap, e.g. toggling a watchlist entry. */
export function impactLight(): void {
  run(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }));
}

/** Success buzz, e.g. a recommendation was sent or a title marked watched. */
export function notificationSuccess(): void {
  run(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success }));
}

/** Selection tick, e.g. casting a vote. */
export function selection(): void {
  run(async ({ Haptics }) => {
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
    await Haptics.selectionEnd();
  });
}
