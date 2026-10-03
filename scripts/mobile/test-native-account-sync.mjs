#!/usr/bin/env node
// Tests for src/lib/native/account-sync-core.ts with mocked Capacitor plugins.
// Run: node scripts/mobile/test-native-account-sync.mjs   (Node 22.18+/23.6+: native TS type stripping)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createNativeAccountSync,
  OFFLINE_CACHE_KEYS,
  OFFLINE_OWNER_KEY,
  LOGOUT_PENDING_KEY,
} from '../../src/lib/native/account-sync-core.ts';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const inHours = (h) => new Date(NOW + h * 3_600_000).toISOString();

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mockNotifications() {
  const pending = new Map();
  const log = [];
  const gates = [];
  return {
    pending,
    log,
    /** Make the next not-yet-gated getPending() call wait for the returned deferred (FIFO). */
    holdNextGetPending() {
      const gate = deferred();
      gates.push(gate);
      return gate;
    },
    port: {
      async getPending() {
        const gate = gates.shift();
        if (gate) await gate.promise;
        log.push('getPending');
        return [...pending.values()].map((n) => ({ id: n.id, extra: n.extra }));
      },
      async cancel(ids) {
        log.push(`cancel:${ids.length}`);
        ids.forEach((id) => pending.delete(id));
      },
      async schedule(list) {
        log.push(`schedule:${list.length}`);
        list.forEach((n) => pending.set(n.id, n));
      },
      async ensurePermission() {
        return true;
      },
    },
  };
}

function mockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    port: {
      async get(key) {
        return map.has(key) ? map.get(key) : null;
      },
      async set(key, value) {
        map.set(key, value);
      },
      async remove(key) {
        map.delete(key);
      },
    },
  };
}

function setup(storageInitial) {
  const notifications = mockNotifications();
  const storage = mockStorage(storageInitial);
  const sync = createNativeAccountSync({
    notifications: notifications.port,
    storage: storage.port,
    pathForMovie: (id) => `/movie/${id}`,
    now: () => NOW,
  });
  return { sync, notifications, storage };
}

/** Simulate a page reload: drop the controller, keep device state (Preferences + OS notifications). */
function reload(device, notificationsPort = device.notifications.port) {
  return createNativeAccountSync({
    notifications: notificationsPort,
    storage: device.storage.port,
    pathForMovie: (id) => `/movie/${id}`,
    now: () => NOW,
  });
}

function assertDeviceClean(device, label) {
  assert.equal(device.notifications.pending.size, 0, `${label}: no reminders`);
  assert.equal(device.storage.map.has(OFFLINE_CACHE_KEYS.scheduled), false, `${label}: no scheduled cache`);
  assert.equal(device.storage.map.has(OFFLINE_CACHE_KEYS.friendRecs), false, `${label}: no friend-rec cache`);
  assert.equal(device.storage.map.has(OFFLINE_OWNER_KEY), false, `${label}: no owner key`);
  assert.equal(device.storage.map.has(LOGOUT_PENDING_KEY), false, `${label}: no pending-logout marker`);
}

async function signedInDevice(user = 'A') {
  const device = setup();
  await device.sync.setAccount(user);
  assert.equal(await device.sync.sync(user, fetchersFor(user)), 'synced');
  assert.equal(device.notifications.pending.size, 2);
  return device;
}

const reminder = (id, user, hours = 2) => ({
  id: `${user}-${id}`,
  movieId: `tmdb-${user}-${id}`,
  movieTitle: `${user} movie ${id}`,
  moviePoster: null,
  movieYear: 2024,
  remindAt: inHours(hours),
  canceledAt: null,
});

const fetchersFor = (user) => ({
  reminders: async () => [reminder(1, user), reminder(2, user)],
  friendRecs: async () => [{ id: `${user}-rec`, title: `${user} rec`, note: 'From friend' }],
});

const cacheOwner = (storage, kind) => {
  const raw = storage.map.get(OFFLINE_CACHE_KEYS[kind]);
  return raw ? JSON.parse(raw).userId : undefined;
};

test('baseline: sync schedules reminders and writes account-scoped caches', async () => {
  const { sync, notifications, storage } = setup();
  await sync.setAccount('A');
  assert.equal(await sync.sync('A', fetchersFor('A')), 'synced');
  assert.equal(notifications.pending.size, 2);
  assert.equal(storage.map.get(OFFLINE_OWNER_KEY), 'A');
  assert.equal(cacheOwner(storage, 'scheduled'), 'A');
  assert.equal(cacheOwner(storage, 'friendRecs'), 'A');
});

