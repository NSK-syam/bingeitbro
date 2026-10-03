import { sanitizeRelativePath } from './app-routes.ts';

/**
 * Where to go after a native OAuth sign-in that leaves the page (Google through the system
 * browser). AuthProvider's native Google branch, the single entry point for every native Google
 * button (Welcome and the email dialog), calls prepareNativeOAuthReturn() with the current URL:
 * inside the app shell it saves that URL, anywhere else it clears any earlier marker, so a stale
 * shell attempt can never steer a later sign-in. NativeAppBridge consumes it once after the code
 * exchange (or discards it on failure). The shell then forwards a signed-in user from
 * /app/welcome?next=… using the shared route mapping.
 */
export const AUTH_RETURN_KEY = 'bib_auth_return_path';
export const AUTH_RETURN_MAX_AGE_MS = 15 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** True for '/app', '/app?…' and '/app/…' (not e.g. '/application'). */
export function isAppShellPath(path: string): boolean {
  return path === '/app' || path.startsWith('/app?') || path.startsWith('/app/');
}

export function clearAuthReturnPath(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(AUTH_RETURN_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Call right before starting native OAuth. Saves `currentUrl` when it is an app-shell path;
 * otherwise clears any saved marker. Returns whether a path was saved.
 */
export function prepareNativeOAuthReturn(
  currentUrl: string,
  storage: StorageLike | null = defaultStorage(),
  now: number = Date.now(),
): boolean {
  const safe = sanitizeRelativePath(currentUrl);
  if (!safe || !isAppShellPath(safe)) {
    clearAuthReturnPath(storage);
    return false;
  }
  try {
    storage?.setItem(AUTH_RETURN_KEY, JSON.stringify({ path: safe, at: now }));
    return Boolean(storage);
  } catch {
    // Storage unavailable: the callback falls back to the existing '/' behaviour.
    return false;
  }
}

/** Returns the saved path once (then forgets it), or null if none, expired, from the future or invalid. */
export function consumeAuthReturnPath(storage: StorageLike | null = defaultStorage(), now: number = Date.now()): string | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(AUTH_RETURN_KEY);
    storage.removeItem(AUTH_RETURN_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof parsed.path !== 'string' || typeof parsed.at !== 'number' || !Number.isFinite(parsed.at)) return null;
    if (parsed.at > now + CLOCK_SKEW_MS || now - parsed.at > AUTH_RETURN_MAX_AGE_MS) return null;
    const safe = sanitizeRelativePath(parsed.path);
    return safe && isAppShellPath(safe) ? safe : null;
  } catch {
    return null;
  }
}
