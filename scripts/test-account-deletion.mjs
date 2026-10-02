#!/usr/bin/env node
/**
 * Exercises the POST /api/account/delete handler logic with a mocked fetch
 * (no network, no Supabase, no Apple). Run: node scripts/test-account-deletion.mjs
 * Requires Node >= 22.18 / 23.6 (built-in TypeScript type stripping).
 */
import assert from 'node:assert/strict';
import { handleAccountDeletion, sha256Hex } from '../src/lib/server/account-deletion.ts';

const SUPABASE = 'https://proj.supabase.co';
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const SERVICE_KEY = 'aaa.bbb.ccc';

const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
const b64uJson = (obj) => b64u(Buffer.from(JSON.stringify(obj)));
const fakeJwt = (payload) => `${b64uJson({ alg: 'HS256' })}.${b64uJson(payload)}.sig`;

// ---- Apple keys: RSA (identity token signer / JWKS) and EC P-256 (.p8) ----
const rsa = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
);
const rsaJwk = await crypto.subtle.exportKey('jwk', rsa.publicKey);
const APPLE_KID = 'test-kid';
const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', ec.privateKey)).toString('base64');
const P8_PEM = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;

async function appleIdentityToken({ sub, rawNonce, aud = 'com.bingeitbro.app', iat = NOW / 1000 - 30 }) {
  const header = b64uJson({ alg: 'RS256', kid: APPLE_KID });
  const payload = b64uJson({
    iss: 'https://appleid.apple.com',
    aud,
    sub,
    iat: Math.floor(iat),
    exp: Math.floor(iat) + 600,
    nonce: await sha256Hex(rawNonce),
    nonce_supported: true,
  });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', rsa.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64u(new Uint8Array(sig))}`;
}

const BASE_ENV = { supabaseUrl: SUPABASE, anonKey: 'anon-key', serviceKey: SERVICE_KEY };
const APPLE_ENV = { ...BASE_ENV, appleTeamId: 'TEAM123456', appleKeyId: 'KEY1234567', applePrivateKey: P8_PEM };

/**
 * Mock backend. users: id -> { token, email, password, providers, appleSub, lastSignIn }.
 * failOnce: set of "METHOD path-prefix" that fail with 500 the first time they are hit.
 */