test('repro 1: slow fetch resolves after sign-out -> results discarded, nothing re-scheduled or re-cached', async () => {
  const { sync, notifications, storage } = setup();
  await sync.setAccount('A');
  const slow = deferred();
  const inflight = sync.sync('A', {
    reminders: () => slow.promise,
    friendRecs: async () => [{ id: 'A-rec', title: 'A rec' }],
  });
  await sync.setAccount(null); // sign-out while fetch is in flight
  slow.resolve([reminder(1, 'A'), reminder(2, 'A')]);
  assert.equal(await inflight, 'stale');
  await sync.idle();
  assert.equal(notifications.pending.size, 0, 'no notifications for A after sign-out');
  assert.equal(storage.map.has(OFFLINE_CACHE_KEYS.scheduled), false);
  assert.equal(storage.map.has(OFFLINE_CACHE_KEYS.friendRecs), false);
  assert.equal(storage.map.has(OFFLINE_OWNER_KEY), false);
});

test('repro 1b: sign-out while the sync mutation is mid-flight in the queue -> clear runs after it, final state empty', async () => {
  const { sync, notifications, storage } = setup();
  await sync.setAccount('A');
  const gate = notifications.holdNextGetPending(); // pause inside the queued reconcile
  const inflight = sync.sync('A', fetchersFor('A'));
  await new Promise((r) => setTimeout(r, 0));
  const signOut = sync.setAccount(null);
  gate.resolve();
  assert.equal(await inflight, 'stale');
  await signOut;
  assert.equal(notifications.pending.size, 0);
  assert.equal(storage.map.has(OFFLINE_CACHE_KEYS.scheduled), false);
  assert.equal(storage.map.has(OFFLINE_CACHE_KEYS.friendRecs), false);
  assert.equal(storage.map.has(OFFLINE_OWNER_KEY), false);
});

test('repro 2: offline switch A -> B (no network sync) clears A data; B never sees A private lists', async () => {
  const { sync, notifications, storage } = setup();
  await sync.setAccount('A');
  await sync.sync('A', fetchersFor('A'));
  assert.equal(notifications.pending.size, 2);

  // Offline: no sync() call for B, only the account transition.
  await sync.setAccount('B');
  assert.equal(notifications.pending.size, 0, "A's reminders cancelled");
  assert.equal(storage.map.has(OFFLINE_CACHE_KEYS.scheduled), false);
  assert.equal(storage.map.has(OFFLINE_CACHE_KEYS.friendRecs), false);
  assert.equal(storage.map.get(OFFLINE_OWNER_KEY), 'B');

  const savedForB = await sync.readSaved('B');
  assert.equal(savedForB.scheduled, null);
  assert.equal(savedForB.friendRecs, null);
  const savedWhileLoading = await sync.readSaved(undefined);
  assert.equal(savedWhileLoading.owner, 'B');
  assert.equal(savedWhileLoading.scheduled, null);
});

test('repro 2b: app restart with A data on disk and B signed in -> cleared on first setAccount', async () => {
  const first = setup();
  await first.sync.setAccount('A');
  await first.sync.sync('A', fetchersFor('A'));

  // New app session, same device storage + pending notifications, B is signed in.
  const notifications = first.notifications;
  const sync = createNativeAccountSync({
    notifications: notifications.port,
    storage: first.storage.port,
    pathForMovie: (id) => `/movie/${id}`,
    now: () => NOW,
  });
  await sync.setAccount('B');
  assert.equal(notifications.pending.size, 0);
  assert.equal(first.storage.map.has(OFFLINE_CACHE_KEYS.scheduled), false);
  assert.equal(first.storage.map.get(OFFLINE_OWNER_KEY), 'B');
});

test('same account across restarts keeps the offline cache', async () => {
  const first = setup();
  await first.sync.setAccount('A');
  await first.sync.sync('A', fetchersFor('A'));
  const sync = createNativeAccountSync({
    notifications: first.notifications.port,
    storage: first.storage.port,
    pathForMovie: (id) => `/movie/${id}`,
    now: () => NOW,
  });
  await sync.setAccount('A');
  const saved = await sync.readSaved('A');
  assert.equal(saved.scheduled?.items.length, 2);
  assert.equal(saved.friendRecs?.items.length, 1);
  assert.equal(first.notifications.pending.size, 2);
});

