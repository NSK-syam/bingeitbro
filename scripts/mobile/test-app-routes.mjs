// Unit tests for src/lib/native/app-routes.ts (native app shell route mapping).
// Run: node scripts/mobile/test-app-routes.mjs   (Node 22.18+ loads the .ts file directly)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapToAppDestination, sanitizeRelativePath } from '../../src/lib/native/app-routes.ts';

const IN = { signedIn: true };
const OUT = { signedIn: false };
const app = (path) => ({ kind: 'app', path });

test('sanitizeRelativePath rejects anything that can leave the site', () => {
  for (const bad of ['', 'movie/1', '//evil.example', '/\\evil.example', 'https://evil.example/x', 'javascript:alert(1)', '/' + 'a'.repeat(600)]) {
    assert.equal(sanitizeRelativePath(bad), null, bad);
  }
  assert.equal(sanitizeRelativePath('/movie/tmdb-1?x=1#h'), '/movie/tmdb-1?x=1#h');
});

test('invalid input maps to null', () => {
  assert.equal(mapToAppDestination('//evil.example/app', IN), null);
  assert.equal(mapToAppDestination('https://evil.example', IN), null);
  assert.equal(mapToAppDestination(null, IN), null);
});

test('website routes map to app screens (signed in)', () => {
  assert.deepEqual(mapToAppDestination('/', IN), app('/app'));
  assert.deepEqual(mapToAppDestination('/movies', IN), app('/app'));
  assert.deepEqual(mapToAppDestination('/shows', IN), app('/app'));
  assert.deepEqual(mapToAppDestination('/?view=friends', IN), app('/app/picks'));
  assert.deepEqual(mapToAppDestination('/add', IN), app('/app?sheet=recommend'));
  assert.deepEqual(mapToAppDestination('/profile/abc-123', IN), app('/app/profile/abc-123'));
  assert.deepEqual(mapToAppDestination('/signup', IN), app('/app'));
  assert.deepEqual(mapToAppDestination('/something-unknown', IN), app('/app'));
});

test('movie and show ids keep their media type', () => {
  assert.deepEqual(mapToAppDestination('/movie/tmdb-27205', IN), app('/app/title/movie/tmdb-27205'));
  assert.deepEqual(mapToAppDestination('/show/tmdb-1399', IN), app('/app/title/show/tmdb-1399'));
  assert.deepEqual(mapToAppDestination('/movie/3f2b9c1e-aaaa-bbbb-cccc-1234567890ab', IN),
    app('/app/title/movie/3f2b9c1e-aaaa-bbbb-cccc-1234567890ab'));
  // ids with odd characters are not guessed
  assert.deepEqual(mapToAppDestination('/movie/%3Cscript%3E', IN), app('/app'));
});

test('/app paths are identity for known screens, Home otherwise', () => {
  for (const p of ['/app', '/app/picks', '/app/groups', '/app/me', '/app/title/movie/tmdb-1', '/app/title/show/tmdb-2', '/app/profile/u1', '/app?sheet=recommend']) {
    assert.deepEqual(mapToAppDestination(p, IN), app(p), p);
  }
  assert.deepEqual(mapToAppDestination('/app/title/podcast/1', IN), app('/app'));
  assert.deepEqual(mapToAppDestination('/app/nope', IN), app('/app'));
  assert.deepEqual(mapToAppDestination('/app/picks/', IN), app('/app/picks'));
});

test('legal pages and password reset stay on their existing pages', () => {
  for (const p of ['/privacy', '/terms', '/cookies', '/copyright', '/disclaimer']) {
    assert.deepEqual(mapToAppDestination(p, IN), { kind: 'web', path: p });
    assert.deepEqual(mapToAppDestination(p, OUT), { kind: 'web', path: p });
  }
  assert.deepEqual(mapToAppDestination('/reset-password?code=abc', OUT), { kind: 'web', path: '/reset-password?code=abc' });
});

test('web-only features open in the system browser', () => {
  assert.deepEqual(mapToAppDestination('/songs', IN), { kind: 'external', url: 'https://bingeitbro.com/songs' });
  assert.deepEqual(mapToAppDestination('/trivia', OUT), { kind: 'external', url: 'https://bingeitbro.com/trivia' });
  assert.deepEqual(mapToAppDestination('/admin-picks', IN), { kind: 'external', url: 'https://bingeitbro.com/admin-picks' });
});

test('signed-out users go to Welcome, keeping where they were going', () => {
  assert.deepEqual(mapToAppDestination('/', OUT), app('/app/welcome'));
  assert.deepEqual(mapToAppDestination('/app', OUT), app('/app/welcome'));
  assert.deepEqual(mapToAppDestination('/movie/tmdb-27205', OUT), app('/app/welcome?next=%2Fapp%2Ftitle%2Fmovie%2Ftmdb-27205'));
  assert.deepEqual(mapToAppDestination('/?view=friends', OUT), app('/app/welcome?next=%2Fapp%2Fpicks'));
  assert.deepEqual(mapToAppDestination('/app/welcome', OUT), app('/app/welcome'));
});

test('Welcome next is validated and forwarded after sign-in', () => {
  assert.deepEqual(mapToAppDestination('/app/welcome?next=%2Fapp%2Ftitle%2Fmovie%2Ftmdb-1', IN), app('/app/title/movie/tmdb-1'));
  assert.deepEqual(mapToAppDestination('/app/welcome?next=%2F%2Fevil.example', IN), app('/app'));
  assert.deepEqual(mapToAppDestination('/app/welcome?next=%2Fprivacy', IN), app('/app'));
  assert.deepEqual(mapToAppDestination('/app/welcome?next=%2Fapplication', IN), app('/app'));
  assert.deepEqual(mapToAppDestination('/app/welcome?next=%2Fapp%3Fsheet%3Drecommend', IN), app('/app?sheet=recommend'));
  assert.deepEqual(mapToAppDestination('/app/welcome', IN), app('/app'));
  // next pointing back at welcome can't loop
  assert.deepEqual(mapToAppDestination('/app/welcome?next=%2Fapp%2Fwelcome', OUT), app('/app/welcome'));
  assert.deepEqual(mapToAppDestination('/app/welcome?next=%2Fapp%2Fwelcome', IN), app('/app'));
});

test('no redirect loops: mapping a mapped result is stable', () => {
  const inputs = ['/', '/app', '/app/welcome', '/movie/tmdb-1', '/show/tmdb-2', '/?view=friends', '/add', '/app/me', '/x'];
  for (const signedIn of [true, false]) {
    for (const input of inputs) {
      const first = mapToAppDestination(input, { signedIn });
      assert.ok(first && first.kind === 'app', input);
      const second = mapToAppDestination(first.path, { signedIn });
      assert.deepEqual(second, first, `${input} (signedIn=${signedIn})`);
    }
  }
});
