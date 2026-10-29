// Sign-ins from the user's own browsers: scan (counts only), explicit
// import into an owner-only file, one-time seeding of the import window,
// the Full Disk Access probe, the routes, and the Connections list
// (biggest services first, "Import with browser" recommended).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { createMemoryStore } from '../src/storage/index.js';
import {
  createAutoImportManager,
  createSignIns,
  hostAppName,
  FULL_DISK_ACCESS_URL,
} from '../src/sources/auto-import/index.js';
import { onDomains } from '../src/sources/auto-import/sign-ins.js';
import { startServer } from '../src/server/index.js';
import { ConnectionsList } from '../src/web/connections/index.js';
import { BrowserSignIns } from '../src/web/connections/browser-sign-ins.js';
import {
  byPopularity,
  formatUsers,
  serviceUsers,
} from '../src/web/connections/popularity.js';
import { providerCatalogue } from '../src/web/connection-guides.js';

const tmpDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'ms-sign-ins-'));

const NOW = Date.UTC(2026, 9, 12);
const future = NOW / 1000 + 86400;

// A fake browser-commander: Chrome signed in to Google and GitHub, Safari
// locked behind Full Disk Access, Firefox with nothing relevant.
const fakeBrowserCommander = (calls = []) => ({
  listBrowserProfiles: async () => [
    {
      browser: 'chrome',
      name: 'Default',
      displayName: 'Personal',
      isDefault: true,
    },
    { browser: 'safari', name: 'Default', displayName: 'Default' },
    { browser: 'firefox', name: 'default-release' },
  ],
  listCookieSources: async ({ domains }) => {
    calls.push({ listCookieSources: domains });
    return [
      {
        browser: 'chrome',
        profile: 'Default',
        cookies: 120,
        byDomain: { 'google.com': 14, 'github.com': 3 },
      },
      {
        browser: 'safari',
        profile: 'Default',
        error: 'Safari access denied (EPERM) at Cookies.binarycookies',
      },
    ];
  },
  readBrowserCookies: async (options) => {
    calls.push({ readBrowserCookies: options });
    if (options.browser === 'safari') {
      throw Object.assign(new Error('Safari access denied (EPERM)'), {
        code: 'EPERM',
      });
    }
    return [
      { name: 'SID', value: 's1', domain: '.google.com', expires: future },
      { name: 'old', value: 'x', domain: '.google.com', expires: 1 },
      { name: 'user_session', value: 'g1', domain: 'github.com', expires: -1 },
      { name: 'tracker', value: 't', domain: '.example.com', expires: -1 },
      { name: 'fake', value: 'f', domain: 'notgithub.com', expires: -1 },
    ];
  },
});

const signInsFor = async (overrides = {}) => {
  const calls = [];
  const dataDir = await tmpDir();
  const signIns = createSignIns({
    dataDir,
    importer: async () => fakeBrowserCommander(calls),
    platform: 'linux',
    now: () => NOW,
    ...overrides,
  });
  return { signIns, calls, dataDir };
};

test('onDomains matches a site and its subdomains only', () => {
  assert.ok(onDomains('.mail.google.com', ['google.com']));
  assert.ok(onDomains('github.com', ['github.com']));
  assert.ok(!onDomains('notgithub.com', ['github.com']));
  assert.ok(!onDomains('github.com.evil', ['github.com']));
});

test('scan lists every browser with per-service counts and access errors', async () => {
  const { signIns, calls } = await signInsFor();
  const { browsers, fullDiskAccess } = await signIns.scan();
  assert.deepEqual(
    browsers.map((b) => b.label),
    ['Google Chrome (Personal)', 'Safari', 'Firefox']
  );
  const [chrome, safari, firefox] = browsers;
  assert.deepEqual(chrome.services, { email: 14, github: 3 });
  assert.equal(chrome.isDefault, true);
  assert.equal(safari.needsFullDiskAccess, true);
  assert.deepEqual(firefox.services, {});
  assert.equal(fullDiskAccess.required, false);
  // Counting only: no cookie values were read.
  assert.ok(calls.every((c) => !c.readBrowserCookies));
  assert.ok(calls[0].listCookieSources.some((host) => host === 'telegram.org'));
});

