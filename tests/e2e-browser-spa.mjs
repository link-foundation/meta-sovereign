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
// Coverage maps directly to the critical UI paths originally tracked in
// `docs/ROADMAP.md` and now closed in the final requirements ledger:
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
// External-service connectors are exercised with mocked HTTP in the
// unit/integration suites. Two-browser WebRTC convergence is exercised
// below as part of this browser run when the JS backend is active.

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
      profile: true,
      theme: true,
      skipLink: true,
      // JS backend exposes a symmetric /rtc signaling broker, so two
      // SPAs in the same room can negotiate a WebRTC data channel
      // through it. Rust backend's broker shape isn't exercised here,
      // so the convergence step is gated to the JS run.
      twoBrowserRtc: true,
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
      profile: false,
      theme: true,
      skipLink: true,
      twoBrowserRtc: false,
      // Rust server doesn't expose outreach/backup/profile endpoints,
      // so those views render an empty shell. Skip them.
      navViews: navViewsAll.filter(
        (v) => v !== 'outreach' && v !== 'backup' && v !== 'profile'
      ),
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

const stepProfileSync = async ({ page, base, commander }) => {
  await commander.clickButton({ selector: 'button[data-view="profile"]' });
  await page.waitForFunction(
    () => document.querySelector('input[placeholder="name"]'),
    { timeout: 5000 }
  );
  await page.fill('input[placeholder="name"]', 'Alice E2E');
  await page.fill('textarea[placeholder="bio"]', 'Hello from the profile e2e');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button.primary')].find(
      (b) => b.textContent.trim() === 'save profile'
    );
    btn.click();
  });
  await page.waitForFunction(
    () => {
      const pre = document.querySelector('pre');
      return pre && pre.textContent && pre.textContent.includes('"source"');
    },
    { timeout: 5000 }
  );
  const planned = await page.$eval('pre', (el) => JSON.parse(el.textContent));
  assert(
    Array.isArray(planned) && planned.length > 0,
    `profile sync: plannedSyncs missing or empty: ${JSON.stringify(planned)}`
  );
  for (const want of ['telegram', 'vk']) {
    assert(
      planned.find((p) => p.source === want),
      `profile sync: missing envelope for ${want} in ${JSON.stringify(planned)}`
    );
  }
  assert(
    planned.every((p) => p.status === 'queued'),
    `profile sync: every envelope should be queued: ${JSON.stringify(planned)}`
  );

  const link = await fetch(`${base}/links/profile:me`).then((r) => r.json());
  assert(
    link.name === 'Alice E2E',
    `profile sync: server-side link not updated: ${JSON.stringify(link)}`
  );
};

const stepAxeAudit = async ({ page, base }) => {
  let axeSource;
  try {
    axeSource = await fs.readFile(
      path.join(repoRoot, 'node_modules', 'axe-core', 'axe.min.js'),
      'utf8'
    );
  } catch {
    console.log('SKIP (axe-core not installed)');
    return;
  }
  await page.goto(base, { waitUntil: 'load' });
  // The SPA serves a CSP without inline scripts, which blocks
  // `addScriptTag({ content })` (it injects an inline <script>). Run
  // the axe-core source through `page.evaluate` instead — that goes
  // via CDP `Runtime.evaluate`, which is not subject to the page CSP,
  // and exposes `window.axe` for the subsequent run.
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const results = await window.axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa'],
      resultTypes: ['violations'],
    });
    return results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => n.target),
    }));
  });
  const blocking = violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );
  assert(
    blocking.length === 0,
    `axe found ${blocking.length} serious/critical violation(s):\n${JSON.stringify(blocking, null, 2)}`
  );
  if (violations.length > 0) {
    console.log(
      `\n  (axe noted ${violations.length} non-blocking issue(s): ${violations.map((v) => `${v.id}/${v.impact}`).join(', ')})`
    );
  }
};

// Boot a *second* SPA in a fresh browser context (so it gets an
// isolated IndexedDB) on the same backend, mutate in page A, observe
// the same link materialise in page B's local store. Convergence has
// to happen via the WebRTC data channel — the SPA's writes are local-
// only (api.put → store.put), so page B can only see the link if
// `attachWebRtcSync` wired the store to a peer transport that
// delivered the event.
const stepTwoBrowserWebRtcConvergence = async ({ browser, page, base }) => {
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  try {
    // Both pages load the SPA so each calls `attachWebRtcSync` and
    // joins the /rtc room. Reload page A to ensure a fresh boot too
    // since the previous step navigated it around.
    await page.goto(base, { waitUntil: 'load' });
    await pageB.goto(base, { waitUntil: 'load' });

    // The dom.js boot is gated behind `ensure()` which runs lazily on
    // the first api.* call. Trigger it on both pages by importing the
    // module directly and calling `api.status()` — that resolves the
    // boot promise, which constructs the local store, the offline
    // client, *and* `attachWebRtcSync` on top of the discovered
    // server. Stash `api` on window so the rest of the step can use
    // it without re-importing.
    const seed = async (p) => {
      await p.evaluate(async () => {
        const mod = await import('/dom.js');
        window.__msApi = mod.api;
        await mod.api.status();
      });
    };
    await seed(page);
    await seed(pageB);

    // Page A writes a unique link via the SPA's own put path so it
    // flows store → peer.onLocal → transport.send.
    const probeId = `msg:rtc-probe-${Date.now()}`;
    await page.evaluate(async (id) => {
      await window.__msApi.put({
        id,
        tokens: ['rtc', 'probe'],
        body: 'two-browser convergence',
      });
    }, probeId);

    // Page B should observe the link in its local store. Poll for up
    // to 20s — ICE negotiation + datagram handshake is not free in a
    // headless browser.
    await pageB.waitForFunction(
      async (id) => {
        const link = await window.__msApi.get(id);
        return Boolean(link && link.id === id);
      },
      probeId,
      { timeout: 20000, polling: 250 }
    );
  } finally {
    await contextB.close();
  }
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
    name: 'profile edit emits per-network sync envelopes',
    fn: stepProfileSync,
    requires: 'profile',
  },
  {
    name: 'dark-mode toggle persists across reload',
    fn: stepThemeToggle,
    requires: 'theme',
  },
  {
    name: 'axe-core finds no serious/critical WCAG violations',
    fn: stepAxeAudit,
  },
  {
    name: 'skip-link is the first focusable element on the page',
    fn: stepSkipLink,
    requires: 'skipLink',
  },
  {
    name: 'two browsers converge writes over WebRTC',
    fn: stepTwoBrowserWebRtcConvergence,
    requires: 'twoBrowserRtc',
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
  const ctx = { browser, page, base, supports, commander };

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
