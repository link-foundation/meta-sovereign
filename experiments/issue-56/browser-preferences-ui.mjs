// Isolated UI fixture: no accounts, real profiles, provider calls or sync.
// Run: xvfb-run -a node experiments/issue-56/browser-preferences-ui.mjs
// The Playwright MCP attaches to the printed CDP endpoint for verification.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launchBrowser } from 'browser-commander';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/index.js';

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-issue56-ui-'));
let browser;
const server = await startServer({
  store: createMemoryStore(),
  storeDir: dir,
  port: 0,
  localUi: true,
  enableHandlers: false,
  enableSync: false,
  telegramAccount: false,
  automations: { scheduler: false },
});
const stop = async () => {
  await browser?.close();
  await server.close();
  await rm(dir, { recursive: true, force: true });
};
try {
  browser = await launchBrowser({
    engine: 'playwright',
    headless: false,
    userDataDir: path.join(dir, 'browser'),
    args: ['--no-sandbox', '--disable-background-networking'],
  });
  const origin = `http://127.0.0.1:${server.port}`;
  await browser.page.route('**/*', (route) =>
    route.request().url().startsWith(`${origin}/`)
      ? route.continue()
      : route.abort()
  );
  console.log(JSON.stringify({ origin, cdpEndpoint: browser.cdpEndpoint }));
  await browser.page.goto(`${origin}/#settings`);
  await new Promise((resolve) => {
    process.once('SIGTERM', resolve);
    process.once('SIGINT', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  await stop();
  process.stdin.pause();
}
