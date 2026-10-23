// The frame the chat screen's browser e2e tests share: skipped unless
// RUN_BROWSER_E2E is set (and Playwright is there), a server on a free
// port over the test's memory store with Telegram's sends faked, a
// headless page on it with Telegram connected, and the run ended as a
// pass or a fail with a screenshot. Nothing reaches a network or a
// running app.

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../src/server/index.js';

export const assert = (cond, msg) => {
  if (!cond) {
    throw new Error(`assertion failed: ${msg}`);
  }
};

/** A route answered with JSON. */
export const fulfil = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

// The browser asked for, or the test skipped as a pass.
export const browserOf = async (name) => {
  const skip = (msg) => {
    console.log(`[e2e-${name}] SKIP: ${msg}`);
    process.exit(0);
  };
  if (!process.env.RUN_BROWSER_E2E) {
    skip('RUN_BROWSER_E2E not set');
  }
  const engine = process.env.E2E_BROWSER || 'chromium';
  try {
    return { engine, browserType: (await import('playwright'))[engine] };
  } catch {
    return skip('playwright not installed');
  }
};

/**
 * The app on `store` in a headless page: `{ engine, base, page, errors,
 * until, finish }`. `send` takes the drafts the composer sends;
 * `finish(steps)` runs the test's steps and exits.
 */
export const openChatApp = async (
  name,
  { store, send = async () => ({ via: 'fake' }), telegramAccount = false }
) => {
  const { engine, browserType } = await browserOf(name);
  const dir = await mkdtemp(path.join(os.tmpdir(), `ms-e2e-${name}-`));
  const handle = await startServer({
    port: 0,
    storeDir: dir,
    store,
    enableSync: false,
    enableHandlers: false,
    telegramAccount,
    log: null,
    automations: {
      scheduler: false,
      setTyping: async () => ({ supported: false }),
      send,
    },
  });
  const base = `http://127.0.0.1:${handle.port}`;
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 800 },
  });
  const errors = [];
  // WebKit reports a request the page dropped mid-flight (one that a
  // test's end or a reload cut short, its rejection handled) as this
  // error; the app is same-origin, so it is never a real access check.
  const ABORTED =
    /^(Error: )?Fetch API cannot load .+ due to access control checks\.?$/;
  page.on('pageerror', (e) => {
    if (!ABORTED.test(String(e))) {
      errors.push(String(e));
    }
  });
  // The browser's own dialogs must never be used.
  page.on('dialog', (d) => {
    errors.push(`browser dialog: ${d.message()}`);
    d.dismiss();
  });
  await page.route('**/api/telegram/status', (route) =>
    fulfil(route, {
      connected: true,
      kind: 'user',
      account: { username: 'owner' },
      offline: false,
      needsLogin: false,
    })
  );
  const until = async (check, what, ms = 10_000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await check()) {
        return;
      }
      await page.waitForTimeout(50);
    }
    throw new Error(`timed out: ${what}`);
  };
  const finish = async (steps) => {
    let failed = false;
    try {
      await steps();
      assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
      console.log(`[e2e-${name}] OK (${engine})`);
    } catch (error) {
      failed = true;
      console.error(`[e2e-${name}] FAIL (${engine}): ${error.message}`);
      await page
        .screenshot({
          path: path.join(os.tmpdir(), `ms-e2e-${name}-${engine}.png`),
        })
        .catch(() => {});
    } finally {
      await browser.close();
      await handle.close();
      await rm(dir, { recursive: true, force: true });
    }
    process.exit(failed ? 1 : 0);
  };
  return { engine, base, page, errors, until, finish };
};