test('import keeps only the services’ own cookies, privately, until used', async () => {
  const { signIns, dataDir } = await signInsFor();
  await assert.rejects(() => signIns.importFrom([]), /at least one browser/);
  const result = await signIns.importFrom([
    { browser: 'chrome', profile: 'Default' },
    { browser: 'safari', profile: 'Default' },
    { browser: 'opera', profile: 'Default' },
  ]);
  assert.deepEqual(Object.keys(result.services).sort(), ['email', 'github']);
  assert.equal(result.services.email.cookies, 1, 'expired cookie dropped');
  assert.deepEqual(result.services.github.from, ['Google Chrome (Personal)']);
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].needsFullDiskAccess, true);
  assert.equal(result.errors[1].error, 'not found');
  // Nothing in the answer carries a cookie value.
  assert.doesNotMatch(JSON.stringify(result), /s1|g1/);

  const file = path.join(dataDir, 'auto-import', 'sign-ins', 'github.json');
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  }
  const summary = await signIns.summary();
  assert.deepEqual(Object.keys(summary).sort(), ['email', 'github']);
  assert.doesNotMatch(JSON.stringify(summary), /s1|g1/);

  // A second import merges instead of duplicating.
  await signIns.importFrom([{ browser: 'chrome', profile: 'Default' }]);
  assert.equal((await signIns.peek('github')).length, 1);
  await signIns.consume('github');
  assert.deepEqual(await signIns.peek('github'), []);
  await assert.rejects(() => signIns.peek('../etc'), /unknown service/);
});

