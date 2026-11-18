import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSyncFixtureBundle } from './helpers/e2e-sync-bundle.mjs';
import { prepareSyncPeer } from './helpers/e2e-sync-peer.mjs';

const bundle = (body, type = 'application/javascript') =>
  new globalThis.Response(body, { headers: { 'content-type': type } });

test(
  'WebKit sync preparation does not fetch from its navigation route',
  { timeout: 2000 },
  async () => {
    const original = globalThis.fetch;
    const stop = new Error('fixture navigation reached');
    const source = 'globalThis.actualFixtureBundle = "Привет";';
    let handler;
    let fetched = 0;
    let fulfilled;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'http://fixture.test/app.min.js');
      assert.ok(options.signal instanceof globalThis.AbortSignal);
      fetched += 1;
      return bundle(source);
    };
    const page = {
      context: () => ({ grantPermissions: async () => {} }),
      route: async (_pattern, callback) => {
        handler = callback;
      },
      addInitScript: async () => {},
      goto: async (url) => {
        if (url === 'about:blank') {
          return;
        }
        await handler({
          fetch: async () => {
            throw new Error('route.fetch: read ECONNRESET');
          },
          fulfill: async (options) => {
            fulfilled = options;
          },
        });
        throw stop;
      },
    };
    try {
      await assert.rejects(
        prepareSyncPeer(page, 'http://fixture.test', 'webkit'),
        (error) => error === stop
      );
      assert.equal(fetched, 1);
      assert.equal(fulfilled.contentType, 'application/javascript');
      assert.ok(fulfilled.body.endsWith(`\n${source}`));
      assert.match(
        fulfilled.body,
        /await navigator.mediaDevices.getUserMedia/u
      );
    } finally {
      globalThis.fetch = original;
    }
  }
);

test('bundle reads surface real transport failures to the awaited preparation', async () => {
  const failure = new Error('fixture transport failed');
  await assert.rejects(
    readSyncFixtureBundle('http://fixture.test', {
      request: async () => {
        throw failure;
      },
    }),
    (error) => error === failure
  );
});

test('bundle reads refuse failed, non-script, empty or oversized responses', async () => {
  for (const response of [
    new globalThis.Response('no', { status: 503 }),
    bundle('<html>', 'text/html'),
  ]) {
    await assert.rejects(
      readSyncFixtureBundle('http://fixture.test', {
        request: async () => response,
      }),
      /unavailable/u
    );
  }
  await assert.rejects(
    readSyncFixtureBundle('http://fixture.test', {
      request: async () => bundle(''),
    }),
    /empty/u
  );
  await assert.rejects(
    readSyncFixtureBundle('http://fixture.test', {
      request: async () => bundle('12345'),
      maxBytes: 4,
    }),
    /byte budget/u
  );
});
