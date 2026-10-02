#!/usr/bin/env node
/**
 * Race / persistence tests for the native push token lifecycle (src/lib/native-push.ts).
 * Mocks the FirebaseMessaging plugin, Capacitor Preferences (shared across "page
 * loads") and the /api/native-push/register server.
 *
 *   node scripts/mobile/test-native-push-lifecycle.mjs
 *
 * Requires Node >= 22.18 (native TypeScript type stripping).
 */
import assert from 'node:assert/strict';

const base = new URL('../../src/lib/', import.meta.url);
const { createPushLifecycle, PUSH_RETIRED_KEY } = await import(new URL('native-push.ts', base).href);
const { registerNativeLogoutCleanup, runNativeLogoutCleanup } = await import(
  new URL('native/logout-cleanup.ts', base).href
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Mock server mirroring src/app/api/native-push/register/route.ts semantics. */
function createServer() {
  const sessions = new Map([
    ['atA', 'A'],
    ['atB', 'B'],
  ]);
  const owners = new Map(); // token -> userId
  const log = [];
  const postDelays = [];
  let deleteDelayMs = 0;
  let deleteFails = 0;

  async function fetch(url, init) {
    const body = JSON.parse(init.body);
    const bearer = (init.headers.Authorization || '').replace(/^Bearer /, '') || null;
    const userId = bearer ? sessions.get(bearer) ?? null : null;
    if (init.method === 'POST') {
      const delay = postDelays.shift() ?? 0;
      log.push(`POST ${body.token} as ${userId}`);
      if (!userId) return new Response('{}', { status: 401 });
      // The server commits after `delay` even if the client gave up (aborted) earlier.
      const commit = sleep(delay).then(() => {
        owners.set(body.token, userId); // upsert: reassigns to the caller
        log.push(`COMMIT ${body.token} -> ${userId}`);
      });
      return new Promise((resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
        commit.then(() => resolve(new Response('{"ok":true}', { status: 200 })));
      });
    }
    if (init.method === 'DELETE') {
      if (deleteDelayMs) await sleep(deleteDelayMs);
      if (deleteFails > 0) {
        deleteFails -= 1;
        log.push(`DELETE ${body.token} FAILED`);
        return new Response('{}', { status: 500 });
      }
      const owner = owners.get(body.token);
      if (userId) {
        if (owner === userId) owners.delete(body.token);
      } else {
        owners.delete(body.token); // possession proof (session revoked or absent)
      }
      log.push(`DELETE ${body.token} as ${userId ?? 'possession'}`);
      return new Response('{"ok":true}', { status: 200 });
    }
    return new Response('{}', { status: 405 });
  }

  return {
    fetch,
    owners,
    log,
    revoke: (token) => sessions.delete(token),
    delayPosts: (...ms) => postDelays.push(...ms),
    setDeleteDelay: (ms) => {
      deleteDelayMs = ms;
    },
    failDeletes: (n) => {
      deleteFails = n;
    },
  };
}

/** Mock FirebaseMessaging plugin (device state survives page reloads). deleteToken() rotates the token. */
function createDevice() {
  let counter = 1;
  const device = {
    current: 'fcm-token-device-0001',
    dead: new Set(), // tokens FCM no longer delivers to
    deleteTokenThrows: 0,
    deleteTokenNoop: 0, // deleteToken "succeeds" but getToken keeps returning the same token
    messaging: {
      async getToken() {
        return { token: device.current };
      },
      async deleteToken() {
        if (device.deleteTokenThrows > 0) {
          device.deleteTokenThrows -= 1;
          throw new Error('deleteToken failed');
        }
        if (device.deleteTokenNoop > 0) {
          device.deleteTokenNoop -= 1;
          return;
        }
        device.dead.add(device.current);
        counter += 1;
        device.current = `fcm-token-device-000${counter}`;
      },
      async checkPermissions() {
        return { receive: 'granted' };
      },
      async requestPermissions() {
        return { receive: 'granted' };
      },
    },
  };
  return device;
}

/** Capacitor Preferences mock: persists across lifecycles ("page loads"). */
function createPreferences() {
  const map = new Map();
  return {
    map,
    async get(key) {
      return map.get(key) ?? null;
    },
    async set(key, value) {
      if (value === null) map.delete(key);
      else map.set(key, value);
    },
  };
}

function boot(env, extra = {}) {
  let ids = 0;
  return createPushLifecycle({
    messaging: env.device.messaging,
    platform: 'ios',
    fetch: env.server.fetch,
    store: env.prefs,
    sleep: () => Promise.resolve(),
    newId: () => `m${(ids += 1)}-${Math.random().toString(36).slice(2, 6)}`,
    ...extra,
  });
}

function setupEnv() {
  return { server: createServer(), device: createDevice(), prefs: createPreferences() };
}

const ownersOf = (server, userId) => [...server.owners].filter(([, o]) => o === userId).map(([t]) => t);
const liveOwnersOf = (env, userId) => ownersOf(env.server, userId).filter((t) => !env.device.dead.has(t));
const markers = (env) => JSON.parse(env.prefs.map.get(PUSH_RETIRED_KEY) ?? '[]');
const explain = (env) => `\n  owners: ${JSON.stringify([...env.server.owners])}\n  log: ${env.server.log.join(' | ')}`;

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}