test('the import window is seeded once with the saved sign-ins', async () => {
  const { signIns, dataDir } = await signInsFor();
  await signIns.importFrom([{ browser: 'chrome', profile: 'Default' }]);
  const launches = [];
  const manager = createAutoImportManager({
    store: createMemoryStore(),
    dataDir,
    signIns,
    launcher: async (options) => {
      launches.push(options);
      return { downloads: null, close: async () => {} };
    },
  });
  const job = manager.start('github');
  for (let i = 0; i < 50 && manager.get(job.id).state !== 'waiting'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(launches[0].cookies.length, 1);
  assert.equal(launches[0].cookies[0].name, 'user_session');
  assert.equal(manager.get(job.id).signedIn, true);
  assert.deepEqual(await signIns.peek('github'), [], 'copy deleted');
  await manager.close();
});

test('Full Disk Access: probe on macOS and open the settings pane', async () => {
  const home = await tmpDir();
  const opened = [];
  const { signIns } = await signInsFor({
    platform: 'darwin',
    homeDir: home,
    env: { TERM_PROGRAM: 'iTerm.app' },
    openUrl: async (url) => opened.push(url),
  });
  assert.deepEqual(await signIns.access(), {
    required: true,
    granted: null,
    app: 'iTerm',
  });
  await fs.mkdir(path.join(home, 'Library', 'Safari'), { recursive: true });
  assert.equal((await signIns.access()).granted, true);
  await signIns.openFullDiskAccessSettings();
  assert.deepEqual(opened, [FULL_DISK_ACCESS_URL]);

  const { signIns: linux } = await signInsFor();
  await assert.rejects(() => linux.openFullDiskAccessSettings(), /macOS/);
  assert.equal(
    hostAppName({ __CFBundleIdentifier: 'com.apple.Terminal' }),
    'Terminal'
  );
  assert.equal(hostAppName({}, '/usr/bin/node'), '/usr/bin/node');
});

test('server: sign-in routes are POST-only from the app', async () => {
  const { signIns } = await signInsFor();
  const handle = await startServer({
    port: 0,
    storeDir: await tmpDir(),
    enableSync: false,
    autoImportLauncher: async () => ({ close: async () => {} }),
    autoImportSignIns: signIns,
  });
  const base = `http://127.0.0.1:${handle.port}`;
  const post = (p, body, headers = {}) =>
    fetch(`${base}${p}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  try {
    const foreign = await post(
      '/api/auto-import/browsers/scan',
      {},
      { origin: 'https://evil.example' }
    );
    assert.equal(foreign.status, 403);
    const scan = await (
      await post('/api/auto-import/browsers/scan', {})
    ).json();
    assert.equal(scan.browsers.length, 3);
    const imported = await (
      await post('/api/auto-import/browsers/import', {
        sources: [{ browser: 'chrome', profile: 'Default' }],
      })
    ).json();
    assert.deepEqual(Object.keys(imported.services).sort(), [
      'email',
      'github',
    ]);
    const status = await (await fetch(`${base}/api/auto-import`)).json();
    assert.equal(status.signIns.github.cookies, 1);
    assert.equal(status.fullDiskAccess.required, false);
    assert.equal(status.providers.email.domains[0], 'google.com');
    const fda = await post('/api/auto-import/browsers/full-disk-access', {});
    assert.equal(fda.status, 400);
  } finally {
    await handle.close();
  }
});

test('services are listed biggest first, Email on top', () => {
  const ids = byPopularity(Object.keys(providerCatalogue));
  assert.equal(ids[0], 'email');
  for (let i = 1; i < ids.length; i += 1) {
    assert.ok(
      (serviceUsers[ids[i - 1]] ?? 0) >= (serviceUsers[ids[i]] ?? 0),
      `${ids[i - 1]} before ${ids[i]}`
    );
  }
  for (const id of Object.keys(providerCatalogue)) {
    assert.ok(serviceUsers[id] > 0, `${id} has a user estimate`);
  }
  assert.deepEqual(byPopularity(['zz', 'telegram', 'yy']), [
    'telegram',
    'zz',
    'yy',
  ]);
  assert.equal(formatUsers(4.6e9, 'en'), '4.6B');
});

test('Connections cards recommend "Import with browser" and show sizes', () => {
  const html = renderToStaticMarkup(
    React.createElement(ConnectionsList, {
      status: {},
      initialAutoImport: {
        available: true,
        providers: { email: {}, telegram: {}, github: {} },
        signIns: { github: { cookies: 1, from: ['Google Chrome'] } },
      },
    })
  );
  const order = [...html.matchAll(/data-provider-id="([^"]+)"/g)].map(
    (m) => m[1]
  );
  assert.equal(order[0], 'email');
  assert.match(html, /data-tutorial-id="connections:sign-ins"/);
  assert.match(
    html,
    /data-target-provider="email" class="primary" data-action="connection-auto-import"/
  );
  assert.match(html, /Recommended/);
  assert.match(html, /4\.6B users/);
  assert.match(html, /Signed in via Google Chrome/);
  // Browser-only boards keep their own flow.
  assert.doesNotMatch(
    html,
    /data-target-provider="naukri"[^>]*data-action="connection-auto-import"/
  );

  const offline = renderToStaticMarkup(
    React.createElement(ConnectionsList, {
      status: {},
      initialAutoImport: { available: false, offline: true },
    })
  );
  assert.doesNotMatch(offline, /connection-auto-import/);
  assert.doesNotMatch(offline, /connections:sign-ins/);
});

test('BrowserSignIns starts with one read-only action', () => {
  const html = renderToStaticMarkup(
    React.createElement(BrowserSignIns, {
      status: { fullDiskAccess: { required: true, granted: false, app: 'X' } },
    })
  );
  assert.match(html, /data-action="find-sign-ins"/);
  assert.doesNotMatch(html, /data-action="use-sign-ins"/);
  assert.match(html, /data-action="open-full-disk-access"/);
  assert.match(html, /turn on X/);
});
