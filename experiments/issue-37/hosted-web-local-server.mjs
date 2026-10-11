/**
 * Can the hosted web app talk to a locally installed server? (issue #37)
 *
 * The issue asks for a full web app "with restricted features, unless
 * local server is started (which should be installable via npm)". The
 * hosted SPA lives on GitHub Pages (an https:// origin) while
 * `npx meta-sovereign serve` listens on http://127.0.0.1:8787, so every
 * discovery probe is a cross-origin request. This script reproduces
 * that setup with real browsers:
 *
 *   1. start the real server (`startServer`) on a free port;
 *   2. serve a tiny static page on a *different* origin that runs the
 *      same fetch `discoverServer()` runs (`GET /api/status`) and a
 *      JSON `PUT /links` the way `client.js` writes;
 *   3. report, per browser engine, whether each request succeeded.
 *
 * Usage:
 *
 *   node experiments/issue-37/hosted-web-local-server.mjs [pagesOrigin]
 *
 * When `pagesOrigin` is given, the server is started with that origin
 * in its allow-list (after the CORS fix), so the same script shows the
 * before/after behaviour.
 */

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { chromium, firefox, webkit } from 'playwright';

import { startServer } from '../../js/src/server/index.js';

const PAGE = (serverOrigin) => `<!doctype html>
<meta charset="utf-8">
<title>hosted probe</title>
<script>
window.results = (async () => {
  const out = {};
  try {
    const r = await fetch('${serverOrigin}/api/status');
    out.status = r.ok ? 'ok' : 'http ' + r.status;
  } catch (e) {
    out.status = 'error: ' + e.message;
  }
  try {
    const r = await fetch('${serverOrigin}/links', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'probe', tokens: ['cors'] }),
    });
    out.put = r.ok ? 'ok' : 'http ' + r.status;
  } catch (e) {
    out.put = 'error: ' + e.message;
  }
  return out;
})();
</script>`;

const startPageHost = (serverOrigin) =>
  new Promise((resolve) => {
    const host = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PAGE(serverOrigin));
    });
    // `localhost` vs `127.0.0.1` keeps the two origins distinct.
    host.listen(0, '127.0.0.1', () => resolve(host));
  });

const main = async () => {
  const allowOrigins = process.argv.slice(2);
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-cors-'));
  const server = await startServer({
    port: 0,
    storeDir,
    enableHandlers: false,
    enableSync: false,
    ...(allowOrigins.length ? { allowOrigins } : {}),
  });
  const serverOrigin = `http://127.0.0.1:${server.port}`;
  const host = await startPageHost(serverOrigin);
  const pageUrl = `http://localhost:${host.address().port}/`;
  console.log(`server ${serverOrigin}, page ${pageUrl}`);
  const report = {};
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    let browser;
    try {
      browser = await engine.launch();
    } catch (err) {
      report[name] = `launch failed: ${err.message.split('\n')[0]}`;
      continue;
    }
    const page = await browser.newPage();
    await page.goto(pageUrl);
    report[name] = await page.evaluate(() => window.results);
    await browser.close();
  }
  console.log(JSON.stringify(report, null, 2));
  host.close();
  await server.close();
  await fs.rm(storeDir, { recursive: true, force: true });
};

await main();
