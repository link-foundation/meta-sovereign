// The hosted app against a local server (R-O14, R-Y58): the static
// bundle, opened from another origin, must find the server and work
// exactly like the copy the server serves itself.
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:pages
//       builds dist/pages and serves it from its own origin, as GitHub
//       Pages would (http://127.0.0.1:<port>/meta-sovereign/);
//   RUN_BROWSER_E2E=1 PAGES_URL=https://<owner>.github.io/<repo>/ …
//       uses the deployed site — the Pages workflow runs this after
//       every deploy.
//
// The server is this script's own, with a made-up chat, on the first
// free port of those the app looks at by itself (8787 first; CI sets
// E2E_PORT=8787 to require it). The page is opened at its plain address
// and must find the server on its own. Every other address on this
// machine is refused, so a server already running here is never
// touched: its port only looks empty to the page.
//
// Then the hosted copy once more in WebKit, Safari's engine: Safari
// keeps an https page from asking http://127.0.0.1 anything, so there
// the page must find the server by its picture, stay where it is and
// link the server's own copy, which must then work (browser-commander
// drives Chrome and the installed Safari only, so this run uses
// Playwright's WebKit; E2E_SAFARI=0 skips it).
//
// E2E_SHOTS=<dir> keeps a screenshot of each copy.
//
// Both copies are compared: online, the same screens in the menu, the
// same chats and messages from the server, no failed requests and no
// page errors. Without RUN_BROWSER_E2E the script skips (exit 0).

import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import net from 'node:net';

import { startServer } from '../src/server/index.js';
import { DEFAULT_PORTS } from '../src/web/discover.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const say = (msg) => console.log(`[e2e-pages] ${msg}`);

if (!process.env.RUN_BROWSER_E2E) {
  say('SKIP: RUN_BROWSER_E2E not set');
  process.exit(0);
}

