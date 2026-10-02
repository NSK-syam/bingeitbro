#!/usr/bin/env node
/**
 * Race tests for the native push token lifecycle (src/lib/native-push.ts).
 * Mocks the FirebaseMessaging plugin and the /api/native-push/register server.
 *
 *   node scripts/mobile/test-native-push-lifecycle.mjs
 *
 * Requires Node >= 22.18 (native TypeScript type stripping).
 */
import assert from 'node:assert/strict';

const { createPushLifecycle } = await import(new URL('../../src/lib/native-push.ts', import.meta.url).href);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Mock server mirroring src/app/api/native-push/register/route.ts semantics. */
function createServer() {
  const sessions = new Map([
    ['atA', 'A'],
    ['atB', 'B'],
  ]);
  const owners = new Map(); // token -> userId
  const log = [];
  let nextPostDelayMs = 0;

  async function fetch(url, init) {
    const body = JSON.parse(init.body);
    const bearer = (init.headers.Authorization || '').replace(/^Bearer /, '') || null;
    const userId = bearer ? sessions.get(bearer) ?? null : null;
    if (init.method === 'POST') {
      const delay = nextPostDelayMs;
      nextPostDelayMs = 0;
      log.push(`POST start ${body.token} as ${userId}`);
      // Session is checked when the request arrives; the write lands after the delay.
      if (!userId) return new Response('{}', { status: 401 });
      await sleep(delay);
      owners.set(body.token, userId); // upsert: reassigns to the caller
      log.push(`POST landed ${body.token} -> ${userId}`);
      return new Response('{"ok":true}', { status: 200 });
    }
    if (init.method === 'DELETE') {
      const owner = owners.get(body.token);
      if (userId) {
        if (owner === userId) owners.delete(body.token);
      } else {
        owners.delete(body.token); // possession fallback after the session is revoked
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
    revoke: (accessToken) => sessions.delete(accessToken),
    delayNextPost: (ms) => {
      nextPostDelayMs = ms;
    },
  };
}

/** Mock FirebaseMessaging plugin: deleteToken() rotates the device token. */
function createPlugin() {
  let counter = 1;
  let current = `fcm-token-device-000${counter}`;
  return {
    get current() {
      return current;
    },
    rotateTo(token) {
      current = token;
    },
    messaging: {
      async getToken() {
        return { token: current };
      },
      async deleteToken() {
        counter += 1;
        current = `fcm-token-device-000${counter}`;
      },
      async checkPermissions() {
        return { receive: 'granted' };
      },
      async requestPermissions() {
        return { receive: 'granted' };
      },
    },
  };
}

function memoryStorage() {
  const map = new Map();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => (v === null ? map.delete(k) : map.set(k, v)) };
}

function setup() {
  const server = createServer();
  const plugin = createPlugin();
  const lifecycle = createPushLifecycle({
    messaging: plugin.messaging,
    platform: 'ios',
    fetch: server.fetch,
    storage: memoryStorage(),
    sleep: () => Promise.resolve(),
  });
  return { server, plugin, lifecycle };
}

function ownersOf(server, userId) {
  return [...server.owners].filter(([, owner]) => owner === userId).map(([token]) => token);
}

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
  const { server, plugin, lifecycle } = setup();
  await lifecycle.onSession('A', 'atA');
  assert.deepEqual(ownersOf(server, 'A'), [plugin.current]);

  // FCM rotates the token; the refresh POST for A is slow.
  plugin.rotateTo('fcm-token-refreshed-A-1');
  server.delayNextPost(200);
  void lifecycle.onTokenRefresh('fcm-token-refreshed-A-1');
  await sleep(20); // POST is in flight

  // Logout: Supabase revokes the session, then the auth listener fires.
  server.revoke('atA');
  await lifecycle.onSession(null, null);
  await lifecycle.idle();
  await sleep(250); // nothing may land afterwards

  assert.equal(server.owners.size, 0, `server still has ${JSON.stringify([...server.owners])}\n  log: ${server.log.join(' | ')}`);
});

await test('(b) delayed token-refresh POST, then switch to B -> token maps to B only', async () => {
  const { server, plugin, lifecycle } = setup();
  await lifecycle.onSession('A', 'atA');

  plugin.rotateTo('fcm-token-refreshed-A-1');
  server.delayNextPost(200);
  void lifecycle.onTokenRefresh('fcm-token-refreshed-A-1');
  await sleep(20);

  // Account switch without an intermediate signed-out event (A's session still valid).
  await lifecycle.onSession('B', 'atB');
  await lifecycle.idle();
  await sleep(250);

  assert.deepEqual(ownersOf(server, 'A'), [], `A still owns tokens\n  log: ${server.log.join(' | ')}`);
  assert.deepEqual(ownersOf(server, 'B'), [plugin.current], `B should own the device token\n  log: ${server.log.join(' | ')}`);
  assert.equal(server.owners.size, 1);
});

await test('(b2) delayed POST, A signs out (revoked) and B signs in immediately -> B only', async () => {
  const { server, plugin, lifecycle } = setup();
  await lifecycle.onSession('A', 'atA');

  plugin.rotateTo('fcm-token-refreshed-A-2');
  server.delayNextPost(200);
  void lifecycle.onTokenRefresh('fcm-token-refreshed-A-2');
  await sleep(20);

  server.revoke('atA');
  void lifecycle.onSession(null, null);
  await lifecycle.onSession('B', 'atB');
  await lifecycle.idle();
  await sleep(250);

  assert.deepEqual(ownersOf(server, 'A'), [], `A still owns tokens\n  log: ${server.log.join(' | ')}`);
  assert.deepEqual(ownersOf(server, 'B'), [plugin.current]);
  assert.equal(server.owners.size, 1);
});

await test('(c) dispose during in-flight POST -> no further requests', async () => {
  const { server, plugin, lifecycle } = setup();
  server.delayNextPost(100);
  void lifecycle.onSession('A', 'atA');
  await sleep(20);
  lifecycle.dispose();
  const before = server.log.length;
  void lifecycle.onTokenRefresh('fcm-token-after-dispose');
  void lifecycle.onSession('B', 'atB');
  await sleep(150);
  await lifecycle.idle();
  // Only the already-sent POST may land; nothing new is started.
  assert.deepEqual(server.log.slice(before), [`POST landed ${plugin.current} -> A`]);
});

console.log(results.join('\n'));
if (process.exitCode) console.log('\nFAILED');
else console.log(`\nAll ${results.length} lifecycle tests passed.`);
