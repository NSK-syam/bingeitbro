// Browser checks for the native app shell's tab bar and Recommend sheet (redesign PR 1).
// Not part of CI: needs Playwright installed separately, plus a dev server with mock Supabase env:
//   NEXT_PUBLIC_SUPABASE_URL=http://mock.supabase.test:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key npx next dev -p 3200
//   node scripts/mobile/e2e-app-shell.mjs
// Supabase calls are intercepted and a fake session is seeded, so no real credentials are used.

import { webkit, devices } from 'playwright';
const BASE = 'http://localhost:3200';
const USER = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'tester@example.com',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'Tester' }, created_at: '2026-01-01T00:00:00Z' };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now })}.sig`;
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'mock-refresh', user: USER };

const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 15'] });
await ctx.addInitScript(([s]) => { try { localStorage.setItem('sb-mock-auth-token', s); } catch {} }, [JSON.stringify(session)]);
await ctx.route('http://mock.supabase.test:54399/**', async (route) => {
  const req = route.request(); const url = new URL(req.url());
  if (url.pathname === '/auth/v1/user') return route.fulfill({ json: USER });
  if (url.pathname.startsWith('/rest/v1/')) {
    const row = { id: USER.id, email: USER.email, name: 'Tester', username: 'tester', avatar: '🎬', birthdate: null };
    const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    if (req.method() !== 'GET') return route.fulfill({ status: 201, json: wantsObject ? row : [row] });
    return route.fulfill({ json: wantsObject ? row : [row] });
  }
  return route.fulfill({ json: {} });
});
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const path = () => { const u = new URL(page.url()); return u.pathname + u.search; };
const dialog = () => page.getByRole('dialog');
const settle = () => page.waitForTimeout(700);

await page.goto(BASE + '/app', { waitUntil: 'networkidle' }); await settle();
check('signed-in /app stays on Home', path() === '/app', path());
await page.getByRole('link', { name: 'Picks', exact: true }).click(); await page.waitForURL('**/app/picks'); await settle();
check('tab navigation to Picks, aria-current set', (await page.getByRole('link', { name: 'Picks', exact: true }).getAttribute('aria-current')) === 'page');
check('Recommend action has no aria-current', (await page.getByRole('button', { name: 'Recommend a movie' }).getAttribute('aria-current')) === null);

// 1. open -> Back closes once without changing screen; Back again leaves to Home (no phantom entry)
await page.getByRole('button', { name: 'Recommend a movie' }).click(); await settle();
check('open: URL has sheet flag and dialog visible', path() === '/app/picks?sheet=recommend' && await dialog().isVisible(), path());
check('open: focus moved into dialog', await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
check('open: main and tab bar inert', await page.evaluate(() => document.querySelector('main')?.inert === true && document.querySelector('nav[aria-label="Main"]')?.inert === true));
await page.goBack(); await settle();
check('Back closes the sheet and stays on Picks', path() === '/app/picks' && !(await dialog().count()), path());
await page.goBack(); await settle();
check('second Back goes to Home (no phantom entry)', path() === '/app', path());
await page.goForward(); await settle();
check('Forward returns to Picks (not a duplicate sheet entry)', path() === '/app/picks' || path() === '/app/picks?sheet=recommend', path());
if (path() !== '/app/picks') { await page.goBack(); await settle(); }

// 2. close button, Escape, swipe; focus returns to the opener
for (const how of ['button', 'escape', 'swipe', 'backdrop']) {
  await page.getByRole('button', { name: 'Recommend a movie' }).click(); await settle();
  if (how === 'button') await dialog().getByRole('button', { name: 'Close' }).click();
  if (how === 'escape') await page.keyboard.press('Escape');
  if (how === 'backdrop') await page.mouse.click(195, 60);
  if (how === 'swipe') {
    const grab = await page.locator('[role="dialog"] > div').first().boundingBox();
    await page.mouse.move(grab.x + grab.width / 2, grab.y + 8); await page.mouse.down();
    await page.mouse.move(grab.x + grab.width / 2, grab.y + 200, { steps: 8 }); await page.mouse.up();
  }
  await settle();
  const focusBack = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  check(`close via ${how}: closed, URL back to /app/picks`, path() === '/app/picks' && !(await dialog().count()), path());
  check(`close via ${how}: focus returned to Recommend button`, focusBack === 'Recommend a movie', String(focusBack));
}
await page.goBack(); await settle();
check('after 4 open/close cycles, Back goes to Home (no leftover entries)', path() === '/app', path());

// 3. repeated rapid open/close
await page.getByRole('link', { name: 'Groups', exact: true }).click(); await page.waitForURL('**/app/groups'); await settle();
for (let i = 0; i < 5; i += 1) {
  await page.getByRole('button', { name: 'Recommend a movie' }).click(); await page.waitForTimeout(250);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
}
await settle();
check('5 rapid open/close (double Escape) leave Groups clean', path() === '/app/groups' && !(await dialog().count()), path());
await page.goBack(); await settle();
check('Back after rapid cycles goes to Home', path() === '/app', path());

// 4. ?sheet=recommend deep link: close replaces without adding history
await page.goto(BASE + '/app/me?sheet=recommend', { waitUntil: 'networkidle' }); await settle();
check('deep link opens sheet', await dialog().isVisible());
await dialog().getByRole('button', { name: 'Close' }).click(); await settle();
check('deep link close -> /app/me', path() === '/app/me', path());
await page.goBack(); await settle();
check('Back after deep-link close leaves the deep-linked page (previous entry)', path() === '/app', path());

// 5. router still usable
await page.getByRole('link', { name: 'Me', exact: true }).click(); await page.waitForURL('**/app/me'); await settle();
check('router usable afterwards (Home -> Me)', path() === '/app/me', path());

// 6. invalid / malformed app URLs don't crash
for (const bad of ['/app/title/movie/%E0%A4%A', '/app/profile/%FF', '/app/welcome?next=%2Fapp%2Ftitle%2Fmovie%2F%25FF', '/app/title/podcast/1']) {
  await page.goto(BASE + bad, { waitUntil: 'networkidle' }); await settle();
  { const st = await page.evaluate(() => document.body.innerText.includes('Bad Request') ? 'server 400' : 'app'); check(`malformed ${bad} rejected safely`, st === 'server 400' || ['/app','/app/welcome'].includes(path()), st + ' ' + path()); }
}
console.log(results.join('\n'));
console.log('page errors:', errors.length ? errors : 'none');
console.log(`TOTAL: ${results.filter(r => r.startsWith('PASS')).length} pass, ${results.filter(r => r.startsWith('FAIL')).length} fail`);
await browser.close();
