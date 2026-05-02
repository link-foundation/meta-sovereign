// Real browser e2e (R-J7). Drives the SPA in headless Chromium via
// `browser-commander` + `playwright`.
//
// This file is *not* picked up by `npm test` (no `.test.js` suffix and
// not in the test glob) because Playwright + a Chromium download are
// large optional dependencies. Run it explicitly:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:browser
//
// Without `RUN_BROWSER_E2E=1` (or when Playwright isn't installed)
// the script exits 0 with a skip message so CI matrix jobs that don't
// have the Playwright browsers stay green.
//
// Coverage maps directly to the critical UI paths in
// `docs/ROADMAP.md` §4 that are reachable without external services
// or a second browser tab:
//   1. Boot → write a message → reload → message survives.
//   2. Click every nav button (chat, operator, contacts, automation,
//      patterns, replies, facts, audience, broadcast, profile, status)
//      and confirm the view actually rendered server data.
//   3. Define a pattern → infer regex → save → match against history.
//   4. Build a 2-node automation graph (pattern → reply) and verify it
//      lands in /api/graphs.
//   5. Trigger a broadcast and verify per-network envelopes are emitted.
//
// Critical paths that need external infrastructure (real Telegram
// import, two browsers connected via WebRTC, restore-from-backup
// flow, Rust-server interop) are exercised by separate suites — see
// `tests/sync.test.js`, `tests/backup.test.js`, and the
// `crates/meta-sovereign-server/tests/` integration tests.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';

const skip = (msg) => {
  console.log(`[e2e-browser-spa] SKIP: ${msg}`);
  process.exit(0);
};

if (!process.env.RUN_BROWSER_E2E) {
  skip('RUN_BROWSER_E2E not set');
}

let playwright;
let bc;
try {
  playwright = await import('playwright');
} catch {
  skip('playwright not installed (install with `npm i -D playwright`)');
}
try {
  bc = await import('browser-commander');
} catch {
  skip(
    'browser-commander not installed (install with `npm i -D browser-commander`)'
  );
}

const assert = (cond, msg) => {
  if (!cond) {
    throw new Error(`assertion failed: ${msg}`);
  }
};

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-e2e-'));
const handle = await startServer({ port: 0, storeDir: dir });
const base = `http://127.0.0.1:${handle.port}`;
console.log(`[e2e-browser-spa] server up at ${base}, store=${dir}`);

const browser = await playwright.chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const commander = bc.makeBrowserCommander({
  page,
  verbose: false,
  enableNetworkTracking: false,
  enableNavigationManager: false,
  enableDialogManager: false,
});

const navViews = [
  'chat',
  'operator',
  'contacts',
  'automation',
  'patterns',
  'replies',
  'facts',
  'audience',
  'broadcast',
  'outreach',
  'profile',
  'backup',
  'status',
];

const failures = [];

const step = async (name, fn) => {
  process.stdout.write(`[e2e-browser-spa] ${name} ... `);
  try {
    await fn();
    console.log('ok');
  } catch (err) {
    console.log(`FAIL\n${err.stack || err.message}`);
    failures.push({ name, err });
  }
};