test('readSaved never returns another account\'s private entries; no owner -> no private data', async () => {
  const foreign = JSON.stringify({ version: 1, savedAt: '', userId: 'A', items: [{ id: '1', title: 'A secret' }] });
  const watchlist = JSON.stringify({ version: 1, savedAt: '', userId: null, items: [{ id: 'w', title: 'Device pick' }] });
  const { sync } = setup({
    [OFFLINE_CACHE_KEYS.scheduled]: foreign,
    [OFFLINE_CACHE_KEYS.friendRecs]: foreign,
    [OFFLINE_CACHE_KEYS.watchlist]: watchlist,
    [OFFLINE_OWNER_KEY]: 'B',
  });
  const asB = await sync.readSaved('B');
  assert.equal(asB.scheduled, null);
  assert.equal(asB.friendRecs, null);
  assert.equal(asB.watchlist?.items.length, 1, 'device-local watchlist still shown');
  const signedOut = await sync.readSaved(null);
  assert.equal(signedOut.scheduled, null);
  assert.equal(signedOut.owner, null);
});

test('stale user-initiated schedule after account switch is dropped', async () => {
  const { sync, notifications } = setup();
  await sync.setAccount('A');
  const scheduling = sync.scheduleReminder(reminder(9, 'A'), 'A');
  const switching = sync.setAccount('B');
  await Promise.all([scheduling, switching]);
  await sync.idle();
  assert.equal(notifications.pending.size, 0);
  assert.equal(await sync.scheduleReminder(reminder(9, 'A'), 'A'), false, 'A can no longer schedule while B is signed in');
});

test('friend reminders for a signed-out account are not shown', async () => {
  const { sync, notifications } = setup();
  await sync.setAccount('A');
  const show = sync.showFriendReminders([{ id: 'f1', movieId: '1', movieTitle: 'X', senderName: 'Ravi' }], () => '/movie/1', 'A');
  await sync.setAccount(null);
  await show;
  await sync.idle();
  assert.equal(notifications.pending.size, 0);
});

test('queue: a failing mutation does not block later ones', async () => {
  const { sync, notifications } = setup();
  await sync.setAccount('A');
  const original = notifications.port.getPending;
  notifications.port.getPending = async () => {
    notifications.port.getPending = original;
    throw new Error('plugin failure');
  };
  await assert.rejects(sync.scheduleReminder(reminder(1, 'A'), 'A'));
  assert.equal(await sync.scheduleReminder(reminder(1, 'A'), 'A'), true);
  assert.equal(notifications.pending.size, 1);
});

// ---- Awaited sign-out cleanup (logout registry) + pending-logout marker ----

test('logout -> controller disposed -> reload signed out: nothing private remains', async () => {
  const device = await signedInDevice('A');
  assert.equal(await device.sync.logout('A'), true);
  assertDeviceClean(device, 'after logout');

  const next = reload(device);
  assert.equal(await next.finishPendingLogout(), true);
  await next.setAccount(null);
  await next.idle();
  assertDeviceClean(device, 'after reload');
  const saved = await next.readSaved(null);
  assert.equal(saved.scheduled, null);
  assert.equal(saved.friendRecs, null);
});

test('logout while a sync result is still in flight: the late result is discarded', async () => {
  const device = setup();
  await device.sync.setAccount('A');
  const slow = deferred();
  const inflight = device.sync.sync('A', { reminders: () => slow.promise, friendRecs: async () => [] });
  const done = device.sync.logout('A');
  slow.resolve([reminder(1, 'A')]);
  assert.equal(await inflight, 'stale');
  assert.equal(await done, true);
  await device.sync.idle();
  assertDeviceClean(device, 'after logout + late sync');
});

test('cleanup never ran (app killed before logout cleanup) -> next signed-out startup cleans up', async () => {
  const device = await signedInDevice('A');
  // No logout() call: the process died. Session is gone on reload.
  const next = reload(device);
  assert.equal((await next.readSaved(null)).scheduled, null, 'signed out: private data hidden');
  await next.finishPendingLogout(); // no marker: nothing to do
  await next.setAccount(null); // owner key present while signed out -> cleanup
  await next.idle();
  assertDeviceClean(device, 'after startup');
});

