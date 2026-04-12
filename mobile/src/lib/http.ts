import { getRuntimeConfig } from './config';

export class HttpError extends Error {
  body: unknown;
  status: number;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

type JsonLikeBody = Record<string, unknown> | unknown[] | null;

export type HttpRequestOptions = Omit<RequestInit, 'body' | 'headers' | 'method'> & {
  accessToken?: string | null;
  body?: BodyInit | JsonLikeBody;
  headers?: HeadersInit;
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
};

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === 'string' ||
    value instanceof ArrayBuffer ||
    value instanceof Blob ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof ReadableStream
  );
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function buildRequestUrl(pathOrUrl: string): string {
  if (isAbsoluteUrl(pathOrUrl)) {
    return pathOrUrl;
  }

  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${getRuntimeConfig().apiBaseUrl}${normalizedPath}`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }

  return response.text().catch(() => null);
}

function buildHeaders(
  headers: HeadersInit | undefined,
  accessToken: string | null | undefined,
  body: BodyInit | JsonLikeBody | undefined,
): Headers {
  const nextHeaders = new Headers(headers);

  if (accessToken) {
    nextHeaders.set('Authorization', `Bearer ${accessToken}`);
  }

  if (body && !isBodyInit(body) && !nextHeaders.has('Content-Type')) {
    nextHeaders.set('Content-Type', 'application/json');
  }

  if (!nextHeaders.has('Accept')) {
    nextHeaders.set('Accept', 'application/json');
  }

  return nextHeaders;
}

function buildBody(body: BodyInit | JsonLikeBody | undefined): BodyInit | undefined {
  if (body === undefined) {
    return undefined;
  }

  if (body === null) {
    return 'null';
  }

  if (isBodyInit(body)) {
    return body;
  }

  return JSON.stringify(body);
}

export async function httpRequest<T = unknown>(
  pathOrUrl: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  const response = await fetch(buildRequestUrl(pathOrUrl), {
    ...options,
    method: options.method ?? 'GET',
    headers: buildHeaders(options.headers, options.accessToken, options.body),
    body: buildBody(options.body),
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : typeof payload === 'object' && payload && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : `Request failed with status ${response.status}`;
    throw new HttpError(message, response.status, payload);
  }

  return payload as T;
}

export function getApiUrl(path: string): string {
  return buildRequestUrl(path);
}

