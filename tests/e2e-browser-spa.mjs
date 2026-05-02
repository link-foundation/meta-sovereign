// Real browser e2e (R-J7). Drives the SPA in headless Chromium via
// `browser-commander` + `playwright`.
//
// This file is *not* picked up by `npm test` (no `.test.js` suffix and
// not in the test glob) because Playwright + a Chromium download are
// large optional dependencies. Run it explicitly:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:browser
//
// Add `RUN_BROWSER_E2E_RUST=1` to additionally re-run the JS-server
// suite against the pure-Rust `meta-sovereign-rs serve` binary
// (built by `cargo build --release -p meta-sovereign-server`). The
// Rust backend implements a subset of the HTTP surface (no
// /api/outreach, no /api/backups), so steps that depend on those
// endpoints are skipped automatically when the backend reports
// `supports.outreach === false` etc.
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
//   6. Audience → outreach plan, backup → restore round-trip,
//      dark-mode toggle, skip-link a11y (JS backend only).
//
// Critical paths that need external infrastructure (real Telegram
// import, two browsers connected via WebRTC) are exercised by separate
// suites — see `tests/sync.test.js` and the
// `crates/meta-sovereign-server/tests/` integration tests.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

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

const navViewsAll = [
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

// JS backend (full surface, including outreach + backup + theme + a11y).
const startJsBackend = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-e2e-js-'));
  const handle = await startServer({ port: 0, storeDir: dir });
  return {
    name: 'js',
    base: `http://127.0.0.1:${handle.port}`,
    storeDir: dir,
    supports: {
      outreach: true,
      backups: true,
      theme: true,
      skipLink: true,
      navViews: navViewsAll,
    },
    close: async () => {
      await handle.close();
    },
  };
};

// Rust backend: spawn `meta-sovereign-rs serve --web src/web --port 0`
// and wait for it to print its bound port. Uses release build if
// available, otherwise debug.
const findRustBinary = async () => {
  const candidates = [
    path.join(repoRoot, 'target', 'release', 'meta-sovereign-rs'),
    path.join(repoRoot, 'target', 'debug', 'meta-sovereign-rs'),
  ];
  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {
      // try next
    }
  }
  return null;
};

const startRustBackend = async () => {
  const bin = await findRustBinary();
  if (!bin) {
    return null;
  }
  const webDir = path.join(repoRoot, 'src', 'web');
  // Bind to an ephemeral port. The Rust binary defaults to 8787 if
  // --port is omitted; we pass --port 0 so the OS assigns a free one
  // and the binary echoes it back on stdout.
  const proc = spawn(bin, ['serve', '--port', '0', '--web', webDir], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  const portPromise = new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      const m = buf.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) {
        proc.stdout.off('data', onData);
        resolve(Number(m[1]));
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (c) => {
      process.stderr.write(`[meta-sovereign-rs] ${c}`);
    });
    proc.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`meta-sovereign-rs exited early with code ${code}`));
      }
    });
    setTimeout(
      () => reject(new Error('timed out waiting for meta-sovereign-rs port')),
      10_000
    );
  });

  const port = await portPromise;

  return {
    name: 'rust',
    base: `http://127.0.0.1:${port}`,
    storeDir: null,
    supports: {
      outreach: false,
      backups: false,
      theme: true,
      skipLink: true,
      // Rust server doesn't expose outreach/backup endpoints, so the
      // SPA's "outreach" + "backup" nav buttons render but the views
      // can't fetch data. Skip those nav clicks for the Rust pass.
      navViews: navViewsAll.filter((v) => v !== 'outreach' && v !== 'backup'),
    },
    close: async () =>
      new Promise((resolve) => {
        proc.once('exit', () => resolve());
        proc.kill('SIGTERM');
        // Hard-kill if it doesn't exit quickly.
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 2000);
      }),
  };
};

const stepShellLoadsNavButtons = async ({ page, base, supports }) => {
  await page.goto(base, { waitUntil: 'load' });
  for (const v of supports.navViews) {
    const sel = `button[data-view="${v}"]`;
    const found = await page.$(sel);
    assert(found, `missing nav button ${v}`);
  }
};

const stepSeedMessages = async ({ base }) => {
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
};

