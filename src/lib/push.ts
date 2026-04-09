'use client';

import { savePushSubscription } from '@/lib/supabase-rest';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

type TestNotificationOptions = {
  title?: string;
  body?: string;
  url?: string;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isBrowserNotificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function isPushNotificationsSupported() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function isPushNotificationsConfigured() {
  return VAPID_PUBLIC_KEY.trim().length > 0;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (!isBrowserNotificationsSupported()) {
    throw new Error('Notifications not supported');
  }
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

export async function ensureNotificationServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('Service worker not supported');
  }
  return navigator.serviceWorker.register('/sw.js');
}

export async function syncPushSubscription(userId: string): Promise<PushSubscription | null> {
  if (!('Notification' in window)) {
    throw new Error('Notifications not supported');
  }
  if (!isPushNotificationsSupported()) {
    return null;
  }
  if (!isPushNotificationsConfigured()) {
    return null;
  }
  if (Notification.permission !== 'granted') {
    return null;
  }

  const registration = await ensureNotificationServiceWorker();
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const json = subscription.toJSON();
  const endpoint = subscription.endpoint;
  const p256dh = json.keys?.p256dh || '';
  const auth = json.keys?.auth || '';

  await savePushSubscription(userId, { endpoint, p256dh, auth });

  return subscription;
}

export async function enablePushNotifications(userId: string): Promise<PushSubscription | null> {
  const permission = await requestBrowserNotificationPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission not granted');
  }
  return syncPushSubscription(userId);
}

export async function sendTestNotification({
  title = 'BiB notifications are on',
  body = 'This is a sample reminder from BiB.',
  url = '/',
}: TestNotificationOptions = {}) {
  const permission = await requestBrowserNotificationPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission not granted');
  }

  const options = {
    body,
    icon: '/bib-icon.svg',
    badge: '/bib-icon.svg',
    data: { url },
  };

  if ('serviceWorker' in navigator) {
    const registration = await ensureNotificationServiceWorker();
    await registration.showNotification(title, options);
    return;
  }

  const notification = new Notification(title, options);
  notification.onclick = () => {
    if (typeof window !== 'undefined') {
      window.focus();
      window.location.href = url;
    }
  };
}