let bc;
try {
  bc = await import('browser-commander');
} catch (error) {
  say(`SKIP: browser-commander not installed (${error.message})`);
  process.exit(0);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

// GitHub Pages in miniature: files under /meta-sovereign/, 404.html
// for the rest.
const servePages = async (dir) => {
  const prefix = '/meta-sovereign/';
  const server = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p.startsWith(prefix) ? p.slice(prefix.length) : null;
    const file = rel === '' ? 'index.html' : rel;
    const full = file ? path.join(dir, file) : null;
    const body =
      full && full.startsWith(dir + path.sep)
        ? await fs.readFile(full).catch(() => null)
        : null;
    res.writeHead(body ? 200 : 404, {
      'content-type': body
        ? (MIME[path.extname(full)] ?? 'application/octet-stream')
        : MIME['.html'],
    });
    res.end(body ?? (await fs.readFile(path.join(dir, '404.html'))));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}${prefix}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const pagesSite = async () => {
  if (process.env.PAGES_URL) {
    return { url: process.env.PAGES_URL, close: async () => {} };
  }
  const built = spawnSync(process.execPath, ['js/scripts/build-pages.mjs'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (built.status !== 0) {
    throw new Error('build-pages failed');
  }
  return servePages(path.join(repoRoot, 'dist/pages'));
};

const CHAT = '777';
const seed = async (store) => {
  const at = Date.UTC(2026, 0, 1, 9);
  const said = [
    ['me', 'Hello! How are you?'],
    [CHAT, 'Fine, thanks. And you?'],
    ['me', 'All good.'],
  ];
  for (const [n, [sender, body]] of said.entries()) {
    await store.put({
      id: `msg:telegram:${CHAT}:${n + 1}`,
      tokens: ['message', 'telegram', `${CHAT}:${n + 1}`],
      source: 'telegram',
      chat: CHAT,
      chatType: 'personal_chat',
      chatName: 'Pat Example',
      sender,
      senderName: sender === 'me' ? null : 'Pat Example',
      body,
      timestamp: new Date(at + n * 60_000).toISOString(),
    });
  }
};

// What a copy of the app shows, read from the page.
const look = async (page, url, { serverOrigin, problems, navigate = true }) => {
  if (navigate) {
    await page.goto(url);
  }
  for (let i = 0; i < 60; i += 1) {
    const online = await page
      .evaluate(() => Boolean(document.querySelector('.mode-badge.online')))
      .catch(() => false);
    if (online) {
      break;
    }
    await sleep(250);
  }
  await page.evaluate(() =>
    [...document.querySelectorAll('a, button')]
      .find((n) => /Turn off tutorial/.test(n.textContent))
      ?.click()
  );
  await page.evaluate(() => {
    globalThis.location.hash = '#/chat';
  });
  await sleep(1500);
  await page.evaluate(() =>
    [...document.querySelectorAll('.chat-item')]
      .find((n) => /Pat Example/.test(n.textContent))
      ?.click()
  );
  await sleep(1500);
  const seen = await page.evaluate(() => ({
    online: Boolean(document.querySelector('.mode-badge.online')),
    notice: Boolean(document.querySelector('.web-mode-download')),
    menu: [...document.querySelectorAll('nav button, nav a')]
      .map((n) => n.textContent.trim())
      .filter(Boolean),
    chats: document.querySelectorAll('.chat-item').length,
    bubbles: document.querySelectorAll('.bubble-row').length,
  }));
  return { url, serverOrigin, ...seen, problems: [...problems] };
};

// What is wrong with the two copies, if anything.
const verdicts = (hosted, local) => {
  const failures = [];
  for (const copy of [hosted, local]) {
    say(
      `${copy.url}: online=${copy.online} menu=${copy.menu.length} chats=${copy.chats} bubbles=${copy.bubbles} problems=${copy.problems.length}`
    );
    if (!copy.online) {
      failures.push(`${copy.url} did not find the server`);
    }
    if (copy.notice) {
      failures.push(`${copy.url} shows the browser-only notice`);
    }
    if (copy.bubbles < 3) {
      failures.push(`${copy.url} shows ${copy.bubbles} of 3 messages`);
    }
    failures.push(...copy.problems.map((p) => `${copy.url}: ${p}`));
  }
  if (JSON.stringify(hosted.menu) !== JSON.stringify(local.menu)) {
    failures.push(
      `menus differ: ${hosted.menu.join(',')} | ${local.menu.join(',')}`
    );
  }
  if (hosted.bubbles !== local.bubbles || hosted.chats !== local.chats) {
    failures.push('the two copies show different chats or messages');
  }
  return failures;
};

// Only this test's own server on this machine (over http or https),
// never another one; `tried` collects the servers the page looked at.
const fence = async (page, { serverOrigin, siteOrigin, tried }) => {
  const own = [serverOrigin, serverOrigin.replace(/^http:/, 'https:')];
  return page.route?.(/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/, (r) => {
    const url = r.request().url();
    if (/\/api\/(status|beacon\.svg)/.test(url)) {
      tried.add(new URL(url).origin);
    }
    return own.some((o) => url.startsWith(o)) || url.startsWith(siteOrigin)
      ? r.continue()
      : r.abort();
  });
};

// A failed first discovery on the hosted origin must heal without Check again.
const recoverHosted = async (
  page,
  siteUrl,
  serverOrigin,
  { wake = false, tried } = {}
) => {
  let available = false;
  let wrongPasscode = 0;
  const siteOrigin = new URL(siteUrl).origin;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === siteOrigin && url.pathname === '/api/passcode/status') {
      wrongPasscode += 1;
    }
  });
  for (const origin of [
    serverOrigin,
    serverOrigin.replace(/^http:/, 'https:'),
  ]) {
    await page.route(`${origin}/api/status`, (route) => {
      tried?.add(new URL(route.request().url()).origin);
      return available ? route.continue() : route.abort();
    });
  }
  await page.goto(siteUrl);
  const waitFor = async (online) => {
    for (let i = 0; i < 120; i += 1) {
      const ready = await page
        .evaluate(
          (connected) =>
            Boolean(
              document.querySelector(
                connected ? '.mode-badge.online' : '.web-mode-banner'
              )
            ),
          online
        )
        .catch(() => false);
      if (ready) {
        return;
      }
      await sleep(250);
    }
    throw new Error(
      `hosted app did not become ${online ? 'online' : 'offline'}`
    );
  };
  await waitFor(false);
  available = true;
  if (wake) {
    await page.evaluate(() =>
      globalThis.dispatchEvent(new globalThis.Event('focus'))
    );
  }
  await waitFor(true);
  if (wrongPasscode) {
    throw new Error('offline passcode request hit the static website');
  }
  say(`hosted startup recovered via ${wake ? 'tab focus' : 'automatic retry'}`);
};

