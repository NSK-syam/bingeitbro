const TMDB_ORIGIN = 'https://api.themoviedb.org';

function isTmdbV3Url(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === TMDB_ORIGIN && parsed.pathname.startsWith('/3/');
  } catch {
    return false;
  }
}

function canonicalizeTmdbV3Url(url: string): string {
  const parsed = new URL(url);
  // API key is always injected server-side in proxy route; remove it from cache key.
  parsed.searchParams.delete('api_key');
  const sorted = [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  parsed.search = '';
  for (const [key, value] of sorted) {
    parsed.searchParams.append(key, value);
  }
  return parsed.toString();
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
  const canonicalUrl = canonicalizeTmdbV3Url(url);
  // Include a stable path key because some edge setups can cache route
  // handlers by pathname more aggressively than expected.
  const pathKey = hashForPath(canonicalUrl);
  const encoded = encodeBase64Url(canonicalUrl);
  // `pv` busts legacy edge entries after proxy behavior changes.
  return `/api/tmdb/${pathKey}?u=${encoded}&pv=5`;
}

type FetchTmdbOptions = {
  // When running server-side, provide the request origin (ex: https://bingeitbro.com)
  // so we can still use the same-origin TMDB proxy (Cloudflare cache + dedupe).
  origin?: string;
  // Prefer the proxy even server-side. Falls back to direct TMDB if proxy fails.
  preferProxy?: boolean;
};

export async function fetchTmdbWithProxy(url: string, init?: RequestInit, opts?: FetchTmdbOptions): Promise<Response> {
  const isTmdbUrl = isTmdbV3Url(url);
  const isBrowser = typeof window !== 'undefined';

  if (!isTmdbUrl) {
    return fetch(url, init);
  }

  let proxyResponse: Response | null = null;

  try {
    // Use our same-origin proxy first (helps reliability + enables edge caching).
    if (isBrowser) {
      proxyResponse = await fetch(getProxyUrl(url), init);
    } else if (opts?.preferProxy && opts.origin) {
      const origin = opts.origin.replace(/\/+$/, '');
      proxyResponse = await fetch(`${origin}${getProxyUrl(url)}`, init);
    }
    if (proxyResponse && proxyResponse.ok) return proxyResponse;

    // For deterministic non-server errors (401/403/404), don't retry direct.
    if (proxyResponse && proxyResponse.status < 500) return proxyResponse;
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
