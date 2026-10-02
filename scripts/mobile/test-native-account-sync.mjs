#!/usr/bin/env node
// Tests for src/lib/native/account-sync-core.ts with mocked Capacitor plugins.
// Run: node scripts/mobile/test-native-account-sync.mjs   (Node 22.18+/23.6+: native TS type stripping)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createNativeAccountSync,
  OFFLINE_CACHE_KEYS,
  OFFLINE_OWNER_KEY,
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
  let getPendingGate = null;
  return {
    pending,
    log,
    /** Make the next getPending() wait for the returned deferred. */
    holdNextGetPending() {
      getPendingGate = deferred();
      return getPendingGate;
    },
    port: {
      async getPending() {
        if (getPendingGate) {
          const gate = getPendingGate;
          getPendingGate = null;
          await gate.promise;
        }
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
