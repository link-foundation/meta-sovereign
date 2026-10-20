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
// the page must find the server by its picture and open the server's
// own copy (browser-commander drives Chrome and the installed Safari
// only, so this run uses Playwright's WebKit; E2E_SAFARI=0 skips it).
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
const look = async (page, url, { serverOrigin, problems }) => {
  await page.goto(url);
  for (let i = 0; i < 60; i += 1) {
    // The page may move to the server's own copy meanwhile (Safari).
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

// Only this test's own server on this machine, never another one;
// `tried` collects the servers the page looked at.
const fence = async (page, { serverOrigin, siteOrigin, tried }) =>
  page.route?.(/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/, (r) => {
    const url = r.request().url();
    if (/\/api\/(status|beacon\.svg)/.test(url)) {
      tried.add(new URL(url).origin);
    }
    return url.startsWith(serverOrigin) || url.startsWith(siteOrigin)
      ? r.continue()
      : r.abort();
  });

// The hosted copy in WebKit: it ends up on the server, online.
const safariRun = async ({ site, siteOrigin, serverOrigin }) => {
  if (process.env.E2E_SAFARI === '0') {
    return [];
  }
  const { webkit } = await import('playwright');
  const browser = await webkit.launch({ headless: true });
  const failures = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const tried = new Set();
    await fence(page, { serverOrigin, siteOrigin, tried });
    // WebKit reports the status checks Safari blocks as page errors;
    // those are expected, the way it then finds the server is tested.
    page.on('pageerror', (error) => {
      if (!/\/api\/status\b/.test(error.message)) {
        failures.push(`webkit: ${error.message}`);
      }
    });
    const seen = await look(page, site.url, { serverOrigin, problems: [] });
    await shoot(page, 'safari.png');
    const landed = page.url();
    say(
      `webkit tried ${[...tried].join(' → ')}; landed on ${landed}; online=${seen.online} bubbles=${seen.bubbles}`
    );
    if (!seen.online || seen.bubbles < 3) {
      failures.push(`webkit: the hosted copy did not reach the server`);
    }
    // From an https page only the server's own copy can work.
    if (siteOrigin.startsWith('https:') && !landed.startsWith(serverOrigin)) {
      failures.push(`webkit: stayed on ${landed}`);
    }
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
  const handle = await startServer({
    port: await portToUse(),
    storeDir,
    telegramAccount: false,
    enableSync: false,
    allowOrigins: [siteOrigin],
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
    const hosted = await look(page, site.url, { serverOrigin, problems });
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
    failures.push(...(await safariRun({ site, siteOrigin, serverOrigin })));
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
  say('PASS: the hosted copy works like the local one');
};

await main();
