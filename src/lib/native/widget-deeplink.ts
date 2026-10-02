/**
 * Deep links opened by the iOS home screen widget (ios/App/BibWidget):
 *
 *   com.bingeitbro.app://open?path=%2Fmovie%2Ftmdb-123
 *
 * `path` is a URL-encoded same-origin path (always starts with a single "/").
 * The widget's empty state opens com.bingeitbro.app://open?path=%2F.
 *
 * Usage from the App 'appUrlOpen' / getLaunchUrl handler:
 *   const path = getWidgetOpenPath(url);
 *   if (path) window.location.assign(path);
 */

const NATIVE_SCHEME = 'com.bingeitbro.app:';
const WIDGET_OPEN_HOST = 'open';

/** Builds a widget deep link for a same-origin path. */
export function buildWidgetOpenUrl(path: string): string {
  const safe = sanitizeAppPath(path) ?? '/';
  return `com.bingeitbro.app://${WIDGET_OPEN_HOST}?path=${encodeURIComponent(safe)}`;
}

/**
 * Returns the safe same-origin path for a com.bingeitbro.app://open?path=... URL,
 * or null if the URL is not a widget open link (or the path is unsafe).
 */
export function getWidgetOpenPath(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== NATIVE_SCHEME || parsed.hostname !== WIDGET_OPEN_HOST) return null;
  return sanitizeAppPath(parsed.searchParams.get('path') ?? '/');
}

/** Accepts only paths that stay on the current origin (no //host, backslashes or schemes). */
export function sanitizeAppPath(path: string | null | undefined): string | null {
  const raw = String(path ?? '').trim();
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  if (raw.length > 512) return null;
  if (typeof window === 'undefined') return raw;
  try {
    const resolved = new URL(raw, window.location.origin);
    if (resolved.origin !== window.location.origin) return null;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}
