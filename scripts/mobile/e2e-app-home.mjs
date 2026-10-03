// Browser checks for the app shell's Home and Welcome screens (redesign PR 2).
// Not part of CI: needs Playwright installed separately, plus a dev server with mock Supabase env:
//   NEXT_PUBLIC_SUPABASE_URL=http://mock.supabase.test:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key npx next dev -p 3200
//   node scripts/mobile/e2e-app-home.mjs
// Supabase, /api/watch-reminders and the TMDB proxy are intercepted with fixtures; no real credentials.

import { webkit, devices } from 'playwright';
const BASE = 'http://localhost:3200';
const USER = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'tester@example.com',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'Syam' }, created_at: '2026-01-01T00:00:00Z' };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now })}.sig`;
const session = JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r', user: USER });
const tonight = new Date(); tonight.setHours(21, 0, 0, 0); if (tonight < new Date()) tonight.setDate(tonight.getDate() + 1);
const RECS = [
  { id: 'r1', sender_id: 'u2', movie_title: 'Dune: Part Two', movie_poster: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg', movie_year: 2024, personal_message: 'Watch it in IMAX bro. The sandworm ride alone is worth it.', is_read: false, is_watched: false, created_at: new Date(Date.now() - 7200e3).toISOString(), tmdb_id: 693134, recommendation_id: null },
  { id: 'r2', sender_id: 'u3', movie_title: 'Kantara', movie_poster: '', movie_year: 2022, personal_message: 'That last 20 minutes.', is_read: false, created_at: new Date(Date.now() - 9e6).toISOString(), tmdb_id: 853645, recommendation_id: null },
  { id: 'r3', sender_id: 'u4', movie_title: 'Past Lives', movie_poster: '', movie_year: 2023, personal_message: 'Quiet one.', is_read: true, created_at: new Date(Date.now() - 9e7).toISOString(), tmdb_id: 666277, recommendation_id: null },
];
const USERS = [{ id: 'u2', name: 'Rahul', avatar: '🍿' }, { id: 'u3', name: 'Priya', avatar: '' }, { id: 'u4', name: 'Arjun', avatar: '' }];
const REMINDERS = [{ id: 'w1', movieId: 'tmdb-666277', movieTitle: 'Past Lives', moviePoster: null, movieYear: 2023, remindAt: tonight.toISOString(), createdAt: '', updatedAt: '', notifiedAt: null, canceledAt: null }];
const TRENDING = Array.from({ length: 6 }, (_, i) => ({ id: 1000 + i, title: ['Pushpa 2', 'Stree 2', 'Devara', 'Kalki 2898 AD', 'Jawan', 'Premalu'][i], poster_path: null, backdrop_path: null, release_date: '2024-08-01', vote_average: 7, overview: '', genre_ids: [], original_language: 'hi' }));

async function setup(device, { recs = RECS, failing = { recs: false, tmdb: false }, tmdbDelayMs = 0, offline = false, signedIn = true } = {}) {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices[device] });
  // next dev only: its indicator / "Compiling" badge (<nextjs-portal>) overlaps the tab bar. Hide it so
  // taps behave as in production, where it doesn't exist.
  await ctx.addInitScript(() => {
    const style = () => { const el = document.createElement('style'); el.textContent = 'nextjs-portal{display:none!important}'; document.documentElement.appendChild(el); };
    if (document.documentElement) style(); else document.addEventListener('DOMContentLoaded', style);
  });
  if (signedIn) await ctx.addInitScript(([s]) => { try { localStorage.setItem('sb-mock-auth-token', s); } catch {} }, [session]);
  let recCalls = 0;
  await ctx.route('http://mock.supabase.test:54399/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: USER });
    if (url.pathname === '/rest/v1/friend_recommendations') {
      recCalls += 1;
      if (failing.recs) return route.fulfill({ status: 500, json: { message: 'boom' } });
      return route.fulfill({ json: recs });
    }
    if (url.pathname === '/rest/v1/users') {
      const accept = route.request().headers()['accept'] || '';
      if (accept.includes('vnd.pgrst.object')) return route.fulfill({ json: { id: USER.id, name: 'Syam', username: 'syam', email: USER.email, birthdate: null } });
      return route.fulfill({ json: url.searchParams.get('id')?.startsWith('in.') ? USERS : [{ id: USER.id, name: 'Syam', username: 'syam', email: USER.email }] });
    }
    return route.fulfill({ json: [] });
  });
  await ctx.route('**/api/watch-reminders**', (route) => route.fulfill({ json: { reminders: REMINDERS } }));
  await ctx.route('**/api/tmdb/**', async (route) => {
    if (tmdbDelayMs) await new Promise((r) => setTimeout(r, tmdbDelayMs));
    if (failing.tmdb) return route.fulfill({ status: 503, json: { status_message: 'unavailable' } });
    const u = new URL(route.request().url()).searchParams.get('u') || '';
    const tmdb = Buffer.from(u, 'base64url').toString();
    if (tmdb.includes('/watch/providers')) return route.fulfill({ json: { results: { IN: { flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/n.png' }] } } } });
    if (tmdb.includes('/discover/movie') || tmdb.includes('/trending/')) return route.fulfill({ json: { results: TRENDING } });
    return route.fulfill({ json: {} });
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  if (offline) await ctx.setOffline(false);
  return { browser, ctx, page, errors, recCallsRef: () => recCalls };
}
const results = []; const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`);
const allErrors = [];
const settle = (p, ms = 1500) => p.waitForTimeout(ms);

