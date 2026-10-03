/**
 * Route mapping for the native app shell (/app). Pure: no window, no React, so it is shared by
 * the native redirect, NativeAppBridge (OAuth / widget links), NativePush and the shell itself,
 * and is unit-tested in scripts/mobile/test-app-routes.mjs.
 *
 * See docs/superpowers/specs/2026-10-03-bingeitbro-native-app-redesign-design.md, "URL mapping".
 */

export const APP_HOME = '/app';
export const APP_WELCOME = '/app/welcome';
export const APP_PICKS = '/app/picks';
export const APP_GROUPS = '/app/groups';
export const APP_ME = '/app/me';
export const RECOMMEND_SHEET_QUERY = 'sheet=recommend';

export type TitleKind = 'movie' | 'show';

export type AppDestination =
  /** A screen inside the app shell. */
  | { kind: 'app'; path: string }
  /** An existing website page that stays as-is inside the app (legal, password reset). */
  | { kind: 'web'; path: string }
  /** A web-only feature that the app opens in the system browser. */
  | { kind: 'external'; url: string };

export type MapOptions = {
  signedIn: boolean;
  /** Public origin used for external links. */
  origin?: string;
};

const PUBLIC_ORIGIN = 'https://bingeitbro.com';
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const LEGAL = new Set(['/privacy', '/terms', '/cookies', '/copyright', '/disclaimer']);
const WEB_ONLY_PREFIXES = ['/songs', '/trivia', '/admin-picks'];

/** Decodes one path segment and checks it is a valid id. Never throws: malformed input → null. */
function decodeId(segment: string): string | null {
  let value: string;
  try {
    value = decodeURIComponent(segment);
  } catch {
    return null;
  }
  return ID_RE.test(value) ? value : null;
}

/** True for '/app', '/app?…' and '/app/…' (not e.g. '/application'). */
function isAppPathString(path: string): boolean {
  return path === APP_HOME || path.startsWith(`${APP_HOME}?`) || path.startsWith(`${APP_HOME}/`);
}

export function titlePath(kind: TitleKind, id: string): string {
  return `/app/title/${kind}/${encodeURIComponent(id)}`;
}

/**
 * Validates a same-origin relative path. Returns its normalized pathname + search + hash, or null
 * for anything that could leave the site (`//host`, backslashes, schemes, over-long input).
 */
export function sanitizeRelativePath(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  if (value.length > 512) return null;
  try {
    const base = 'https://app.invalid';
    const url = new URL(value, base);
    if (url.origin !== base) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function pathParts(path: string): { pathname: string; params: URLSearchParams } {
  // URL parsing never throws for an already-sanitized relative path; percent sequences stay encoded.
  const url = new URL(path, 'https://app.invalid');
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  return { pathname, params: url.searchParams };
}

/** Maps an /app/* path to itself when it names a known screen; unknown /app paths go Home. */
function mapAppPath(pathname: string, params: URLSearchParams): string {
  if ([APP_HOME, APP_PICKS, APP_GROUPS, APP_ME].includes(pathname)) {
    // Tab screens can show the Recommend sheet on top (?sheet=recommend); other params are dropped.
    return params.get('sheet') === 'recommend' ? `${pathname}?${RECOMMEND_SHEET_QUERY}` : pathname;
  }
  if (pathname === APP_WELCOME) {
    const next = sanitizeRelativePath(params.get('next'));
    return next && isAppPathString(next) && !next.startsWith(APP_WELCOME)
      ? `${APP_WELCOME}?next=${encodeURIComponent(next)}`
      : APP_WELCOME;
  }
  const title = /^\/app\/title\/(movie|show)\/([^/]+)$/.exec(pathname);
  const titleId = title ? decodeId(title[2]) : null;
  if (title && titleId) return titlePath(title[1] as TitleKind, titleId);
  const profile = /^\/app\/profile\/([^/]+)$/.exec(pathname);
  const profileId = profile ? decodeId(profile[1]) : null;
  if (profileId) return `/app/profile/${encodeURIComponent(profileId)}`;
  return APP_HOME;
}

/** Screens a signed-out user may open without being sent to Welcome first. */
function isPublicAppPath(path: string): boolean {
  return path === APP_WELCOME || path.startsWith(`${APP_WELCOME}?`);
}

/**
 * Maps any incoming path (website URL, push `data.path`, widget `path`, OAuth `next`) to where the
 * native app should go. Returns null when the input is not a safe same-origin path.
 */
export function mapToAppDestination(raw: string | null | undefined, options: MapOptions): AppDestination | null {
  const safe = sanitizeRelativePath(raw);
  if (!safe) return null;
  const { pathname, params } = pathParts(safe);

  if (LEGAL.has(pathname) || pathname === '/reset-password') {
    return { kind: 'web', path: safe };
  }
  if (WEB_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return { kind: 'external', url: `${options.origin ?? PUBLIC_ORIGIN}${safe}` };
  }

  let target: string;
  const movie = /^\/movie\/([^/]+)$/.exec(pathname);
  const show = /^\/show\/([^/]+)$/.exec(pathname);
  const profile = /^\/profile\/([^/]+)$/.exec(pathname);

  if (pathname === APP_HOME || pathname.startsWith('/app/')) {
    target = mapAppPath(pathname, params);
  } else if (pathname === '/' && params.get('view') === 'friends') {
    target = APP_PICKS;
  } else if (movie && decodeId(movie[1])) {
    target = titlePath('movie', decodeId(movie[1]) as string);
  } else if (show && decodeId(show[1])) {
    target = titlePath('show', decodeId(show[1]) as string);
  } else if (profile && decodeId(profile[1])) {
    target = `/app/profile/${encodeURIComponent(decodeId(profile[1]) as string)}`;
  } else if (pathname === '/add') {
    target = `${APP_HOME}?${RECOMMEND_SHEET_QUERY}`;
  } else if (pathname === '/signup') {
    target = APP_WELCOME;
  } else {
    // '/', '/movies', '/shows' and anything unknown.
    target = APP_HOME;
  }

  if (!options.signedIn && !isPublicAppPath(target)) {
    return {
      kind: 'app',
      path: target === APP_HOME ? APP_WELCOME : `${APP_WELCOME}?next=${encodeURIComponent(target)}`,
    };
  }
  if (options.signedIn && isPublicAppPath(target)) {
    // Signed in: Welcome forwards to where the user was going (or Home).
    const next = sanitizeRelativePath(new URL(target, 'https://app.invalid').searchParams.get('next'));
    return { kind: 'app', path: next && isAppPathString(next) ? mapAppPathString(next) : APP_HOME };
  }
  return { kind: 'app', path: target };
}

function mapAppPathString(path: string): string {
  const { pathname, params } = pathParts(path);
  const mapped = mapAppPath(pathname, params);
  return isPublicAppPath(mapped) ? APP_HOME : mapped;
}
