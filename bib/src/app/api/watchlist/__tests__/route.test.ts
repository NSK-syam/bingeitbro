import assert from 'node:assert/strict';
import { afterEach, before, test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

type MockResponse = Response;

const fetchCalls: FetchCall[] = [];
const fetchQueue: MockResponse[] = [];

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function getHeader(init: RequestInit | undefined, key: string): string | null {
  return new Headers(init?.headers).get(key);
}

function getUrl(index: number): URL {
  return new URL(String(fetchCalls[index]?.input));
}

global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  fetchCalls.push({ input, init });
  const next = fetchQueue.shift();
  if (!next) {
    throw new Error(`Unexpected fetch for ${String(input)}`);
  }
  return next;
};

afterEach(() => {
  fetchCalls.length = 0;
  fetchQueue.length = 0;
});

const watchlistRoute = await import('../route');
const watchlistItemRoute = await import('../[id]/route');

before(() => {
  assert.equal(typeof watchlistRoute.GET, 'function');
  assert.equal(typeof watchlistRoute.POST, 'function');
  assert.equal(typeof watchlistItemRoute.DELETE, 'function');
});

test('authenticated list fetch returns mobile watchlist items', async () => {
  fetchQueue.push(
    jsonResponse({ id: '11111111-1111-1111-1111-111111111111' }, { status: 200 }),
    jsonResponse(
      [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          tmdb_id: 101,
          media_type: 'movie',
          title: 'Arrival',
          poster_path: '/arrival.jpg',
          added_at: '2026-03-23T12:00:00.000Z',
        },
      ],
      { status: 200 },
    ),
  );

  const request = new Request('http://localhost:3000/api/watchlist', {
    headers: { Authorization: 'Bearer valid-token' },
  });

  const response = await watchlistRoute.GET(request);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      tmdbId: 101,
      mediaType: 'movie',
      title: 'Arrival',
      posterPath: '/arrival.jpg',
      addedAt: '2026-03-23T12:00:00.000Z',
    },
  ]);
  assert.equal(fetchCalls.length, 2);
  const url = getUrl(1);
  assert.equal(url.pathname, '/rest/v1/watchlist_items');
  assert.equal(url.searchParams.get('select'), 'id,tmdb_id,media_type,title,poster_path,added_at');
  assert.equal(url.searchParams.get('order'), 'added_at.desc');
  assert.equal(url.searchParams.get('user_id'), 'eq.11111111-1111-1111-1111-111111111111');
  assert.equal(url.searchParams.has('limit'), false);
});

test('add item success returns a compact watchlist item', async () => {
  fetchQueue.push(
    jsonResponse({ id: '11111111-1111-1111-1111-111111111111' }, { status: 200 }),
    jsonResponse(
      [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          tmdb_id: 202,
          media_type: 'tv',
          title: 'Severance',
          poster_path: '/severance.jpg',
          added_at: '2026-03-23T13:00:00.000Z',
        },
      ],
      { status: 201 },
    ),
  );

  const response = await watchlistRoute.POST(
    new Request('http://localhost:3000/api/watchlist', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tmdbId: 202,
        mediaType: 'tv',
        title: 'Severance',
        posterPath: '/severance.jpg',
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    tmdbId: 202,
    mediaType: 'tv',
    title: 'Severance',
    posterPath: '/severance.jpg',
    addedAt: '2026-03-23T13:00:00.000Z',
  });

  const requestBody = JSON.parse(String(fetchCalls[1]?.init?.body));
  assert.deepEqual(requestBody, {
    user_id: '11111111-1111-1111-1111-111111111111',
    tmdb_id: 202,
    media_type: 'tv',
    title: 'Severance',
    poster_path: '/severance.jpg',
  });
});

