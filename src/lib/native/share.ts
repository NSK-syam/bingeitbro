'use client';

import { isNativeApp } from '@/lib/native-app';

/** Public origin used for every link shared from the native app. */
export const PUBLIC_SITE_ORIGIN = 'https://bingeitbro.com';

export type ShareContent = {
  title?: string;
  text?: string;
  url?: string;
};

export type ShareOutcome = 'shared' | 'cancelled' | 'unavailable';

/**
 * Turn an in-app path or URL into a public https://bingeitbro.com link.
 * Inside the app the WebView origin can be capacitor://localhost or a LAN dev
 * server, which must never leak into shared links.
 */
export function toPublicUrl(pathOrUrl: string): string {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) return PUBLIC_SITE_ORIGIN;
  try {
    const parsed = new URL(raw, PUBLIC_SITE_ORIGIN);
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    // Only rewrite links that point at the app itself; external links (YouTube, OTT sites) stay as-is.
    const isAppOrigin =
      parsed.protocol === 'capacitor:' ||
      parsed.origin === currentOrigin ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === 'bingeitbro.com' ||
      parsed.hostname === 'www.bingeitbro.com';
    if (isAppOrigin) {
      return `${PUBLIC_SITE_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch {
    return PUBLIC_SITE_ORIGIN;
  }
}

/** True when shareContent can open a share sheet (native app, or Web Share API). */
export function canShareContent(): boolean {
  if (isNativeApp()) return true;
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

function isCancelError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /cancel|abort/i.test(message);
}

/**
 * Open a share sheet. In the native app this uses the OS share sheet via
 * @capacitor/share (URLs are normalized to https://bingeitbro.com). On the web
 * it is a thin pass-through to navigator.share, so existing web behavior
 * (including each caller's own fallback when this does not return 'shared')
 * is unchanged.
 */
export async function shareContent(content: ShareContent): Promise<ShareOutcome> {
  if (isNativeApp()) {
    const payload: ShareContent = {
      title: content.title || undefined,
      text: content.text || undefined,
      url: content.url ? toPublicUrl(content.url) : undefined,
    };
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ ...payload, dialogTitle: payload.title });
      return 'shared';
    } catch (err) {
      return isCancelError(err) ? 'cancelled' : 'unavailable';
    }
  }

  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return 'unavailable';
  }
  try {
    await navigator.share(content);
    return 'shared';
  } catch (err) {
    return isCancelError(err) ? 'cancelled' : 'unavailable';
  }
}
