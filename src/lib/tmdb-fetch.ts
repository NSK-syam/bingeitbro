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

  let proxyResponse: Response | null = null;

  try {
    // Browser clients in some regions (for example, India ISPs) can have
    // unstable direct access to TMDB. Hit our same-origin proxy first.
    proxyResponse = await fetch(getProxyUrl(url), init);
    if (proxyResponse.ok) return proxyResponse;

    // For deterministic non-server errors (401/403/404), don't retry direct.
    if (proxyResponse.status < 500) return proxyResponse;
  } catch {
    // Fall through to direct TMDB request.
  }

  try {
    const direct = await fetch(url, init);
    if (direct.ok) return direct;
    return proxyResponse ?? direct;
  } catch {
    if (proxyResponse) return proxyResponse;
    throw new Error('TMDB fetch failed (proxy and direct)');
  }
}