test('duplicate add is idempotent and uses upsert semantics', async () => {
  fetchQueue.push(
    jsonResponse({ id: '11111111-1111-1111-1111-111111111111' }, { status: 200 }),
    jsonResponse(
      [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          tmdb_id: 303,
          media_type: 'movie',
          title: 'Dune',
          poster_path: '/dune.jpg',
          added_at: '2026-03-23T14:00:00.000Z',
        },
      ],
      { status: 201 },
    ),
    jsonResponse({ id: '11111111-1111-1111-1111-111111111111' }, { status: 200 }),
    jsonResponse(
      [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          tmdb_id: 303,
          media_type: 'movie',
          title: 'Dune',
          poster_path: '/dune.jpg',
          added_at: '2026-03-23T14:00:00.000Z',
        },
      ],
      { status: 200 },
    ),
  );

  const createRequest = () =>
    new Request('http://localhost:3000/api/watchlist', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tmdbId: 303,
        mediaType: 'movie',
        title: 'Dune',
        posterPath: '/dune.jpg',
      }),
    });

  const first = await watchlistRoute.POST(createRequest());
  const second = await watchlistRoute.POST(createRequest());

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    tmdbId: 303,
    mediaType: 'movie',
    title: 'Dune',
    posterPath: '/dune.jpg',
    addedAt: '2026-03-23T14:00:00.000Z',
  });

  const firstWriteUrl = String(fetchCalls[1]?.input);
  const secondWriteUrl = String(fetchCalls[3]?.input);
  assert.match(firstWriteUrl, /on_conflict=user_id%2Ctmdb_id%2Cmedia_type/);
  assert.match(secondWriteUrl, /on_conflict=user_id%2Ctmdb_id%2Cmedia_type/);
  assert.equal(getHeader(fetchCalls[1]?.init, 'Prefer'), 'resolution=merge-duplicates,return=representation');
  assert.equal(getHeader(fetchCalls[3]?.init, 'Prefer'), 'resolution=merge-duplicates,return=representation');
});

test('delete success removes the requested item id', async () => {
  fetchQueue.push(
    jsonResponse({ id: '11111111-1111-1111-1111-111111111111' }, { status: 200 }),
    jsonResponse([{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }], { status: 200 }),
  );

  const response = await watchlistItemRoute.DELETE(
    new Request('http://localhost:3000/api/watchlist/dddddddd-dddd-4ddd-8ddd-dddddddddddd', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-token' },
    }),
    { params: Promise.resolve({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }) },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const url = getUrl(1);
  assert.equal(url.searchParams.get('id'), 'eq.dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  assert.equal(url.searchParams.get('user_id'), 'eq.11111111-1111-1111-1111-111111111111');
});

test('delete is idempotent when the row is already absent', async () => {
  fetchQueue.push(
    jsonResponse({ id: '11111111-1111-1111-1111-111111111111' }, { status: 200 }),
    jsonResponse([], { status: 200 }),
  );

  const response = await watchlistItemRoute.DELETE(
    new Request('http://localhost:3000/api/watchlist/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-token' },
    }),
    { params: Promise.resolve({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }) },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('delete rejects malformed ids with 400 before touching Supabase', async () => {
  const response = await watchlistItemRoute.DELETE(
    new Request('http://localhost:3000/api/watchlist/not-a-uuid', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-token' },
    }),
    { params: Promise.resolve({ id: 'not-a-uuid' }) },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'id must be a valid UUID.' });
  assert.equal(fetchCalls.length, 0);
});

test('auth upstream failures surface as 503 instead of 401', async () => {
  fetchQueue.push(jsonResponse({ message: 'Auth service unavailable' }, { status: 503 }));

  const response = await watchlistRoute.GET(
    new Request('http://localhost:3000/api/watchlist', {
      headers: { Authorization: 'Bearer valid-token' },
    }),
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { message: 'Auth service unavailable' });
  assert.equal(fetchCalls.length, 1);
});

test('invalid post payload returns 400 before auth lookup', async () => {
  const response = await watchlistRoute.POST(
    new Request('http://localhost:3000/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    message: 'tmdbId, mediaType, and title are required.',
  });
  assert.equal(fetchCalls.length, 0);
});

test('unauthorized rejection returns 401 without calling Supabase', async () => {
  const response = await watchlistRoute.GET(new Request('http://localhost:3000/api/watchlist'));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: 'Not authenticated.' });
  assert.equal(fetchCalls.length, 0);
});