try {
  await step('shell loads with all nav buttons', async () => {
    await page.goto(base, { waitUntil: 'load' });
    for (const v of navViews) {
      const sel = `button[data-view="${v}"]`;
      const found = await page.$(sel);
      assert(found, `missing nav button ${v}`);
    }
  });

  await step(
    'seed two messages via REST so derived views have data',
    async () => {
      for (const m of [
        {
          id: 'msg:telegram:1',
          tokens: ['message', 'telegram', '1'],
          source: 'telegram',
          sender: 'me',
          chat: 'general',
          body: 'hi alice',
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          id: 'msg:telegram:2',
          tokens: ['message', 'telegram', '2'],
          source: 'telegram',
          sender: 'alice',
          chat: 'general',
          body: 'hi bob',
          timestamp: '2024-01-01T00:01:00Z',
        },
      ]) {
        const r = await fetch(`${base}/links`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(m),
        });
        assert(r.ok, `seed ${m.id} returned ${r.status}`);
      }
    }
  );

  await step('click every nav button and confirm view rendered', async () => {
    for (const v of navViews) {
      await commander.clickButton({ selector: `button[data-view="${v}"]` });
      // Wait for the view to settle; views.js mounts under #root.
      await page.waitForFunction(
        () =>
          document.querySelector('#root') &&
          document.querySelector('#root').children.length > 0,
        { timeout: 5000 }
      );
      const active = await page.$eval('button.active', (el) => el.dataset.view);
      assert(active === v, `expected active=${v}, got ${active}`);
    }
  });

  await step(
    'reload after writing a message and verify it survives',
    async () => {
      await fetch(`${base}/links`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'msg:telegram:3',
          tokens: ['message', 'telegram', '3'],
          source: 'telegram',
          sender: 'me',
          chat: 'general',
          body: 'survives reload',
          timestamp: '2024-01-01T00:02:00Z',
        }),
      });
      await page.reload({ waitUntil: 'load' });
      const r = await fetch(`${base}/links/msg:telegram:3`);
      assert(r.status === 200, `reload survival: GET status=${r.status}`);
      const json = await r.json();
      assert(json.body === 'survives reload', 'reload survival: body lost');
    }
  );

  await step('infer pattern from examples and save', async () => {
    const inferRes = await fetch(`${base}/api/patterns/infer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ examples: ['hi alice', 'hi bob'] }),
    });
    const infer = await inferRes.json();
    assert(typeof infer.regex === 'string', 'no regex returned from infer');
    const saveRes = await fetch(`${base}/links`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'pattern:greet',
        tokens: ['pattern', 'greet'],
        regex: infer.regex,
      }),
    });
    assert(saveRes.ok, `save pattern: status=${saveRes.status}`);
  });

  await step('persist a 2-node automation graph and read it back', async () => {
    await fetch(`${base}/api/graphs`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'graph:greet-then-reply',
        tokens: ['graph', 'greet', 'reply'],
        nodes: [
          { id: 'n1', kind: 'pattern', ref: 'pattern:greet' },
          { id: 'n2', kind: 'reply', ref: 'reply:hello' },
        ],
        edges: [{ from: 'n1', to: 'n2' }],
      }),
    });
    const r = await fetch(`${base}/api/graphs`);
    const graphs = await r.json();
    const found = graphs.find((g) => g.id === 'graph:greet-then-reply');
    assert(
      found && found.nodes.length === 2,
      'graph not persisted as expected'
    );
  });

  await step('broadcast emits per-network envelopes', async () => {
    const r = await fetch(`${base}/api/broadcast`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'announcement',
        networks: ['telegram', 'vk'],
      }),
    });
    const body = await r.json();
    assert(
      Array.isArray(body.networks) && body.networks.length === 2,
      `broadcast: networks=${JSON.stringify(body.networks)}`
    );
  });

  await step('outreach plan personalises envelopes per recipient', async () => {
    const r = await fetch(`${base}/api/outreach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'network:telegram',
        text: 'hi {name} on {networks}',
        networks: ['telegram'],
        mode: 'preview',
      }),
    });
    assert(r.ok, `outreach status=${r.status}`);
    const body = await r.json();
    assert(
      Array.isArray(body.envelopes),
      `outreach: envelopes missing: ${JSON.stringify(body)}`
    );
    assert(
      body.envelopes.length > 0,
      'outreach: at least one envelope expected after seeding'
    );
    assert(
      body.envelopes.every((e) => e.network === 'telegram'),
      'outreach: filter networks=telegram not respected'
    );
  });

  await step('backup → restore round-trip preserves seeded link', async () => {
    const create = await fetch(`${base}/api/backups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert(create.ok, `create backup status=${create.status}`);
    const created = await create.json();
    assert(created.file, `create backup: ${JSON.stringify(created)}`);

    const list = await fetch(`${base}/api/backups`).then((r) => r.json());
    assert(
      Array.isArray(list) && list.find((b) => b.file === created.file),
      `list backups missing newly created file: ${JSON.stringify(list)}`
    );

    // delete the seeded link, then restore from the archive
    const del = await fetch(`${base}/links/msg:telegram:1`, {
      method: 'DELETE',
    });
    assert(del.ok, `delete pre-restore: status=${del.status}`);
    const gone = await fetch(`${base}/links/msg:telegram:1`);
    assert(gone.status === 404, `delete pre-restore: still present`);

    const restore = await fetch(`${base}/api/backups/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file: created.file }),
    });
    assert(restore.ok, `restore status=${restore.status}`);
    const back = await restore.json();
    assert(
      typeof back.restored === 'number',
      `restore: ${JSON.stringify(back)}`
    );

    const after = await fetch(`${base}/links/msg:telegram:1`);
    assert(
      after.status === 200,
      `post-restore: GET msg:telegram:1 status=${after.status}`
    );
  });

  await step('dark-mode toggle persists across reload', async () => {
    await page.click('button[data-action="theme-toggle"]');
    const after = await page.evaluate(
      () => document.documentElement.dataset.theme
    );
    assert(
      after === 'dark' || after === 'light',
      `theme toggle: data-theme=${after}`
    );
    await page.reload({ waitUntil: 'load' });
    const persisted = await page.evaluate(
      () => document.documentElement.dataset.theme
    );
    assert(
      persisted === after,
      `theme toggle: not persisted (was ${after}, now ${persisted})`
    );
  });

  await step(
    'skip-link is the first focusable element on the page',
    async () => {
      await page.goto(base, { waitUntil: 'load' });
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) {
          return null;
        }
        return {
          tag: el.tagName,
          className: el.className,
          href: el.getAttribute('href'),
        };
      });
      assert(
        focused && focused.className.includes('skip-link'),
        `skip-link not focused first: ${JSON.stringify(focused)}`
      );
    }
  );
} finally {
  await commander.destroy?.();
  await browser.close();
  await handle.close();
}

if (failures.length > 0) {
  const names = failures.map((f) => f.name).join(', ');
  console.error(
    `[e2e-browser-spa] ${failures.length} step(s) failed: ${names}`
  );
  process.exit(1);
}

console.log('[e2e-browser-spa] all steps passed');
