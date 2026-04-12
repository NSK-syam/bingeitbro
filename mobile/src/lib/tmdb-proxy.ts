import { getApiUrl } from './http';

const TMDB_ORIGIN = 'https://api.themoviedb.org';

type TmdbParamValue = string | number | boolean | null | undefined;

function toTmdbV3Url(input: string): string {
  if (input.startsWith('/3/')) {
    return new URL(input, TMDB_ORIGIN).toString();
  }

  return input;
}

function canonicalizeTmdbV3Url(url: string): string {
  const parsed = new URL(toTmdbV3Url(url));
  parsed.searchParams.delete('api_key');

  const sorted = [...parsed.searchParams.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  parsed.search = '';
  for (const [key, value] of sorted) {
    parsed.searchParams.append(key, value);
  }

  return parsed.toString();
}

function encodeBase64Url(input: string): string {
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(input)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  const maybeBuffer = globalThis as typeof globalThis & {
    Buffer?: { from(value: string, encoding: string): { toString(encoding: string): string } };
  };
  if (!maybeBuffer.Buffer) {
    throw new Error('No base64 encoder available.');
  }

  return maybeBuffer.Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function hashForPath(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

export function buildTmdbV3Url(
  pathname: string,
  params?: Record<string, TmdbParamValue>,
): string {
  const normalizedPath = pathname.startsWith('/3/')
    ? pathname
    : `/3/${pathname.replace(/^\/+/, '')}`;
  const url = new URL(normalizedPath, TMDB_ORIGIN);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined || value === '') {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

export function buildTmdbProxyUrl(url: string): string {
  const canonical = canonicalizeTmdbV3Url(url);
  const requestKey = hashForPath(canonical);
  const encodedUrl = encodeBase64Url(canonical);

  return getApiUrl(`/api/tmdb/${requestKey}?u=${encodedUrl}&pv=5`);
}

export async function fetchTmdbWithProxy<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(buildTmdbProxyUrl(url), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`TMDB proxy request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

