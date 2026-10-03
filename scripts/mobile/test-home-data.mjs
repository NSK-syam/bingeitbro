// Unit tests for the app shell's Home data core and the native OAuth return marker.
// Run: node scripts/mobile/test-home-data.mjs   (Node 22.18+ loads the .ts files directly)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cachedToItems,
  failedSection,
  friendRecToItem,
  movieIdFromPath,
  reminderToItem,
  sectionFor,
  upcomingReminders,
} from '../../src/components/app/home/home-data-core.ts';
import {
  AUTH_RETURN_KEY,
  AUTH_RETURN_MAX_AGE_MS,
  clearAuthReturnPath,
  consumeAuthReturnPath,
  prepareNativeOAuthReturn,
} from '../../src/lib/native/auth-return.ts';

const A = 'user-a';
const B = 'user-b';
const ready = (items) => ({ status: 'ready', items });

// ---- B1: account isolation ----------------------------------------------------------------

test('sectionFor never returns another account\'s state', () => {
  const loadedForA = { owner: A, state: ready([{ id: 'r1', title: 'Secret pick for A' }]) };
  assert.deepEqual(sectionFor(loadedForA, A), loadedForA.state);
  // First render after A -> B, before any effect has run: loading, not A's picks.
  assert.deepEqual(sectionFor(loadedForA, B), { status: 'loading' });
  // A -> signed out
  assert.deepEqual(sectionFor(loadedForA, null), { status: 'loading' });
  // Initial state (owner null)
  assert.deepEqual(sectionFor({ owner: null, state: { status: 'loading' } }, A), { status: 'loading' });
  // A delayed result for A arriving while B is current is still tagged A, so B never sees it.
  const lateA = { owner: A, state: ready([{ id: 'late', title: 'Late A result' }]) };
  assert.deepEqual(sectionFor(lateA, B), { status: 'loading' });
});

// ---- B2: cached identity and freshness ------------------------------------------------------

test('movieIdFromPath derives the watchlist key from title paths only', () => {
  assert.equal(movieIdFromPath('/movie/tmdb-693134'), 'tmdb-693134');
  assert.equal(movieIdFromPath('/app/title/movie/tmdb-1'), 'tmdb-1');
  assert.equal(movieIdFromPath('/movie/3f2b9c1e-aaaa-bbbb-cccc-1234567890ab'), '3f2b9c1e-aaaa-bbbb-cccc-1234567890ab');
  assert.equal(movieIdFromPath('/show/tmdbtv-1399'), null);
  assert.equal(movieIdFromPath('/movies'), null);
  assert.equal(movieIdFromPath('/movie/%'), null);
  assert.equal(movieIdFromPath('/movie/<script>'), null);
  assert.equal(movieIdFromPath(undefined), null);
  // Not an exact movie destination
  assert.equal(movieIdFromPath('/movie/tmdb-1/extra'), null);
  assert.equal(movieIdFromPath('/movie/tmdb-1/../../songs'), null);
  assert.equal(movieIdFromPath('/movie/tmdb-1?from=push'), 'tmdb-1');
});

test('cached friend picks keep row id separate from the title id (real cache shape)', () => {
  // NativeFeatures caches friend recs with the friend_recommendations ROW id and the title path.
  const cache = [
    { id: '9b1d6c55-row-id-0001', title: 'Dune: Part Two', poster: '/p.jpg', path: '/movie/tmdb-693134', at: '2026-10-01T10:00:00Z', note: 'From Rahul' },
    { id: 'row-2', title: 'Untitled', path: undefined },
    { id: 'row-3', title: 'Odd path', path: '/movie/tmdb-1/../../songs' },
  ];
  const items = cachedToItems(cache, { now: Date.parse('2026-10-03T00:00:00Z') });
  assert.equal(items[0].id, '9b1d6c55-row-id-0001');
  assert.equal(items[0].movieId, 'tmdb-693134'); // same key the online flow uses
  assert.equal(items[0].href, '/app/title/movie/tmdb-693134');
  assert.equal(items[1].movieId, null); // no safe title identity -> Save not offered
  assert.equal(items[1].href, null);
  assert.equal(items[2].movieId, null); // malformed cached path: no identity
});

test('online and offline items for the same title share one watchlist key', () => {
  const online = friendRecToItem({ id: 'row-77', sender_id: 's', movie_title: 'Dune: Part Two', movie_poster: '', personal_message: '', is_read: false, created_at: '', tmdb_id: 693134, recommendation_id: null, sender: null });
  const offline = cachedToItems([{ id: 'row-77', title: 'Dune: Part Two', path: '/movie/tmdb-693134' }], { now: 0 })[0];
  assert.equal(online.movieId, 'tmdb-693134');
  assert.equal(offline.movieId, online.movieId);
  assert.notEqual(online.movieId, online.id);
});

test('cached schedule drops expired watches and sorts the rest', () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  const items = cachedToItems([
    { id: 'w-old', title: 'Old', path: '/movie/tmdb-1', at: '2026-10-02T21:00:00Z' },
    { id: 'w-later', title: 'Later', path: '/movie/tmdb-3', at: '2026-10-05T21:00:00Z' },
    { id: 'w-soon', title: 'Soon', path: '/movie/tmdb-2', at: '2026-10-03T21:00:00Z' },
    { id: 'w-bad', title: 'Bad date', path: '/movie/tmdb-4', at: 'not-a-date' },
  ], { now, upcomingOnly: true });
  assert.deepEqual(items.map((i) => i.id), ['w-soon', 'w-later']);
});

