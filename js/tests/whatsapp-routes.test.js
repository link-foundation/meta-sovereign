// R-Z9 routes: the sign-in window controls (a fake controller, so no browser
// opens) and the zip/txt archive import. Uniform error shape, same-app check.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';

import { handleWhatsAppRoutes } from '../src/server/routes-whatsapp.js';
import { createMemoryStore } from '../src/storage/index.js';
import { post } from './util-http.js';

const withRoutes = async (ctx, run) => {
  const store = createMemoryStore();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!(await handleWhatsAppRoutes(store, req, res, url.pathname, ctx))) {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base, store);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const fakeSignIn = (events) => ({
  status: async () => ({ state: 'closed', open: false, signedIn: false }),
  start: async () => {
    events.push('start');
    return { state: 'waiting', open: true, signedIn: false };
  },
  stop: async () => {
    events.push('stop');
    return { state: 'closed', open: false, signedIn: false };
  },
});

test('sign-in routes start and stop the window, and say the terms', async () => {
  const events = [];
  await withRoutes({ whatsappSignIn: fakeSignIn(events) }, async (base) => {
    const status = await (await fetch(`${base}/api/whatsapp/web`)).json();
    assert.equal(status.ok, true);
    assert.equal(status.signedIn, false);
    assert.match(status.terms.note, /automated or bulk/);
    const started = await (
      await post(base, '/api/whatsapp/web/sign-in', {})
    ).json();
    assert.equal(started.state, 'waiting');
    const stopped = await (
      await post(base, '/api/whatsapp/web/close', {})
    ).json();
    assert.equal(stopped.open, false);
    assert.deepEqual(events, ['start', 'stop']);
  });
});

test('a foreign origin or a non-JSON post cannot open the window', async () => {
  const events = [];
  await withRoutes({ whatsappSignIn: fakeSignIn(events) }, async (base) => {
    const foreign = await post(
      base,
      '/api/whatsapp/web/sign-in',
      {},
      { origin: 'https://evil.example' }
    );
    assert.equal(foreign.status, 403);
    assert.equal((await foreign.json()).ok, false);
    const form = await fetch(`${base}/api/whatsapp/web/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x',
    });
    assert.equal(form.status, 403);
    assert.deepEqual(events, []);
  });
});

test('a missing browser is a 503 in the uniform shape, not a crash', async () => {
  const broken = {
    ...fakeSignIn([]),
    start: async () => {
      throw Object.assign(new Error('install playwright'), {
        code: 'browser-unavailable',
      });
    },
  };
  await withRoutes({ whatsappSignIn: broken }, async (base) => {
    const answer = await post(base, '/api/whatsapp/web/sign-in', {});
    assert.equal(answer.status, 503);
    const body = await answer.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, 'browser-unavailable');
  });
});

test('archive route imports a text export and refuses garbage', async () => {
  await withRoutes({}, async (base, store) => {
    const text = '[25.10.2026, 14:32:11] Anna: Hallo\n';
    const done = await (
      await post(base, '/api/whatsapp/archive', {
        name: 'WhatsApp Chat with Anna.txt',
        data: Buffer.from(text).toString('base64'),
      })
    ).json();
    assert.equal(done.imported, 1);
    assert.equal((await store.query((l) => l.source === 'whatsapp')).length, 1);
    const bad = await post(base, '/api/whatsapp/archive', { name: 5 });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).code, 'bad-request');
    const notZip = await post(base, '/api/whatsapp/archive', {
      name: 'x.zip',
      data: Buffer.from('not a zip at all').toString('base64'),
    });
    assert.equal(notZip.status, 400);
    assert.equal((await notZip.json()).code, 'bad-archive');
  });
});
