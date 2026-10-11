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
 *   node experiments/issue-37/hosted-web-local-server.mjs \
 *     [--allow-page] [--server=<path to js/src/server/index.js>]
 *
 * `--allow-page` puts the probe page's origin on the server's CORS
 * allow-list (what `https://link-foundation.github.io` gets by
 * default after the fix). `--server` loads another checkout's server
 * (e.g. a `main` worktree), so the same script shows the before/after
 * behaviour.
 */

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { pathToFileURL } from 'node:url';

import { chromium, firefox, webkit } from 'playwright';

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

const option = (name) =>
  process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3);

const listen = (server) =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const main = async () => {
  const serverModule = path.resolve(
    option('server') ??
      new URL('../../js/src/server/index.js', import.meta.url).pathname
  );
  const { startServer } = await import(pathToFileURL(serverModule).href);
  // The page host answers on `localhost`, the API on `127.0.0.1`, so
  // the two origins differ the way GitHub Pages and loopback do.
  const target = {};
  const host = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE(target.origin));
  });
  await listen(host);
  const pageUrl = `http://localhost:${host.address().port}/`;
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-cors-'));
  const server = await startServer({
    port: 0,
    storeDir,
    enableHandlers: false,
    enableSync: false,
    ...(process.argv.includes('--allow-page')
      ? { allowOrigins: [new URL(pageUrl).origin] }
      : {}),
  });
  const serverOrigin = `http://127.0.0.1:${server.port}`;
  target.origin = serverOrigin;
  console.log(`server module ${path.relative(process.cwd(), serverModule)}`);
  console.log(`server ${serverOrigin}, page ${pageUrl}`);
  const report = {};
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    let browser;
    try {
      // The full Chromium build also works when only it is installed
      // (no headless shell).
      browser = await engine.launch(
        name === 'chromium' ? { channel: 'chromium' } : {}
      );
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