test('online reminders: upcoming only, soonest first, typed ids', () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  const base = { movieTitle: 'X', moviePoster: null, movieYear: null, createdAt: '', updatedAt: '', notifiedAt: null, canceledAt: null };
  const list = upcomingReminders([
    { ...base, id: 'past', movieId: 'tmdb-1', remindAt: '2026-10-02T00:00:00Z' },
    { ...base, id: 'canceled', movieId: 'tmdb-2', remindAt: '2026-10-04T00:00:00Z', canceledAt: '2026-10-01T00:00:00Z' },
    { ...base, id: 'b', movieId: 'tmdb-3', remindAt: '2026-10-05T00:00:00Z' },
    { ...base, id: 'a', movieId: 'tmdb-4', remindAt: '2026-10-04T00:00:00Z' },
  ], now);
  assert.deepEqual(list.map((r) => r.id), ['a', 'b']);
  assert.equal(reminderToItem(list[0]).movieId, 'tmdb-4');
  assert.equal(reminderToItem({ ...base, id: 's', movieId: 'show::1399', remindAt: '' }).movieId, null);
});

// ---- B3: failure -> saved data or error ----------------------------------------------------

test('failedSection prefers saved items and distinguishes offline from errors', () => {
  const saved = [{ id: 'x', title: 'Saved', movieId: 'tmdb-1' }];
  assert.deepEqual(failedSection(saved, true), { status: 'cached', items: saved, reason: 'offline' });
  assert.deepEqual(failedSection(saved, false), { status: 'cached', items: saved, reason: 'error' });
  assert.deepEqual(failedSection([], false), { status: 'error' });
  assert.deepEqual(failedSection(null, false), { status: 'error' });
  assert.deepEqual(failedSection(null, true), { status: 'cached', items: [], reason: 'offline' });
});

// ---- B4: native OAuth return marker ---------------------------------------------------------

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}

test('prepare saves app-shell paths and clears the marker elsewhere', () => {
  const s = memoryStorage();
  assert.equal(prepareNativeOAuthReturn('/app/welcome?next=%2Fapp%2Fpicks', s, 1000), true);
  assert.ok(s.map.has(AUTH_RETURN_KEY));
  // A later sign-in that starts outside the shell (legacy native UI) clears the stale marker.
  assert.equal(prepareNativeOAuthReturn('/signup', s, 2000), false);
  assert.equal(s.map.has(AUTH_RETURN_KEY), false);
  assert.equal(prepareNativeOAuthReturn('/application', s, 3000), false);
  assert.equal(prepareNativeOAuthReturn('//evil.example/app', s, 3000), false);
});

test('consume returns the path once, within the TTL', () => {
  const s = memoryStorage();
  prepareNativeOAuthReturn('/app/welcome?next=%2Fapp%2Fpicks', s, 10_000);
  assert.equal(consumeAuthReturnPath(s, 10_500), '/app/welcome?next=%2Fapp%2Fpicks');
  assert.equal(consumeAuthReturnPath(s, 10_600), null); // consumed
  prepareNativeOAuthReturn('/app', s, 0);
  assert.equal(consumeAuthReturnPath(s, AUTH_RETURN_MAX_AGE_MS + 1), null); // expired
});

test('consume rejects future, non-finite, non-app and malformed markers', () => {
  const s = memoryStorage();
  const put = (v) => s.setItem(AUTH_RETURN_KEY, typeof v === 'string' ? v : JSON.stringify(v));
  put({ path: '/app', at: 10 * 60 * 1000 }); assert.equal(consumeAuthReturnPath(s, 0), null); // future
  put('{"path":"/app","at":1e400}'); assert.equal(consumeAuthReturnPath(s, 0), null); // Infinity
  put({ path: '/app', at: 'yesterday' }); assert.equal(consumeAuthReturnPath(s, 0), null);
  put({ path: '/movies', at: 0 }); assert.equal(consumeAuthReturnPath(s, 0), null);
  put({ path: '//evil.example/app', at: 0 }); assert.equal(consumeAuthReturnPath(s, 0), null);
  put('not json'); assert.equal(consumeAuthReturnPath(s, 0), null);
  assert.equal(s.map.has(AUTH_RETURN_KEY), false); // always removed after reading
  assert.equal(consumeAuthReturnPath(null, 0), null);
});

test('OAuth return flows: Welcome Google, email-dialog Google, legacy native, failure', () => {
  // Mirrors AuthProvider (prepare on start, clear on start error) and NativeAppBridge
  // (consume on success, clear on failure; null -> legacy '/' behaviour).
  const callback = (s, now) => consumeAuthReturnPath(s, now) ?? '/';
  // 1. Welcome's Google button on /app/welcome?next=…
  let s = memoryStorage();
  prepareNativeOAuthReturn('/app/welcome?next=%2Fapp%2Fpicks', s, 0);
  assert.equal(callback(s, 5000), '/app/welcome?next=%2Fapp%2Fpicks');
  // 2. Google inside the reused email dialog: same page URL, same single entry point.
  s = memoryStorage();
  prepareNativeOAuthReturn('/app/welcome?next=%2Fapp%2Ftitle%2Fmovie%2Ftmdb-1', s, 0);
  assert.equal(callback(s, 5000), '/app/welcome?next=%2Fapp%2Ftitle%2Fmovie%2Ftmdb-1');
  // 3. Abandoned shell attempt, then sign-in from the legacy native UI: legacy '/' behaviour.
  s = memoryStorage();
  prepareNativeOAuthReturn('/app/welcome', s, 0);
  prepareNativeOAuthReturn('/signup', s, 60_000);
  assert.equal(callback(s, 65_000), '/');
  // 4. Failure clears the marker, so a later success can't be steered by it.
  s = memoryStorage();
  prepareNativeOAuthReturn('/app/welcome', s, 0);
  clearAuthReturnPath(s);
  assert.equal(callback(s, 1000), '/');
});