// A local build is served over http, where Safari's limits do not
// apply; WebKit also opens it from this https address, as Pages serves
// it, the files coming from the local build.
const MIRROR_ORIGIN = 'https://pages.meta-sovereign.test';
const mirror = (page, siteOrigin) =>
  page.route(`${MIRROR_ORIGIN}/**`, async (r) => {
    const { pathname, search } = new URL(r.request().url());
    const answer = await fetch(`${siteOrigin}${pathname}${search}`);
    await r.fulfill({
      status: answer.status,
      headers: { 'content-type': answer.headers.get('content-type') ?? '' },
      body: Buffer.from(await answer.arrayBuffer()),
    });
  });

const waitForLink = async (page, selector) => {
  for (let i = 0; i < 60; i += 1) {
    const href = await page
      .evaluate((s) => document.querySelector(s)?.href ?? null, selector)
      .catch(() => null);
    if (href) {
      return href;
    }
    await sleep(250);
  }
  return null;
};

// A WebKit page fenced to this test's servers. `trusted`: as if the
// person had trusted the server's certificate (`meta-sovereign trust`).
const webkitPage = async (browser, { trusted, siteOrigin, ...where }) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: trusted,
  });
  const page = await context.newPage();
  const tried = new Set();
  await fence(page, { ...where, siteOrigin, tried });
  if (siteOrigin === MIRROR_ORIGIN) {
    await mirror(page, where.realOrigin);
  }
  const errors = [];
  // WebKit reports the status checks Safari blocks as page errors;
  // those are expected, the way it then finds the server is tested.
  page.on('pageerror', (error) => {
    if (!/\/api\/status\b/.test(error.message)) {
      errors.push(`webkit: ${error.message}`);
    }
  });
  return { page, tried, errors };
};

// Before the trust: the page stays where it is, names the server, links
// its trust page; a local UI link appears only when explicitly enabled.
const untrustedSafari = async (
  browser,
  { siteUrl, siteOrigin, localUi, ...where }
) => {
  const { page, tried, errors } = await webkitPage(browser, {
    trusted: false,
    siteOrigin,
    ...where,
  });
  const failures = errors;
  const { serverOrigin } = where;
  await look(page, siteUrl, { serverOrigin, problems: [] });
  const link = localUi ? await waitForLink(page, 'a.web-mode-local') : null;
  const trust = await waitForLink(page, 'a.web-mode-trust');
  const named = await page.evaluate(
    (origin) =>
      document
        .querySelector('.web-mode-banner')
        ?.textContent.includes(`A server runs at ${origin}`) ?? false,
    serverOrigin
  );
  await shoot(page, 'safari.png');
  const stayed = page.url();
  say(
    `webkit tried ${[...tried].join(' → ')}; stayed on ${stayed}; link ${link}; trust ${trust}; named=${named}`
  );
  if (!stayed.startsWith(siteOrigin)) {
    failures.push(`webkit: the hosted page went to ${stayed} by itself`);
  }
  if (trust !== `${serverOrigin.replace(/^http:/, 'https:')}/trust`) {
    failures.push('webkit: the notice does not link the trust page');
  }
  if (!localUi) {
    if (!named || (await page.locator('a.web-mode-local').count()) !== 0) {
      failures.push(
        'webkit: the default API-only server should be named without a local UI link'
      );
    }
    await page.context().close();
    return failures;
  }
  if (link !== `${serverOrigin}/` || !named) {
    failures.push('webkit: the notice does not name and link the server');
    return failures;
  }
  const local = await look(page, link, { serverOrigin, problems: [] });
  await shoot(page, 'safari-local.png');
  say(`webkit via the link: online=${local.online} bubbles=${local.bubbles}`);
  if (!local.online || local.bubbles < 3) {
    failures.push("webkit: the server's own copy did not work");
  }
  await page.context().close();
  return failures;
};

