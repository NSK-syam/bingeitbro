const TMDB_ORIGIN = 'https://api.themoviedb.org';

type TmdbParamValue = string | number | boolean | null | undefined;

function toTmdbV3Url(input: string): string {
  if (input.startsWith('/3/')) {
    return new URL(input, TMDB_ORIGIN).toString();
  }
  return input;
}

export function buildTmdbV3Url(
  pathname: string,
  params?: Record<string, TmdbParamValue>,
): string {
  const normalizedPath = pathname.startsWith('/3/') ? pathname : `/3/${pathname.replace(/^\/+/, '')}`;
  const url = new URL(normalizedPath, TMDB_ORIGIN);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function isTmdbV3Url(url: string): boolean {
  try {
    const parsed = new URL(toTmdbV3Url(url));
    return parsed.origin === TMDB_ORIGIN && parsed.pathname.startsWith('/3/');
  } catch {
    return false;
  }
}

function canonicalizeTmdbV3Url(url: string): string {
  const parsed = new URL(toTmdbV3Url(url));
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
  const resolvedUrl = toTmdbV3Url(url);
  const isTmdbUrl = isTmdbV3Url(resolvedUrl);
  const isBrowser = typeof window !== 'undefined';

  if (!isTmdbUrl) {
    return fetch(url, init);
  }

  let proxyResponse: Response | null = null;

  try {
    // Use our same-origin proxy first (helps reliability + enables edge caching).
    if (isBrowser) {
      proxyResponse = await fetch(getProxyUrl(resolvedUrl), init);
    } else if (opts?.preferProxy && opts.origin) {
      const origin = opts.origin.replace(/\/+$/, '');
      proxyResponse = await fetch(`${origin}${getProxyUrl(resolvedUrl)}`, init);
    }
    if (proxyResponse && proxyResponse.ok) return proxyResponse;

    // For deterministic non-server errors (401/403/404), don't retry direct.
    if (proxyResponse && proxyResponse.status < 500) return proxyResponse;
  } catch {
    // Fall through to direct TMDB request.
  }

  try {
    const direct = await fetch(resolvedUrl, init);
    if (direct.ok) return direct;
    return proxyResponse ?? direct;
  } catch {
    if (proxyResponse) return proxyResponse;
    throw new Error('TMDB fetch failed (proxy and direct)');
  }
}
