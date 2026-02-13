const TMDB_ORIGIN = 'https://api.themoviedb.org';

function isTmdbV3Url(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === TMDB_ORIGIN && parsed.pathname.startsWith('/3/');
  } catch {
    return false;
  }
}

function hashForPath(input: string): string {
  // FNV-1a 32-bit hash, compact base36 key for route path segment.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function encodeBase64Url(input: string): string {
  const btoaFn = globalThis.btoa;
  if (typeof btoaFn === 'function') {
    return btoaFn(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  const maybeBuffer = (globalThis as unknown as { Buffer?: { from: (value: string, encoding: string) => { toString: (encoding: string) => string } } }).Buffer;
  if (maybeBuffer) {
    return maybeBuffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  throw new Error('No base64 encoder available');
}

function getProxyUrl(url: string): string {
  // Include a stable path key because some edge setups can cache route
  // handlers by pathname more aggressively than expected.
  const pathKey = hashForPath(url);
  const encoded = encodeBase64Url(url);
  // `pv` busts legacy edge entries after proxy behavior changes.
  return `/api/tmdb/${pathKey}?u=${encoded}&pv=4`;
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
