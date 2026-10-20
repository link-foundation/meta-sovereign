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
  foundOnPort,
  hostedUiUrl,
  localUiEnabled,
} from '../src/server/hosted-ui.js';
import {
  BEACON_PATH,
  BEACON_WIDTH,
  DEFAULT_PORTS,
  discoverServer,
  findServerByPicture,
  mayNeedPicture,
} from '../src/web/discover.js';
import { openNearbyServer } from '../src/web/dom.js';

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

test('the hosted address, the switch, and the ports the app looks at', () => {
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
  assert.equal(DEFAULT_PORTS[0], 8787, 'our port is looked at first');
  assert.equal(foundOnPort(8787), true);
  assert.equal(foundOnPort('8788'), true);
  assert.equal(foundOnPort(9000), false);
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

test('with the local copy off, / opens the hosted app, no address in its link', async () => {
  await withServer({ localUi: 'false' }, async (base) => {
    const page = await fetch(`${base}/`, { redirect: 'manual' });
    assert.equal(page.status, 302);
    assert.equal(page.headers.get('location'), HOSTED_UI_URL);
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

test('the hosted app finds a server on our port by itself', async () => {
  const asked = [];
  const found = await discoverServer({
    origin: 'https://link-foundation.github.io',
    storage: null,
    fetchImpl: async (url) => {
      asked.push(url);
      return url.startsWith('http://127.0.0.1:8787/')
        ? { ok: true, json: async () => ({ links: 0 }) }
        : { ok: false };
    },
  });
  assert.deepEqual(found, { origin: 'http://127.0.0.1:8787' });
  assert.deepEqual(asked, [
    'https://link-foundation.github.io/api/status',
    'http://127.0.0.1:8787/api/status',
  ]);
});

// Safari: the hosted page cannot ask the server anything, but sees its
// picture, and its size says whether the server's own copy is on.
test('the server shows Safari its picture, sized by the local copy', async () => {
  const size = async (base) => {
    const answer = await fetch(`${base}${BEACON_PATH}`);
    assert.equal(answer.headers.get('content-type'), 'image/svg+xml');
    const svg = await answer.text();
    return svg
      .match(/width="(\d+)" height="(\d+)"/)
      .slice(1)
      .map(Number);
  };
  await withServer({}, async (base) =>
    assert.deepEqual(await size(base), [BEACON_WIDTH, 1])
  );
  await withServer({ localUi: false }, async (base) =>
    assert.deepEqual(await size(base), [BEACON_WIDTH, 2])
  );
  await withServer({ allowOrigins: 'none' }, async (base) =>
    assert.equal((await fetch(`${base}${BEACON_PATH}`)).status, 404)
  );
});

test('the hosted page finds a server by its picture and opens its copy', async () => {
  const pictures = {
    'http://127.0.0.1:8788': { width: BEACON_WIDTH, height: 1 },
    'http://127.0.0.1:3000': { width: 640, height: 480 },
  };
  const asked = [];
  const sizeOf = async (src) => {
    asked.push(src);
    return pictures[new URL(src).origin] ?? null;
  };
  const found = await findServerByPicture({ sizeOf, now: () => 1 });
  assert.deepEqual(found, { origin: 'http://127.0.0.1:8788', localUi: true });
  assert.equal(asked.length, DEFAULT_PORTS.length);
  assert.ok(asked.includes(`http://127.0.0.1:8787${BEACON_PATH}?1`));
  pictures['http://127.0.0.1:8788'].height = 2;
  assert.deepEqual(await findServerByPicture({ sizeOf }), {
    origin: 'http://127.0.0.1:8788',
    localUi: false,
  });

  const opened = [];
  const location = { hash: '#/chat', replace: (to) => opened.push(to) };
  const find = async () => ({ origin: 'http://127.0.0.1:8787', localUi: true });
  await openNearbyServer({ may: () => true, find, location });
  assert.deepEqual(opened, ['http://127.0.0.1:8787/#/chat']);
  // The copy off, or no picture needed: the page stays.
  await openNearbyServer({
    may: () => true,
    find: async () => ({ origin: 'http://127.0.0.1:8787', localUi: false }),
    location,
  });
  await openNearbyServer({ may: () => false, find, location });
  assert.equal(opened.length, 1);
});

test('only an https page in a plain browser looks for the picture', () => {
  const https = { protocol: 'https:' };
  assert.equal(mayNeedPicture({ location: https, hasImage: true }), true);
  assert.equal(
    mayNeedPicture({ location: { protocol: 'http:' }, hasImage: true }),
    false
  );
  assert.equal(
    mayNeedPicture({
      location: https,
      hasImage: true,
      shell: { platform: 'web' },
    }),
    true
  );
  assert.equal(
    mayNeedPicture({
      location: https,
      hasImage: true,
      shell: { platform: 'electron' },
    }),
    false
  );
  assert.equal(
    mayNeedPicture({ location: https, hasImage: true, capacitor: {} }),
    false
  );
  assert.equal(mayNeedPicture({ location: https, hasImage: false }), false);
});