await test('(a) delayed token-refresh POST, then logout -> token maps to nobody', async () => {
  const env = setupEnv();
  const lc = boot(env);
  await lc.onSession('A', 'atA');
  assert.deepEqual(ownersOf(env.server, 'A'), [env.device.current]);

  env.device.current = 'fcm-token-refreshed-A-1';
  env.server.delayPosts(200);
  void lc.onTokenRefresh('fcm-token-refreshed-A-1');
  await sleep(20); // refresh POST in flight

  env.server.revoke('atA');
  await lc.onSession(null, null);
  await lc.idle();
  await sleep(250);
  assert.equal(liveOwnersOf(env, 'A').length, 0, explain(env));
  assert.equal(env.server.owners.size, 0, explain(env));
});

await test('(b) delayed token-refresh POST, then switch to B -> only B, with a fresh token', async () => {
  const env = setupEnv();
  const lc = boot(env);
  await lc.onSession('A', 'atA');
  env.device.current = 'fcm-token-refreshed-A-1';
  env.server.delayPosts(200);
  void lc.onTokenRefresh('fcm-token-refreshed-A-1');
  await sleep(20);

  await lc.onSession('B', 'atB'); // switch without a signed-out event
  await lc.idle();
  await sleep(250);
  assert.deepEqual(ownersOf(env.server, 'A'), [], explain(env));
  assert.deepEqual(ownersOf(env.server, 'B'), [env.device.current], explain(env));
  assert.notEqual(env.device.current, 'fcm-token-refreshed-A-1');
});

await test('(c) dispose during in-flight POST -> no further requests', async () => {
  const env = setupEnv();
  const lc = boot(env);
  env.server.delayPosts(100);
  void lc.onSession('A', 'atA');
  await sleep(20);
  lc.dispose();
  const before = env.server.log.length;
  void lc.onTokenRefresh('fcm-token-after-dispose');
  void lc.onSession('B', 'atB');
  await sleep(150);
  await lc.idle();
  assert.deepEqual(env.server.log.slice(before), [`COMMIT ${'fcm-token-device-0001'} -> A`]);
});

await test('(d) B5 logout via registry -> dispose (navigation) -> fresh page signed out: old token unmapped, B never gets it', async () => {
  const env = setupEnv();
  let lc = boot(env);
  const unregister = registerNativeLogoutCleanup('push', (ctx) => lc.logout(ctx));
  await lc.onSession('A', 'atA');
  const oldToken = env.device.current;
  assert.deepEqual(ownersOf(env.server, 'A'), [oldToken]);

  // AuthProvider.signOut: awaited cleanup with the still-valid session, then revoke, then navigate.
  await runNativeLogoutCleanup({ userId: 'A', accessToken: 'atA' }, 5000);
  env.server.revoke('atA');
  lc.dispose(); // full page navigation
  unregister();

  lc = boot(env); // new page, signed out
  await lc.onSession(null, null);
  await lc.idle();
  assert.equal(env.server.owners.has(oldToken), false, explain(env));
  assert.deepEqual(markers(env), []);

  await lc.onSession('B', 'atB');
  await lc.idle();
  assert.equal(env.server.owners.get(oldToken), undefined, explain(env));
  assert.deepEqual(ownersOf(env.server, 'B'), [env.device.current]);
  assert.notEqual(env.device.current, oldToken);
  assert.ok(!env.server.log.some((l) => l.startsWith(`POST ${oldToken} as B`)), explain(env));
});

await test('(e) interrupted logout (cleanup never ran, page reloaded) -> next startup cleans up before B', async () => {
  const env = setupEnv();
  let lc = boot(env);
  await lc.onSession('A', 'atA');
  const oldToken = env.device.current;
  // Crash/reload mid sign-out: no cleanup ran, session revoked server-side.
  env.server.revoke('atA');
  lc.dispose();

  lc = boot(env);
  await lc.onSession('B', 'atB'); // next startup is already B
  await lc.idle();
  const deleteIdx = env.server.log.findIndex((l) => l.startsWith(`DELETE ${oldToken}`));
  const postBIdx = env.server.log.findIndex((l) => l.startsWith('POST') && l.endsWith('as B'));
  assert.ok(deleteIdx >= 0 && deleteIdx < postBIdx, `cleanup must precede B's registration${explain(env)}`);
  assert.equal(env.server.owners.has(oldToken), false, explain(env));
  assert.deepEqual(ownersOf(env.server, 'B'), [env.device.current]);
  assert.notEqual(env.device.current, oldToken);
});