// After the trust: the hosted page itself reaches the server over https.
const trustedSafari = async (browser, { siteUrl, ...where }) => {
  const { page, tried, errors } = await webkitPage(browser, {
    trusted: true,
    ...where,
  });
  const failures = errors;
  await recoverHosted(page, siteUrl, where.serverOrigin, { wake: true, tried });
  const seen = await look(page, siteUrl, {
    serverOrigin: where.serverOrigin,
    problems: [],
    navigate: false,
  });
  await shoot(page, 'safari-trusted.png');
  say(
    `webkit trusting the server tried ${[...tried].join(' → ')}: online=${seen.online} bubbles=${seen.bubbles}`
  );
  if (!seen.online || seen.bubbles < 3) {
    failures.push('webkit: trusting the server, the hosted page is not online');
  }
  await page.context().close();
  return failures;
};

// The hosted copy in WebKit (R-Y60, R-Y64). An http site is also opened
// from an https address, where Safari's limits apply.
const safariRun = async ({ site, siteOrigin, serverOrigin, localUi }) => {
  if (process.env.E2E_SAFARI === '0') {
    return [];
  }
  const { webkit } = await import('playwright');
  const browser = await webkit.launch({ headless: true });
  const failures = [];
  try {
    if (!siteOrigin.startsWith('https:')) {
      const { page, errors } = await webkitPage(browser, {
        trusted: false,
        siteOrigin,
        serverOrigin,
      });
      const seen = await look(page, site.url, { serverOrigin, problems: [] });
      say(`webkit over http: online=${seen.online} bubbles=${seen.bubbles}`);
      failures.push(...errors);
      if (!seen.online || seen.bubbles < 3) {
        failures.push('webkit: the hosted copy did not reach the server');
      }
      await page.context().close();
    }
    const secure = siteOrigin.startsWith('https:')
      ? { siteUrl: site.url, siteOrigin }
      : {
          siteUrl: `${MIRROR_ORIGIN}${new URL(site.url).pathname}`,
          siteOrigin: MIRROR_ORIGIN,
        };
    const where = { ...secure, serverOrigin, realOrigin: siteOrigin, localUi };
    failures.push(...(await untrustedSafari(browser, where)));
    failures.push(...(await trustedSafari(browser, where)));
  } finally {
    await browser.close();
  }
  return failures;
};

// Whether nothing listens on this loopback port.
const isFree = (port) =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });

// The port the app finds by itself: E2E_PORT, or the first free one.
const portToUse = async () => {
  const wanted = process.env.E2E_PORT
    ? [Number(process.env.E2E_PORT)]
    : DEFAULT_PORTS;
  for (const port of wanted) {
    if (!DEFAULT_PORTS.includes(port)) {
      throw new Error(`port ${port} is not one the app looks at`);
    }
    if (await isFree(port)) {
      return port;
    }
  }
  throw new Error(`none of ${wanted.join(', ')} is free`);
};