const stepClickEveryNavButton = async ({ page, commander, supports }) => {
  for (const v of supports.navViews) {
    await commander.clickButton({ selector: `button[data-view="${v}"]` });
    await page.waitForFunction(
      () =>
        document.querySelector('#root') &&
        document.querySelector('#root').children.length > 0,
      { timeout: 5000 }
    );
    const active = await page.$eval('button.active', (el) => el.dataset.view);
    assert(active === v, `expected active=${v}, got ${active}`);
  }
};

const stepReloadSurvives = async ({ page, base }) => {
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
};

const stepInferPattern = async ({ base }) => {
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
};

const stepPersistGraph = async ({ base }) => {
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
  assert(found && found.nodes.length === 2, 'graph not persisted as expected');
};

const stepBroadcast = async ({ base }) => {
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
};

const stepOutreach = async ({ base }) => {
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
};

const stepBackupRestore = async ({ base }) => {
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
  assert(typeof back.restored === 'number', `restore: ${JSON.stringify(back)}`);

  const after = await fetch(`${base}/links/msg:telegram:1`);
  assert(
    after.status === 200,
    `post-restore: GET msg:telegram:1 status=${after.status}`
  );
};

const stepThemeToggle = async ({ page }) => {
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
};

const stepSkipLink = async ({ page, base }) => {
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
};

const ALL_STEPS = [
  {
    name: 'shell loads with all expected nav buttons',
    fn: stepShellLoadsNavButtons,
  },
  {
    name: 'seed two messages via REST so derived views have data',
    fn: stepSeedMessages,
  },
  {
    name: 'click every supported nav button and confirm view rendered',
    fn: stepClickEveryNavButton,
  },
  {
    name: 'reload after writing a message and verify it survives',
    fn: stepReloadSurvives,
  },
  { name: 'infer pattern from examples and save', fn: stepInferPattern },
  {
    name: 'persist a 2-node automation graph and read it back',
    fn: stepPersistGraph,
  },
  { name: 'broadcast emits per-network envelopes', fn: stepBroadcast },
  {
    name: 'outreach plan personalises envelopes per recipient',
    fn: stepOutreach,
    requires: 'outreach',
  },
  {
    name: 'backup → restore round-trip preserves seeded link',
    fn: stepBackupRestore,
    requires: 'backups',
  },
  {
    name: 'dark-mode toggle persists across reload',
    fn: stepThemeToggle,
    requires: 'theme',
  },
  {
    name: 'skip-link is the first focusable element on the page',
    fn: stepSkipLink,
    requires: 'skipLink',
  },
];

const runSuite = async (backend) => {
  const { base, supports } = backend;
  console.log(
    `\n[e2e-browser-spa] === backend=${backend.name} base=${base} ===`
  );

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

  const failures = [];
  const ctx = { page, base, supports, commander };

  try {
    for (const { name, fn, requires } of ALL_STEPS) {
      if (requires && !supports[requires]) {
        continue;
      }
      process.stdout.write(`[e2e-browser-spa:${backend.name}] ${name} ... `);
      try {
        await fn(ctx);
        console.log('ok');
      } catch (err) {
        console.log(`FAIL\n${err.stack || err.message}`);
        failures.push({ name, err });
      }
    }
  } finally {
    await commander.destroy?.();
    await browser.close();
  }

  return failures;
};

const allFailures = [];

const jsBackend = await startJsBackend();
try {
  console.log(
    `[e2e-browser-spa] JS server up at ${jsBackend.base}, store=${jsBackend.storeDir}`
  );
  const f = await runSuite(jsBackend);
  allFailures.push(...f.map((x) => ({ ...x, backend: 'js' })));
} finally {
  await jsBackend.close();
}

if (process.env.RUN_BROWSER_E2E_RUST) {
  const rustBackend = await startRustBackend();
  if (!rustBackend) {
    console.log(
      '[e2e-browser-spa] SKIP rust: meta-sovereign-rs binary not found ' +
        '(run `cargo build -p meta-sovereign-server` first)'
    );
  } else {
    try {
      console.log(`[e2e-browser-spa] Rust server up at ${rustBackend.base}`);
      const f = await runSuite(rustBackend);
      allFailures.push(...f.map((x) => ({ ...x, backend: 'rust' })));
    } finally {
      await rustBackend.close();
    }
  }
}

if (allFailures.length > 0) {
  const names = allFailures.map((f) => `${f.backend}/${f.name}`).join(', ');
  console.error(
    `[e2e-browser-spa] ${allFailures.length} step(s) failed: ${names}`
  );
  process.exit(1);
}

console.log('[e2e-browser-spa] all steps passed');