test('cleanup interrupted after the marker was written (timeout won) -> reload hides private data, then completes cleanup', async () => {
  const device = await signedInDevice('A');
  // OS call hangs forever: cleanup cannot finish this session.
  const hangingPort = { ...device.notifications.port, getPending: () => new Promise(() => {}) };
  const hung = createNativeAccountSync({
    notifications: hangingPort,
    storage: device.storage.port,
    pathForMovie: (id) => `/movie/${id}`,
    now: () => NOW,
  });
  await hung.setAccount('A');
  // Registry timeout wins (bounded sign-out), the app reloads.
  const winner = await Promise.race([hung.logout('A').then(() => 'cleanup'), new Promise((r) => setTimeout(() => r('timeout'), 30))]);
  assert.equal(winner, 'timeout');
  assert.equal(device.storage.map.has(LOGOUT_PENDING_KEY), true, 'marker persisted before cleanup');
  assert.equal(device.notifications.pending.size, 2, 'cleanup did not finish: reminders still scheduled');
  assert.equal(device.storage.map.get(OFFLINE_OWNER_KEY), 'A', 'cleanup did not finish: owner key still set');
  // Re-plant a private cache as if the (parallel) cache removal had not run either.
  device.storage.map.set(
    OFFLINE_CACHE_KEYS.scheduled,
    JSON.stringify({ version: 1, savedAt: '', userId: 'A', items: [{ id: '1', title: 'A secret' }] }),
  );

  const next = reload(device);
  // Before the cleanup is finished, no private data is exposed for any owner hint.
  for (const hint of [undefined, 'A', null]) {
    const saved = await next.readSaved(hint);
    assert.equal(saved.scheduled, null, `hint ${hint}: scheduled hidden`);
    assert.equal(saved.friendRecs, null, `hint ${hint}: friend recs hidden`);
  }
  assert.equal(await next.finishPendingLogout(), true);
  assertDeviceClean(device, 'after startup recovery');
});

test('a failed cleanup step keeps the marker (never cleared just because the call returned)', async () => {
  const device = await signedInDevice('A');
  const failingStorage = {
    ...device.storage.port,
    async remove(key) {
      if (key === OFFLINE_CACHE_KEYS.friendRecs) throw new Error('disk error');
      return device.storage.port.remove(key);
    },
  };
  const ctl = createNativeAccountSync({
    notifications: device.notifications.port,
    storage: failingStorage,
    pathForMovie: (id) => `/movie/${id}`,
    now: () => NOW,
  });
  await ctl.setAccount('A');
  assert.equal(await ctl.logout('A'), false);
  assert.equal(device.storage.map.has(LOGOUT_PENDING_KEY), true);
  assert.equal((await ctl.readSaved(undefined)).friendRecs, null, 'private data hidden while marker exists');

  const next = reload(device);
  assert.equal(await next.finishPendingLogout(), true);
  assertDeviceClean(device, 'after retry on startup');
});

test('a stale in-flight cleanup does not clear a newer marker', async () => {
  const device = await signedInDevice('A');
  const gate1 = device.notifications.holdNextGetPending();
  const gate2 = device.notifications.holdNextGetPending();
  const first = device.sync.logout('A');
  await new Promise((r) => setTimeout(r, 0));
  const second = device.sync.logout('A'); // newer marker written while the first cleanup is in flight
  await new Promise((r) => setTimeout(r, 0));
  const newerMarker = device.storage.map.get(LOGOUT_PENDING_KEY);
  assert.ok(newerMarker);

  gate1.resolve();
  assert.equal(await first, true);
  assert.equal(device.storage.map.get(LOGOUT_PENDING_KEY), newerMarker, 'first cleanup left the newer marker alone');

  gate2.resolve();
  assert.equal(await second, true);
  assertDeviceClean(device, 'after both cleanups');
});

test('sign-in of B after an unfinished sign-out of A: A data cleared, marker removed, B owns the device', async () => {
  const device = await signedInDevice('A');
  device.storage.map.set(LOGOUT_PENDING_KEY, JSON.stringify({ token: 'old', userId: 'A' }));
  const next = reload(device);
  await next.setAccount('B');
  assert.equal(device.notifications.pending.size, 0);
  assert.equal(device.storage.map.has(OFFLINE_CACHE_KEYS.scheduled), false);
  assert.equal(device.storage.map.has(LOGOUT_PENDING_KEY), false);
  assert.equal(device.storage.map.get(OFFLINE_OWNER_KEY), 'B');
});
