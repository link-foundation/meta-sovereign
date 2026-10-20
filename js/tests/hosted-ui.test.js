// The hosted app is the UI; the server's own copy is an optional
// fallback (R-Y58, R-Y59). Only this test's own loopback server is
// asked — nothing reaches GitHub Pages or a running app.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer } from '../src/server/index.js';
import {
  HOSTED_UI_URL,
  hostedLink,
  hostedUiUrl,
  localUiEnabled,
} from '../src/server/hosted-ui.js';
import { discoverServer, serverHint } from '../src/web/discover.js';

const withServer = async (opts, use) => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-ui-'));
  const handle = await startServer({
    port: 0,
    storeDir,
    enableHandlers: false,
    enableSync: false,
    telegramAccount: false,
    ...opts,
  });
  try {
    await use(`http://127.0.0.1:${handle.port}`, handle);
  } finally {
    await handle.close();
    await fs.rm(storeDir, { recursive: true, force: true });
  }
};

test('the hosted address, the switch and the link with the server in it', () => {
  assert.equal(hostedUiUrl(undefined), HOSTED_UI_URL);
  assert.equal(
    hostedUiUrl('https://me.github.io/fork?x=1#/chat'),
    'https://me.github.io/fork/'
  );
  assert.equal(hostedUiUrl('javascript:alert(1)'), HOSTED_UI_URL);
  assert.equal(hostedUiUrl('not a url'), HOSTED_UI_URL);
  for (const off of ['false', 'off', '0', 'no', 'none', ' OFF ']) {
    assert.equal(localUiEnabled(off), false, off);
  }
  for (const on of [undefined, null, true, 'true', 'on', '1']) {
    assert.equal(localUiEnabled(on), true, String(on));
  }
  assert.equal(
    hostedLink(undefined, 'http://127.0.0.1:9000'),
    `${HOSTED_UI_URL}?server=http%3A%2F%2F127.0.0.1%3A9000`
  );
});

test('with the local copy on, the server serves the app itself', async () => {
  await withServer({ uiUrl: undefined }, async (base, handle) => {
    assert.equal(handle.localUi, true);
    assert.equal(handle.uiUrl, HOSTED_UI_URL);
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /meta-sovereign/);
  });
});

test('with the local copy off, / opens the hosted app pointed at this server', async () => {
  await withServer({ localUi: 'false' }, async (base) => {
    const page = await fetch(`${base}/`, { redirect: 'manual' });
    assert.equal(page.status, 302);
    const to = new URL(page.headers.get('location'));
    assert.equal(`${to.origin}${to.pathname}`, HOSTED_UI_URL);
    assert.equal(to.searchParams.get('server'), base);
    assert.equal((await fetch(`${base}/app.min.js`)).status, 404);
    // The API is still there for the hosted app.
    assert.equal((await fetch(`${base}/api/status`)).status, 200);
  });
});

test('a hosted copy named by hand may use the server, unless none may', async () => {
  const fork = 'https://someone.github.io';
  await withServer({ uiUrl: `${fork}/meta-sovereign/` }, async (base, h) => {
    assert.ok(h.allowOrigins.includes(fork));
    const answer = await fetch(`${base}/api/status`, {
      headers: { origin: fork },
    });
    assert.equal(answer.headers.get('access-control-allow-origin'), fork);
  });
  await withServer(
    { uiUrl: `${fork}/x/`, allowOrigins: 'none' },
    async (_base, h) => assert.deepEqual(h.allowOrigins, [])
  );
});

test('the link may name a server on this machine only, and it is tried first', async () => {
  assert.equal(
    serverHint('?server=http%3A%2F%2F127.0.0.1%3A9000'),
    'http://127.0.0.1:9000'
  );
  assert.equal(
    serverHint('?server=http://localhost:8790/x'),
    'http://localhost:8790'
  );
  assert.equal(serverHint('?server=https://evil.example'), null);
  assert.equal(serverHint('?server=http://127.0.0.1.evil.example'), null);
  assert.equal(serverHint('?server=file:///etc'), null);
  assert.equal(serverHint(''), null);

  const asked = [];
  const found = await discoverServer({
    origin: 'https://link-foundation.github.io',
    search: '?server=http://127.0.0.1:9000',
    storage: null,
    fetchImpl: async (url) => {
      asked.push(url);
      return url.startsWith('http://127.0.0.1:9000')
        ? { ok: true, json: async () => ({ links: 0 }) }
        : { ok: false };
    },
  });
  assert.deepEqual(found, { origin: 'http://127.0.0.1:9000' });
  assert.deepEqual(asked, [
    'https://link-foundation.github.io/api/status',
    'http://127.0.0.1:9000/api/status',
  ]);
});
