import { sanitizeRelativePath } from './app-routes';

/**
 * Where to go after an OAuth sign-in that leaves the page (Google through the system browser).
 * The app shell's Welcome screen saves its own URL (e.g. /app/welcome?next=/app/picks) before
 * starting OAuth; NativeAppBridge reads it once after exchanging the code. The shell then forwards
 * a signed-in user from Welcome to `next`, using the shared route mapping.
 */
const KEY = 'bib_auth_return_path';
const MAX_AGE_MS = 15 * 60 * 1000;

/** Only app-shell paths are stored: the website keeps its existing post-sign-in behaviour. */
function isAppShellPath(path: string): boolean {
  return path === '/app' || path.startsWith('/app?') || path.startsWith('/app/');
}

export function saveAuthReturnPath(path: string): void {
  const safe = sanitizeRelativePath(path);
  if (!safe || !isAppShellPath(safe)) return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ path: safe, at: Date.now() }));
  } catch {
    // Storage unavailable: the shell still lands on /app after sign-in.
  }
}

/** Returns the saved path once (then forgets it), or null if none, stale or invalid. */
export function consumeAuthReturnPath(): string | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof parsed.path !== 'string' || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) return null;
    const safe = sanitizeRelativePath(parsed.path);
    return safe && isAppShellPath(safe) ? safe : null;
  } catch {
    return null;
  }
}
