const TMDB_ORIGIN = 'https://api.themoviedb.org';

function isTmdbV3Url(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === TMDB_ORIGIN && parsed.pathname.startsWith('/3/');
  } catch {
    return false;
  }
}

function getProxyUrl(url: string): string {
  return `/api/tmdb?url=${encodeURIComponent(url)}`;
}

export async function fetchTmdbWithProxy(url: string, init?: RequestInit): Promise<Response> {
  const isTmdbUrl = isTmdbV3Url(url);
  const isBrowser = typeof window !== 'undefined';

  if (!isTmdbUrl) {
    return fetch(url, init);
  }

  if (!isBrowser) {
    // Server-side environments can generally reach TMDB directly.
    return fetch(url, init);
  }

  try {
    const direct = await fetch(url, init);
    if (direct.ok) return direct;
  } catch {
    // Fallback below.
  }

  return fetch(getProxyUrl(url), init);
}