function makeBackend(users, { failOnce = [] } = {}) {
  const calls = [];
  const failures = new Set(failOnce);
  const alive = new Set(Object.keys(users));
  const destructive = () => calls.filter((c) => c.method === 'DELETE' || c.url.includes('/auth/revoke'));

  const res = (status, body) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  async function fetchMock(input, init = {}) {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ method, url, body: init.body ? String(init.body) : '' });

    for (const key of failures) {
      const [m, prefix] = key.split(' ');
      if (m === method && url.startsWith(prefix)) {
        failures.delete(key);
        return res(500, { message: 'injected failure' });
      }
    }

    const auth = (init.headers?.Authorization || init.headers?.authorization || '').replace(/^Bearer /, '');

    if (url === 'https://appleid.apple.com/auth/keys') {
      return res(200, { keys: [{ ...rsaJwk, kid: APPLE_KID, alg: 'RS256', use: 'sig' }] });
    }
    if (url === 'https://appleid.apple.com/auth/token') {
      const form = new URLSearchParams(String(init.body));
      assert.equal(form.get('client_id'), 'com.bingeitbro.app');
      assert.equal(form.get('grant_type'), 'authorization_code');
      assert.equal(form.get('client_secret').split('.').length, 3);
      if (form.get('code') !== 'good-code') return res(400, { error: 'invalid_grant' });
      return res(200, { access_token: 'apple-at', refresh_token: 'apple-rt', id_token: 'x' });
    }
    if (url === 'https://appleid.apple.com/auth/revoke') {
      const form = new URLSearchParams(String(init.body));
      assert.equal(form.get('token'), 'apple-rt');
      assert.equal(form.get('token_type_hint'), 'refresh_token');
      return res(200);
    }

    if (url === `${SUPABASE}/auth/v1/user`) {
      const entry = Object.entries(users).find(([, u]) => u.token === auth);
      if (!entry) return res(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
      const [id] = entry;
      if (!alive.has(id)) return res(403, { error_code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' });
      return res(200, { id, email: users[id].email });
    }
    if (url.startsWith(`${SUPABASE}/auth/v1/token?grant_type=password`)) {
      const { email, password } = JSON.parse(String(init.body));
      const entry = Object.entries(users).find(([, u]) => u.email === email);
      if (!entry || entry[1].password !== password) return res(400, { error: 'invalid_grant' });
      return res(200, { access_token: 'tmp-session', user: { id: entry[0] } });
    }
    if (url.startsWith(`${SUPABASE}/auth/v1/logout`)) return res(204);

    const adminMatch = url.match(/\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/);
    if (adminMatch) {
      assert.equal(auth, SERVICE_KEY, 'admin API must use the service role');
      const id = adminMatch[1];
      if (!alive.has(id)) return res(404, { msg: 'User not found' });
      if (method === 'DELETE') {
        alive.delete(id);
        return res(200, {});
      }
      const u = users[id];
      const identities = u.providers.map((provider) => ({
        id: provider === 'apple' ? u.appleSub : id,
        provider,
        provider_id: provider === 'apple' ? u.appleSub : id,
        identity_data: { sub: provider === 'apple' ? u.appleSub : id },
      }));
      return res(200, {
        id,
        email: u.email,
        last_sign_in_at: new Date(u.lastSignIn ?? NOW - 60 * 60 * 1000).toISOString(),
        app_metadata: { provider: u.providers[0], providers: u.providers },
        identities,
      });
    }

    if (url.startsWith(`${SUPABASE}/rest/v1/`)) {
      assert.equal(auth, SERVICE_KEY, 'REST deletes must use the service role');
      if (method === 'GET') return res(200, [{ id: '99999999-9999-4999-8999-999999999999' }]);
      if (method === 'DELETE') return res(204);
    }

    throw new Error(`unexpected fetch ${method} ${url}`);
  }

  return { fetch: fetchMock, calls, destructive, alive };
}

const deps = (backend) => ({ fetch: backend.fetch, now: () => NOW });
const run = (backend, env, token, body) =>
  handleAccountDeletion({ authorization: token ? `Bearer ${token}` : null, body }, env, deps(backend));

const U_EMAIL = '11111111-1111-4111-8111-111111111111';
const U_GOOGLE = '22222222-2222-4222-8222-222222222222';
const U_APPLE = '33333333-3333-4333-8333-333333333333';

const freshGoogleToken = fakeJwt({ sub: U_GOOGLE, amr: [{ method: 'oauth', timestamp: NOW / 1000 - 120 }] });
const staleGoogleToken = fakeJwt({ sub: U_GOOGLE, amr: [{ method: 'oauth', timestamp: NOW / 1000 - 3 * 3600 }] });

function users() {
  return {
    [U_EMAIL]: { token: 'tok-email', email: 'e@example.com', password: 'hunter22', providers: ['email'] },
    [U_GOOGLE]: { token: freshGoogleToken, email: 'g@example.com', providers: ['google'] },
    [U_APPLE]: { token: 'tok-apple', email: 'x@privaterelay.appleid.com', providers: ['apple'], appleSub: '000123.apple.sub' },
  };
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}\n`, err);
    process.exitCode = 1;
  }
}

await test('missing bearer -> 401, nothing deleted', async () => {
  const be = makeBackend(users());
  const r = await run(be, BASE_ENV, null, { confirm: 'DELETE' });
  assert.equal(r.status, 401);
  assert.equal(be.destructive().length, 0);
});

await test('invalid bearer -> 401, nothing deleted', async () => {
  const be = makeBackend(users());
  const r = await run(be, BASE_ENV, 'garbage', { confirm: 'DELETE', password: 'hunter22' });
  assert.equal(r.status, 401);
  assert.equal(r.body.code, 'not_authenticated');
  assert.equal(be.destructive().length, 0);
});

await test('missing confirm -> 400, nothing deleted', async () => {
  const be = makeBackend(users());
  const r = await run(be, BASE_ENV, 'tok-email', { password: 'hunter22' });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'confirmation_required');
  assert.equal(be.destructive().length, 0);
});

await test('email user with correct password deletes successfully (non-Apple)', async () => {
  const be = makeBackend(users());
  const r = await run(be, BASE_ENV, 'tok-email', { confirm: 'DELETE', password: 'hunter22' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.equal(r.body.appleRevoked, false);
  assert.ok(!be.alive.has(U_EMAIL));
  const order = be.destructive().map((c) => `${c.method} ${c.url.replace(SUPABASE, '').split('?')[0]}`);
  assert.deepEqual(order, [
    'DELETE /rest/v1/native_push_tokens',
    'DELETE /rest/v1/chat_themes',
    'DELETE /rest/v1/chat_themes',
    `DELETE /auth/v1/admin/users/${U_EMAIL}`,
  ]);
  assert.ok(!be.calls.some((c) => c.url.includes('appleid.apple.com')));
});

await test('bad password -> 401 invalid_password, nothing deleted', async () => {
  const be = makeBackend(users());
  const r = await run(be, BASE_ENV, 'tok-email', { confirm: 'DELETE', password: 'wrong' });
  assert.equal(r.status, 401);
  assert.equal(r.body.code, 'invalid_password');
  assert.equal(be.destructive().length, 0);
  assert.ok(be.alive.has(U_EMAIL));
});

await test('missing password for email user -> 401 password_required, nothing deleted', async () => {
  const be = makeBackend(users());
  const r = await run(be, BASE_ENV, 'tok-email', { confirm: 'DELETE' });
  assert.equal(r.status, 401);
  assert.equal(r.body.code, 'password_required');
  assert.equal(be.destructive().length, 0);
});

await test('Google user with recent sign-in deletes successfully', async () => {
  const be = makeBackend(users());
  const r = await run(be, BASE_ENV, freshGoogleToken, { confirm: 'DELETE' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(!be.alive.has(U_GOOGLE));
});

await test('stale Google session -> 403 reauth_required, nothing deleted', async () => {
  const u = users();
  u[U_GOOGLE].token = staleGoogleToken;
  const be = makeBackend(u);
  const r = await run(be, BASE_ENV, staleGoogleToken, { confirm: 'DELETE' });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'reauth_required');
  assert.equal(be.destructive().length, 0);
});

await test('Apple user with env present: verify id token, then token exchange, then revoke, then delete', async () => {
  const be = makeBackend(users());
  const rawNonce = 'raw-nonce-abc';
  const r = await run(be, APPLE_ENV, 'tok-apple', {
    confirm: 'DELETE',
    appleIdentityToken: await appleIdentityToken({ sub: '000123.apple.sub', rawNonce }),
    appleAuthorizationCode: 'good-code',
    appleNonce: rawNonce,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.appleRevoked, true);
  const urls = be.calls.map((c) => c.url);
  const iToken = urls.indexOf('https://appleid.apple.com/auth/token');
  const iRevoke = urls.indexOf('https://appleid.apple.com/auth/revoke');
  const iFirstDelete = be.calls.findIndex((c) => c.method === 'DELETE');
  assert.ok(iToken >= 0 && iRevoke > iToken && iFirstDelete > iRevoke, 'token -> revoke -> deletes');
  assert.ok(!be.alive.has(U_APPLE));
});

await test('Apple user, Apple env missing -> 503 apple_revocation_unavailable, nothing deleted', async () => {
  const be = makeBackend(users());
  const rawNonce = 'n1';
  const r = await run(be, BASE_ENV, 'tok-apple', {
    confirm: 'DELETE',
    appleIdentityToken: await appleIdentityToken({ sub: '000123.apple.sub', rawNonce }),
    appleAuthorizationCode: 'good-code',
    appleNonce: rawNonce,
  });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'apple_revocation_unavailable');
  assert.equal(be.destructive().length, 0);
  assert.ok(be.alive.has(U_APPLE));
});

await test('Apple user without fresh Apple re-auth -> 400 apple_reauth_required, nothing deleted', async () => {
  const be = makeBackend(users());
  const r = await run(be, APPLE_ENV, 'tok-apple', { confirm: 'DELETE' });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'apple_reauth_required');
  assert.equal(be.destructive().length, 0);
});

await test('Apple sub mismatch -> 403 apple_account_mismatch, nothing deleted', async () => {
  const be = makeBackend(users());
  const rawNonce = 'n2';
  const r = await run(be, APPLE_ENV, 'tok-apple', {
    confirm: 'DELETE',
    appleIdentityToken: await appleIdentityToken({ sub: 'someone.else', rawNonce }),
    appleAuthorizationCode: 'good-code',
    appleNonce: rawNonce,
  });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'apple_account_mismatch');
  assert.equal(be.destructive().length, 0);
  assert.ok(!be.calls.some((c) => c.url === 'https://appleid.apple.com/auth/token'));
});

await test('Apple nonce mismatch -> 401 apple_token_invalid, nothing deleted', async () => {
  const be = makeBackend(users());
  const r = await run(be, APPLE_ENV, 'tok-apple', {
    confirm: 'DELETE',
    appleIdentityToken: await appleIdentityToken({ sub: '000123.apple.sub', rawNonce: 'real' }),
    appleAuthorizationCode: 'good-code',
    appleNonce: 'different',
  });
  assert.equal(r.status, 401);
  assert.equal(r.body.code, 'apple_token_invalid');
  assert.equal(be.destructive().length, 0);
});

await test('Apple token exchange fails -> 502, nothing deleted', async () => {
  const be = makeBackend(users());
  const rawNonce = 'n3';
  const r = await run(be, APPLE_ENV, 'tok-apple', {
    confirm: 'DELETE',
    appleIdentityToken: await appleIdentityToken({ sub: '000123.apple.sub', rawNonce }),
    appleAuthorizationCode: 'expired-code',
    appleNonce: rawNonce,
  });
  assert.equal(r.status, 502);
  assert.equal(r.body.code, 'apple_revocation_failed');
  assert.equal(r.body.retryable, true);
  assert.equal(be.destructive().length, 0);
  assert.ok(be.alive.has(U_APPLE));
});

await test('failure mid-sequence -> 500 retryable (user still exists), retry completes', async () => {
  const be = makeBackend(users(), { failOnce: [`DELETE ${SUPABASE}/rest/v1/chat_themes`] });
  const first = await run(be, BASE_ENV, 'tok-email', { confirm: 'DELETE', password: 'hunter22' });
  assert.equal(first.status, 500);
  assert.equal(first.body.retryable, true);
  assert.equal(first.body.step, 'chat_themes');
  assert.ok(be.alive.has(U_EMAIL), 'auth user must survive a mid-sequence failure');
  const second = await run(be, BASE_ENV, 'tok-email', { confirm: 'DELETE', password: 'hunter22' });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.ok(!be.alive.has(U_EMAIL));
});

await test('auth delete fails once -> falls back to deleting public.users, then succeeds', async () => {
  const be = makeBackend(users(), { failOnce: [`DELETE ${SUPABASE}/auth/v1/admin/users/`] });
  const r = await run(be, BASE_ENV, 'tok-email', { confirm: 'DELETE', password: 'hunter22' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(be.calls.some((c) => c.method === 'DELETE' && c.url.includes('/rest/v1/users?id=eq.')));
  assert.ok(!be.alive.has(U_EMAIL));
});

await test('already deleted user (valid JWT, user gone) -> 200 alreadyDeleted, idempotent', async () => {
  const be = makeBackend(users());
  be.alive.delete(U_EMAIL);
  const r = await run(be, BASE_ENV, 'tok-email', { confirm: 'DELETE', password: 'hunter22' });
  assert.equal(r.status, 200);
  assert.equal(r.body.alreadyDeleted, true);
  assert.equal(be.destructive().length, 0);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