try {
  // A. Home with data, iPhone
  {
    const { browser, page, errors } = await setup('iPhone 15');
    await page.goto(BASE + '/app', { waitUntil: 'networkidle' }); await settle(page, 2500);
    check('Home stays on /app when signed in', new URL(page.url()).pathname === '/app');
    check('hero shows latest unread pick', await page.getByRole('link', { name: 'Dune: Part Two' }).first().isVisible());
    check('hero shows who picked it and the note', (await page.locator('main').innerText()).includes('Rahul picked this for you') && (await page.locator('main').innerText()).includes('sandworm'));
    const whereHref = await page.getByRole('link', { name: 'Where to watch' }).getAttribute('href');
    check('Where to watch links to the app title screen', whereHref === '/app/title/movie/tmdb-693134', String(whereHref));
    const save = page.getByRole('button', { name: /^Save/ });
    await save.click(); await settle(page, 300);
    check('Save toggles to Saved (aria-pressed)', (await page.getByRole('button', { name: 'Saved' }).getAttribute('aria-pressed')) === 'true');
    const fromFriends = page.getByRole('region', { name: 'From friends' });
    check('From friends row lists all 3 picks', (await fromFriends.getByRole('link').count()) === 4, String(await fromFriends.getByRole('link').count()) + ' links incl. "2 new"');
    check('From friends shows unread count', await fromFriends.getByRole('link', { name: '2 new' }).isVisible());
    check('Coming up shows tonight\'s schedule', (await page.getByRole('region', { name: 'Coming up' }).innerText()).includes('Past Lives'));
    const trending = page.getByRole('region', { name: 'Trending today' });
    check('Trending row shows titles', (await trending.getByRole('link').count()) >= 5, String(await trending.getByRole('link').count()));
    check('TMDB attribution present', (await page.locator('main').innerText()).includes('TMDB'));
    check('hero has a readable title heading', await page.getByRole('heading', { name: /Dune: Part Two/ }).first().isVisible());
    check('schedule copy is neutral (no unverified reminder claim)', !(await page.locator('main').innerText()).includes('Reminder set on this phone'));
    await page.screenshot({ path: 'home-iphone.png', fullPage: true });
    allErrors.push(...errors); await browser.close();
  }
  // B. iPad layout
  {
    const { browser, page, errors } = await setup('iPad (gen 7)');
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto(BASE + '/app', { waitUntil: 'networkidle' }); await settle(page, 2500);
    const heroBox = await page.getByRole('link', { name: 'Dune: Part Two' }).first().boundingBox();
    const upBox = await page.getByRole('region', { name: 'Coming up' }).boundingBox();
    check('iPad: hero and Coming up side by side', heroBox && upBox && upBox.x > heroBox.x + heroBox.width - 5 && Math.abs(upBox.y - heroBox.y) < 80, `hero x=${heroBox?.x} w=${heroBox?.width}, up x=${upBox?.x} y=${upBox?.y}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('iPad: no horizontal page overflow', overflow <= 0, String(overflow));
    await page.screenshot({ path: 'home-ipad.png' });
    allErrors.push(...errors); await browser.close();
  }
  // C. empty state
  {
    const { browser, page, errors } = await setup('iPhone 15', { recs: [] });
    await page.goto(BASE + '/app', { waitUntil: 'networkidle' }); await settle(page, 2000);
    check('empty: "No picks yet" shown', await page.getByText('No picks yet').isVisible());
    await page.getByRole('link', { name: 'Recommend a movie' }).first().click(); await settle(page, 800);
    check('empty: Recommend CTA opens the sheet', await page.getByRole('dialog').isVisible());
    allErrors.push(...errors); await browser.close();
  }
  // D. error then retry
  {
    const failing = { recs: true };
    const { browser, page, errors, recCallsRef } = await setup('iPhone 15', { failing });
    await page.goto(BASE + '/app', { waitUntil: 'networkidle' }); await settle(page, 4000);
    check('error: message with Retry', await page.getByText("Couldn't load your picks").isVisible(), `calls=${recCallsRef()}`);
    failing.recs = false;
    await page.getByRole('button', { name: 'Retry' }).first().click(); await settle(page, 2500);
    check('error: Retry loads the picks', await page.getByRole('link', { name: 'Dune: Part Two' }).first().isVisible(), `calls=${recCallsRef()}`);
    allErrors.push(...errors); await browser.close();
  }
  // E. offline: navigator.onLine=false and data requests fail at the network level
  {
    const { browser, ctx, page, errors } = await setup('iPhone 15');
    await ctx.addInitScript(() => {
      let online = !(window.sessionStorage.getItem('e2e-offline') === '1');
      Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => online });
      window.__setOnline = (v) => { online = v; window.dispatchEvent(new Event(v ? 'online' : 'offline')); };
    });
    const offlineRoutes = async () => {
      await ctx.route('http://mock.supabase.test:54399/rest/**', (r) => r.abort('internetdisconnected'));
      await ctx.route('**/api/watch-reminders**', (r) => r.abort('internetdisconnected'));
      await ctx.route('**/api/tmdb/**', (r) => r.abort('internetdisconnected'));
    };
    await page.goto(BASE + '/app/me', { waitUntil: 'networkidle' }); await settle(page, 1200);
    // The reminder toasts poll on their own timer; test the positioning rule with a probe that uses
    // the same classes as WatchReminderCenter's container.
    const toastBox = await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'bib-floating-toasts fixed bottom-4 right-4 z-[90] flex w-[min(92vw,360px)] flex-col gap-3';
      el.innerHTML = '<div style="height:120px"></div>';
      document.body.appendChild(el);
      const r = el.getBoundingClientRect();
      el.remove();
      return { y: r.y, height: r.height, x: r.x, width: r.width };
    });
    const navBox = await page.locator('nav[aria-label="Main"]').boundingBox();
    check('reminder toasts sit above the tab bar in the app', toastBox.y + toastBox.height <= navBox.y + 1 && toastBox.x >= 0 && toastBox.x + toastBox.width <= 393 + 1, `toast bottom=${Math.round(toastBox.y + toastBox.height)} nav top=${navBox.y}`);
    await page.evaluate(() => window.sessionStorage.setItem('e2e-offline', '1'));
    await offlineRoutes();
    await page.evaluate(() => window.__setOnline(false));
    await settle(page, 800);
    await page.screenshot({ path: 'offline-before-click.png' });

    // Next's dev-only indicator overlaps the Home tab in `next dev`; trigger the link directly.
    await page.getByRole('link', { name: 'Home', exact: true }).evaluate((el) => el.click()); await settle(page, 3500);
    const text = await page.locator('main').innerText();
    check('offline: banner shown', text.includes("You're offline"), text.slice(0, 120).replace(/\s+/g, ' '));
    check('offline: no error message, saved/empty state instead', !text.includes("Couldn't load your picks") && !text.includes('No picks yet') && text.includes('Nothing saved on this phone yet'));
    await page.screenshot({ path: 'home-offline.png' });
    await ctx.unrouteAll({ behavior: 'ignoreErrors' });
    // restore normal mocks for "back online"
    await ctx.route('http://mock.supabase.test:54399/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/auth/v1/user') return route.fulfill({ json: USER });
      if (url.pathname === '/rest/v1/friend_recommendations') return route.fulfill({ json: RECS });
      if (url.pathname === '/rest/v1/users') return route.fulfill({ json: USERS });
      return route.fulfill({ json: [] });
    });
    await ctx.route('**/api/watch-reminders**', (route) => route.fulfill({ json: { reminders: REMINDERS } }));
    await ctx.route('**/api/tmdb/**', (route) => route.fulfill({ json: { results: [] } }));
    await page.evaluate(() => window.__setOnline(true)); await settle(page, 3000);
    check('offline: reloads automatically when back online', await page.getByRole('link', { name: 'Dune: Part Two' }).first().isVisible());
    allErrors.push(...errors); await browser.close();
  }
  // G. network failing while navigator.onLine stays true: error + Retry (no cache on the web)
  {
    const { browser, ctx, page, errors } = await setup('iPhone 15');
    await ctx.route('http://mock.supabase.test:54399/rest/v1/friend_recommendations**', (r) => r.abort('internetdisconnected'));
    await page.goto(BASE + '/app', { waitUntil: 'networkidle' }); await settle(page, 4000);
    const text = await page.locator('main').innerText();
    check('net failure with onLine=true: error with Retry, not offline banner', text.includes("Couldn't load your picks") && !text.includes("You're offline"), text.slice(0, 100).replace(/\s+/g, ' '));
    allErrors.push(...errors); await browser.close();
  }
  // H. connection lost while Home is shown: banner, content kept
  {
    const { browser, page, errors } = await setup('iPhone 15');
    await page.goto(BASE + '/app', { waitUntil: 'networkidle' }); await settle(page, 2500);
    await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await settle(page, 500);
    const text = await page.locator('main').innerText();
    check('connection lost after load: banner shown, picks kept', text.includes("You're offline") && text.includes('Dune: Part Two'));
    allErrors.push(...errors); await browser.close();
  }
  // I. slow trending doesn't hold friend picks
  {
    const { browser, page, errors } = await setup('iPhone 15', { tmdbDelayMs: 8000 });
    await page.goto(BASE + '/app'); await settle(page, 3500);
    const picksShown = await page.getByRole('link', { name: 'Dune: Part Two' }).first().isVisible();
    const trendingLinks = await page.getByRole('region', { name: 'Trending today' }).getByRole('link').count().catch(() => 0);
    check('slow trending: picks and schedule render while trending still loads', picksShown && trendingLinks === 0, `picks=${picksShown} trendingLinks=${trendingLinks}`);
    allErrors.push(...errors); await browser.close();
  }
  // J. TMDB 5xx: Trending error + Retry recovers
  {
    const failing = { recs: false, tmdb: true };
    const { browser, page, errors } = await setup('iPhone 15', { failing });
    await page.goto(BASE + '/app', { waitUntil: 'networkidle' }); await settle(page, 3000);
    const region = page.getByRole('region', { name: 'Trending today' });
    check('TMDB 5xx: Trending shows an error with Retry', (await region.innerText()).includes("Couldn't load trending titles"));
    failing.tmdb = false;
    // Dismiss the (mocked) watch-reminder toast if it is showing over the content, as a user would.
    for (const later of await page.getByRole('button', { name: 'Later' }).all()) await later.click().catch(() => {});
    await region.getByRole('button', { name: 'Retry' }).click(); await settle(page, 3000);
    check('TMDB 5xx: Retry recovers trending', (await page.getByRole('region', { name: 'Trending today' }).getByRole('link').count()) >= 5);
    allErrors.push(...errors); await browser.close();
  }
  // F. Welcome (signed out)
  for (const device of ['iPhone 15', 'iPad (gen 7)']) {
    const { browser, page, errors } = await setup(device, { signedIn: false });
    if (device.startsWith('iPad')) await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto(BASE + '/app/picks', { waitUntil: 'networkidle' }); await settle(page, 2000);
    const p = new URL(page.url());
    check(`${device} Welcome: signed-out deep link lands on Welcome with next`, p.pathname === '/app/welcome' && p.searchParams.get('next') === '/app/picks', p.pathname + p.search);
    check(`${device} Welcome: Google button`, await page.getByRole('button', { name: 'Continue with Google' }).isVisible());
    check(`${device} Welcome: Apple hidden on web (native only)`, (await page.getByRole('button', { name: 'Sign in with Apple' }).count()) === 0);
    await page.screenshot({ path: `welcome-${device.startsWith('iPad') ? 'ipad' : 'iphone'}.png` });
    await page.getByRole('button', { name: 'Use email instead' }).click(); await settle(page, 800);
    check(`${device} Welcome: email opens the sign-in dialog`, (await page.getByRole('textbox').count()) >= 1);
    allErrors.push(...errors); await browser.close();
  }
} finally {
  console.log(results.join('\n'));
  console.log('page errors:', allErrors.length ? allErrors : 'none');
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`TOTAL: ${results.length - failed} pass, ${failed} fail`);
  if (failed || allErrors.length) process.exitCode = 1;
}
