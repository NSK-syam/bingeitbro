import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Local Capacitor plugin implemented in the iOS app target
 * (ios/App/App/BibNativePlugin.swift, registered by MainViewController).
 * There is no web or Android implementation: always gate calls with isNativeIos().
 */

export interface AppleSignInResult {
  identityToken: string;
  authorizationCode?: string;
  /** Only present on the first authorization for this Apple ID + app. */
  givenName?: string;
  familyName?: string;
  /** Only present on the first authorization; may be a privaterelay.appleid.com address. */
  email?: string;
}

export interface WidgetItemInput {
  title: string;
  year?: number | null;
  sender: string;
  /** https URL of a small (w185) poster; downloaded natively into the App Group container. */
  posterUrl?: string | null;
  /** Same-origin path opened when the item is tapped, e.g. /movie/tmdb-123. */
  path: string;
}

export interface WidgetDataInput {
  items: WidgetItemInput[];
  unwatchedCount: number;
}

interface BibNativePlugin {
  /** nonce is the RAW nonce; the plugin sends SHA-256(nonce) to Apple. */
  signInWithApple(options: { nonce: string }): Promise<AppleSignInResult>;
  setWidgetData(options: WidgetDataInput): Promise<{ ok: boolean }>;
  clearWidgetData(): Promise<{ ok: boolean }>;
}

export const BibNative = registerPlugin<BibNativePlugin>('BibNative');

/** True only inside the Capacitor iOS app (false on web, Android and the server). */
export function isNativeIos(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

/** True when the native side registered BibNative (an older app build may not have it). */
export function isBibNativeAvailable(): boolean {
  if (!isNativeIos()) return false;
  try {
    return Capacitor.isPluginAvailable('BibNative');
  } catch {
    return false;
  }
}

/** Plugin error code for a user-cancelled Apple sign-in. */
export const APPLE_SIGN_IN_CANCELED = 'CANCELED';

export function isAppleSignInCanceled(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: unknown }).code === APPLE_SIGN_IN_CANCELED);
}

/** Random URL-safe raw nonce (32 bytes of entropy). */
export function generateRawNonce(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function setWidgetData(data: WidgetDataInput): Promise<void> {
  if (!isBibNativeAvailable()) return;
  await BibNative.setWidgetData(data);
}

export async function clearWidgetData(): Promise<void> {
  if (!isBibNativeAvailable()) return;
  await BibNative.clearWidgetData();
}