const shoot = async (page, name) => {
  if (process.env.E2E_SHOTS) {
    await fs.mkdir(process.env.E2E_SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(process.env.E2E_SHOTS, name) });
  }
};

const main = async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-e2e-pages-'));
  const site = await pagesSite();
  const siteOrigin = new URL(site.url).origin;
  const serverOptions = {
    port: await portToUse(),
    storeDir,
    telegramAccount: false,
    enableSync: false,
    allowOrigins: [siteOrigin, MIRROR_ORIGIN],
    // https beside http, as `serve` runs it, for Safari (R-Y64).
    tls: true,
  };
  // The legacy local-UI comparison explicitly opts out of TLS. The
  // default backend below enables TLS and is tested in Safari over HTTPS.
  let handle = await startServer({
    ...serverOptions,
    localUi: true,
    tls: false,
  });
  const serverOrigin = `http://127.0.0.1:${handle.port}`;
  await seed(handle.store);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-e2e-profile-'));
  const session = await bc.launchBrowser({
    engine: 'playwright',
    headless: true,
    userDataDir: profile,
    ...(process.env.E2E_LAUNCH ? { launch: process.env.E2E_LAUNCH } : {}),
  });
  const { page } = session;
  const problems = [];
  const failures = [];
  try {
    // The page may talk to this machine's network (Chrome asks the
    // person; here the test answers yes).
    await session.browser
      ?.grantPermissions?.(['local-network-access'], { origin: siteOrigin })
      .catch(() => {});
    await page.setViewportSize?.({ width: 1280, height: 900 });
    const tried = new Set();
    await fence(page, { serverOrigin, siteOrigin, tried });
    page.on?.('pageerror', (error) => problems.push(`error: ${error.message}`));
    page.on?.('response', (response) => {
      const url = response.url();
      // The hosted copy asks its own origin for /api/status first.
      const expected =
        url === `${siteOrigin}/api/status` || url.includes('/api/telegram/');
      if (response.status() >= 400 && !expected) {
        problems.push(`${response.status()} ${url}`);
      }
    });
    await recoverHosted(page, site.url, serverOrigin, { tried });
    const hosted = await look(page, site.url, {
      serverOrigin,
      problems,
      navigate: false,
    });
    await shoot(page, 'hosted.png');
    say(`the hosted copy tried ${[...tried].join(' → ')}`);
    if (!tried.has(serverOrigin)) {
      failures.push(`the hosted copy never looked at ${serverOrigin}`);
    }
    problems.length = 0;
    const local = await look(page, `${serverOrigin}/`, {
      serverOrigin,
      problems,
    });
    await shoot(page, 'local.png');
    failures.push(...verdicts(hosted, local));
    // The default backend serves no web UI; the hosted app still works.
    const port = handle.port;
    await handle.close();
    handle = await startServer({ ...serverOptions, port });
    const redirect = await fetch(`${serverOrigin}/`, { redirect: 'manual' });
    if (
      handle.localUi ||
      redirect.status !== 302 ||
      (
        await fetch(`${serverOrigin}/app.min.js`, {
          headers: { origin: siteOrigin },
        })
      ).status !== 404
    ) {
      failures.push(
        'default server should redirect to GitHub Pages and serve no UI assets'
      );
    }
    const apiOnly = await look(page, site.url, { serverOrigin, problems: [] });
    failures.push(...verdicts(hosted, apiOnly));
    failures.push(
      ...(await safariRun({ site, siteOrigin, serverOrigin, localUi: false }))
    );
  } finally {
    await session.close?.().catch(() => {});
    await handle.close();
    await site.close();
    await fs.rm(storeDir, { recursive: true, force: true });
    await fs.rm(profile, { recursive: true, force: true });
  }
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`[e2e-pages] FAIL: ${failure}`);
    }
    process.exit(1);
  }
  say(
    'PASS: GitHub Pages works with the default API-only server and the optional local UI'
  );
};

await main();