await test('(f) sign-out timeout fires before cleanup completes -> marker survives reload, startup finishes it before B', async () => {
  const env = setupEnv();
  let lc = boot(env);
  const unregister = registerNativeLogoutCleanup('push', (ctx) => lc.logout(ctx));
  await lc.onSession('A', 'atA');
  const oldToken = env.device.current;

  env.server.setDeleteDelay(300); // unlink slower than the sign-out bound
  await runNativeLogoutCleanup({ userId: 'A', accessToken: 'atA' }, 50);
  const pending = markers(env);
  assert.equal(pending.length, 1, 'marker must be persisted before the unlink starts');
  assert.equal(pending[0].token, oldToken);
  assert.equal(pending[0].userId, 'A');
  env.server.revoke('atA');
  lc.dispose(); // navigation cuts the in-flight cleanup
  unregister();
  await sleep(350); // the cut-off DELETE may land; the marker must still be there (no rotation happened)
  assert.equal(markers(env).length, 1, 'timeout must not clear the marker');

  env.server.setDeleteDelay(0);
  lc = boot(env);
  await lc.onSession('B', 'atB');
  await lc.idle();
  assert.deepEqual(markers(env), []);
  const lastDelete = env.server.log.map((l, i) => [l, i]).filter(([l]) => l.startsWith(`DELETE ${oldToken}`)).pop()?.[1];
  const postB = env.server.log.findIndex((l) => l.startsWith('POST') && l.endsWith('as B'));
  assert.ok(lastDelete !== undefined && lastDelete < postB, explain(env));
  assert.equal(env.server.owners.has(oldToken), false, explain(env));
  assert.deepEqual(ownersOf(env.server, 'B'), [env.device.current]);
  assert.notEqual(env.device.current, oldToken);
});

await test('(g) timed-out POST commits late after cleanup -> only a dead token maps to A; B gets a fresh token', async () => {
  const env = setupEnv();
  const lc = boot(env, { requestTimeoutMs: 50 });
  env.server.delayPosts(300); // client gives up at 50ms, server commits at 300ms
  await lc.onSession('A', 'atA');
  await lc.idle();
  const oldToken = env.device.current;
  assert.equal(env.server.owners.size, 0, 'POST not committed yet');

  await lc.logout({ userId: 'A', accessToken: 'atA' });
  env.server.revoke('atA');
  await lc.onSession(null, null);
  await lc.onSession('B', 'atB');
  await lc.idle();
  await sleep(350); // late commit lands now

  assert.equal(env.server.owners.get(oldToken), 'A', 'late commit is the residual case');
  assert.ok(env.device.dead.has(oldToken), 'old token must be rotated (dead at FCM)');
  assert.deepEqual(liveOwnersOf(env, 'A'), [], explain(env));
  assert.deepEqual(ownersOf(env.server, 'B'), [env.device.current]);
  assert.notEqual(env.device.current, oldToken);
});

await test('(h1) rotation failure: deleteToken throws -> B is not registered; succeeds after retry on resume', async () => {
  const env = setupEnv();
  const lc = boot(env);
  await lc.onSession('A', 'atA');
  const oldToken = env.device.current;
  env.device.deleteTokenThrows = 2; // fails during sign-out and again when B signs in
  await lc.logout({ userId: 'A', accessToken: 'atA' });
  env.server.revoke('atA');
  await lc.onSession(null, null);
  await lc.onSession('B', 'atB');
  await lc.idle();
  assert.equal(env.device.current, oldToken);
  assert.equal(ownersOf(env.server, 'B').length, 0, `B must not register with the old token${explain(env)}`);
  assert.ok(!env.server.log.some((l) => l === `POST ${oldToken} as B`));
  assert.equal(markers(env).length, 1);

  await lc.onResume();
  await lc.idle();
  assert.deepEqual(markers(env), []);
  assert.notEqual(env.device.current, oldToken);
  assert.deepEqual(ownersOf(env.server, 'B'), [env.device.current], explain(env));
});

await test('(h2) rotation failure: getToken keeps returning the old token -> B is not registered', async () => {
  const env = setupEnv();
  const lc = boot(env);
  await lc.onSession('A', 'atA');
  const oldToken = env.device.current;
  env.device.deleteTokenNoop = 5;
  await lc.logout({ userId: 'A', accessToken: 'atA' });
  env.server.revoke('atA');
  await lc.onSession('B', 'atB');
  await lc.idle();
  await lc.onResume();
  await lc.idle();
  assert.equal(env.device.current, oldToken);
  assert.equal(ownersOf(env.server, 'B').length, 0, explain(env));
  assert.ok(!env.server.log.some((l) => l === `POST ${oldToken} as B`), explain(env));
  assert.equal(markers(env).length, 1, 'marker kept until rotation succeeds');
});

console.log(results.join('\n'));
if (process.exitCode) console.log('\nFAILED');
else console.log(`\nAll ${results.length} lifecycle tests passed.`);
