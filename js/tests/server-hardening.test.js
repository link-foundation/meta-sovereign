// R-Z1: the local server's hardening — Host check (DNS rebinding), its own
// HTTPS origin, request bodies, secrets kept off the page, one error shape,
// a busy port, outbound timeouts and regexes with a time budget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { classifyOrigin, hostAllowed } from '../src/server/cors.js';
import { json, readBody, MAX_JSON_BODY } from '../src/server/util.js';
import { maskSecret } from '../src/server/secret-mask.js';
import { requestJson } from '../src/sources/http.js';
import { createTelegramBotLive } from '../src/sources/telegram.js';
import {
  MAX_INPUT_LENGTH,
  MAX_PATTERN_LENGTH,
  safeRegExp,
  safeTest,
} from '../src/patterns/safe-regex.js';
import { incomingTrigger } from '../src/automation/automations.js';
import { runCli } from '../src/cli/index.js';

const PAGES = 'https://link-foundation.github.io';

const withServer = async (opts, fn) => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-harden-'));
  const handle = await startServer({
    port: 0,
    storeDir,
    enableHandlers: false,
    enableSync: false,
    telegramAccount: false,
    automations: { scheduler: false },
    ...opts,
  });
  try {
    await fn(handle, `http://127.0.0.1:${handle.port}`, storeDir);
  } finally {
    await handle.close();
    await fs.rm(storeDir, { recursive: true, force: true });
  }
};

// fetch cannot set `Host`; http.request can.
const raw = (
  handle,
  { method = 'GET', path: p = '/api/status', headers, body }
) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: handle.port, method, path: p, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = JSON.parse(text);
          } catch {
            // not JSON
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        });
      }
    );
    req.on('error', reject);
    req.end(body);
  });

const put = (base, link, headers = {}) =>
  fetch(`${base}/links`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof link === 'string' ? link : JSON.stringify(link),
  });

test('Host header: only a loopback name with the server port is served', async () => {
  await withServer({}, async (handle) => {
    const port = handle.port;
    for (const host of [
      `127.0.0.1:${port}`,
      `localhost:${port}`,
      `[::1]:${port}`,
    ]) {
      const ok = await raw(handle, { headers: { host } });
      assert.equal(ok.status, 200, host);
    }
    for (const host of [
      `evil.example:${port}`,
      `127.0.0.1.evil.example:${port}`,
      `127.0.0.1:${port + 1}`,
      'localhost',
    ]) {
      const bad = await raw(handle, { headers: { host } });
      assert.equal(bad.status, 421, host);
      assert.equal(bad.body.ok, false);
      assert.equal(bad.body.code, 'bad-host');
    }
  });
});

test('DNS rebinding: a rebound name with its own Origin is refused on every route', async () => {
  await withServer({}, async (handle) => {
    await handle.store.put({ id: 'secret:x:token', value: 'tok' });
    const host = `evil.example:${handle.port}`;
    for (const [method, p] of [
      ['GET', '/links?prefix=secret:'],
      ['GET', '/api/status'],
      ['PUT', '/links'],
      ['POST', '/api/backups'],
      ['OPTIONS', '/links'],
    ]) {
      const res = await raw(handle, {
        method,
        path: p,
        headers: {
          host,
          origin: `http://${host}`,
          'content-type': 'application/json',
        },
        body: ['PUT', 'POST'].includes(method) ? '{"id":"a"}' : undefined,
      });
      assert.equal(res.status, 421, `${method} ${p}`);
      assert.equal(res.body.code, 'bad-host');
    }
    assert.equal(await handle.store.get('a'), null);
  });
});

test('the hosted app (GitHub Pages) still reaches the server, preflight included', async () => {
  await withServer({}, async (handle, base) => {
    const pre = await fetch(`${base}/links`, {
      method: 'OPTIONS',
      headers: {
        origin: PAGES,
        'access-control-request-method': 'PUT',
        'access-control-request-private-network': 'true',
      },
    });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), PAGES);
    assert.equal(
      pre.headers.get('access-control-allow-private-network'),
      'true'
    );
    const res = await put(base, { id: 'note:1' }, { origin: PAGES });
    assert.equal(res.status, 200);
    await res.text();
    // An unlisted site is still refused.
    const evil = await put(
      base,
      { id: 'note:2' },
      { origin: 'https://evil.example' }
    );
    assert.equal(evil.status, 403);
    await evil.text();
  });
});

test("the server's own https origin is same-origin for writes", async () => {
  const req = (host, origin) => ({ headers: { host, origin } });
  assert.equal(
    classifyOrigin(req('127.0.0.1:8787', 'https://127.0.0.1:8787'), []),
    'same'
  );
  assert.equal(
    classifyOrigin(req('localhost:8787', 'https://localhost:8787'), []),
    'same'
  );
  assert.equal(
    classifyOrigin(req('127.0.0.1:8787', 'http://127.0.0.1:8787'), []),
    'same'
  );
  // The Origin equals the Host, but the Host is not ours: not same-origin.
  assert.equal(
    classifyOrigin(req('evil.example', 'https://evil.example'), []),
    'denied'
  );
  assert.equal(hostAllowed({ headers: { host: '[::1]:5' } }, 5), true);
  await withServer({}, async (handle, base) => {
    const res = await put(
      base,
      { id: 'note:3' },
      { origin: `https://127.0.0.1:${handle.port}` }
    );
    assert.equal(res.status, 200);
    await res.text();
  });
});

test('request bodies: malformed JSON is 400 bad-json, an oversized one 413', async () => {
  await withServer({}, async (handle, base) => {
    const broken = await put(base, '{"id": "a"');
    assert.equal(broken.status, 400);
    assert.deepEqual(
      { ok: false, code: 'bad-json' },
      { ok: (await broken.json()).ok, code: 'bad-json' }
    );
    const big = await put(
      base,
      JSON.stringify({ id: 'big', pad: 'x'.repeat(MAX_JSON_BODY) })
    );
    assert.equal(big.status, 413);
    assert.equal((await big.json()).code, 'too-large');
    assert.equal(await handle.store.get('big'), null);
    // Other routes read bodies the same way (they used to read `{}`).
    for (const p of [
      '/api/greetings/plan',
      '/api/patterns/infer',
      '/api/telegram/send',
    ]) {
      const res = await fetch(`${base}${p}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{nope',
      });
      assert.ok([400, 404].includes(res.status), `${p} ${res.status}`);
      await res.text();
    }
  });
});

test('PUT /links validates the link', async () => {
  await withServer({}, async (_handle, base) => {
    for (const body of [
      'null',
      '[]',
      '{}',
      '{"id":""}',
      '{"id":5}',
      '"text"',
    ]) {
      const res = await put(base, body);
      assert.equal(res.status, 400, body);
      const answer = await res.json();
      assert.equal(answer.ok, false);
      assert.ok(['bad-json', 'bad-link'].includes(answer.code), body);
    }
  });
});

test('POST /api/backups needs a body: an empty one makes no archive', async () => {
  await withServer({}, async (_handle, base, storeDir) => {
    for (const body of ['', '{broken']) {
      const res = await fetch(`${base}/api/backups`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      assert.equal(res.status, 400);
      assert.equal((await res.json()).code, 'bad-json');
    }
    const files = await fs.readdir(path.join(storeDir, 'archives'));
    assert.deepEqual(files, []);
    const ok = await fetch(`${base}/api/backups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(ok.status, 200);
    await ok.text();
  });
});

test("a backup uses the server's secret passphrase when the body has none", async () => {
  await withServer(
    { secretPassphrase: 'server-pass' },
    async (_handle, base) => {
      const res = await fetch(`${base}/api/backups`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passphrase: null }),
      });
      assert.match((await res.json()).file, /\.json\.enc$/);
    }
  );
});

test('secrets: the page is told a secret is saved, never its value', async () => {
  await withServer({}, async (handle, base) => {
    await handle.store.put({
      id: 'secret:telegram:bot-token',
      tokens: ['secret', 'telegram', 'token'],
      value: 'SUPER-SECRET-VALUE',
      session: 'SESSION-STRING',
    });
    await handle.store.put({ id: 'note:1', value: 'public' });
    for (const p of ['/links?prefix=secret:', '/links', '/links?except=msg:']) {
      const text = await fetch(`${base}${p}`).then((r) => r.text());
      assert.ok(!text.includes('SUPER-SECRET-VALUE'), p);
      assert.ok(!text.includes('SESSION-STRING'), p);
      const secret = JSON.parse(text).find((l) => l.id.startsWith('secret:'));
      assert.deepEqual(
        { id: secret.id, masked: secret.masked, present: secret.present },
        { id: 'secret:telegram:bot-token', masked: true, present: true }
      );
    }
    const one = await fetch(`${base}/links/secret:telegram:bot-token`).then(
      (r) => r.text()
    );
    assert.ok(!one.includes('SUPER-SECRET-VALUE'));
    const note = await fetch(`${base}/links/note:1`).then((r) => r.json());
    assert.equal(note.value, 'public');
    // The server itself still holds the real value.
    assert.equal(
      (await handle.store.get('secret:telegram:bot-token')).value,
      'SUPER-SECRET-VALUE'
    );
  });
  assert.deepEqual(maskSecret({ id: 'a', value: 1 }), { id: 'a', value: 1 });
});

test('every JSON error is { ok: false, error, code } with the same status', async () => {
  const sent = (status, body) => {
    const out = {};
    json(
      {
        headersSent: false,
        writableEnded: false,
        writeHead: (s) => (out.status = s),
        end: (text) => (out.body = JSON.parse(text)),
      },
      status,
      body
    );
    return out;
  };
  assert.deepEqual(sent(404, { error: 'not found' }), {
    status: 404,
    body: { error: 'not found', ok: false, code: 'not-found' },
  });
  assert.deepEqual(sent(404, { ok: false }).body, {
    ok: false,
    error: 'request failed (404)',
    code: 'not-found',
  });
  assert.equal(sent(502, { error: 'x', code: 'flood' }).body.code, 'flood');
  assert.deepEqual(sent(200, { error: 'kept' }).body, { error: 'kept' });
  await withServer({}, async (_handle, base) => {
    const res = await fetch(`${base}/api/nope`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(typeof body.error, 'string');
    assert.equal(typeof body.code, 'string');
    const del = await fetch(`${base}/links/missing`, { method: 'DELETE' });
    assert.equal(del.status, 404);
    const gone = await del.json();
    assert.equal(gone.ok, false);
    assert.equal(typeof gone.error, 'string');
    assert.equal(typeof gone.code, 'string');
  });
});

test('readBody refuses an oversized or non-object body', async () => {
  const body = (text, headers = {}) => {
    const stream = new EventEmitter();
    stream.headers = headers;
    stream.resume = () => {};
    globalThis.queueMicrotask(() => {
      stream.emit('data', Buffer.from(text));
      stream.emit('end');
    });
    return stream;
  };
  await assert.rejects(readBody(body('[1]')), { code: 'bad-json' });
  await assert.rejects(readBody(body('x'.repeat(20)), { limit: 5 }), {
    code: 'too-large',
  });
  await assert.rejects(
    readBody(body('{}', { 'content-length': '999' }), { limit: 5 }),
    { code: 'too-large' }
  );
  assert.deepEqual(await readBody(body('')), {});
  await assert.rejects(readBody(body(''), { allowEmpty: false }), {
    code: 'bad-json',
  });
});

test('a busy port: startServer rejects clearly and starts no background service', async () => {
  const blocker = net.createServer();
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const port = blocker.address().port;
  try {
    for (const tls of [false, true]) {
      let started = 0;
      const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-busy-'));
      const account = {
        start: () => started++,
        stop: async () => {},
        status: () => ({}),
        live: {},
      };
      await assert.rejects(
        startServer({
          port,
          storeDir,
          tls,
          enableHandlers: false,
          enableSync: false,
          telegramAccount: account,
        }),
        (error) =>
          error.code === 'EADDRINUSE' && /already in use/.test(error.message)
      );
      assert.equal(started, 0, `tls=${tls}`);
      await fs.rm(storeDir, { recursive: true, force: true });
    }
    // `serve` ends with a message and a non-zero status.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-busy-cli-'));
    const lines = [];
    const code = await runCli(
      [
        'serve',
        `--port=${port}`,
        `--store=${dir}`,
        '--quiet-logs',
        '--tls=false',
      ],
      { log: (line) => lines.push(line) }
    );
    assert.equal(code, 1);
    assert.match(lines.join('\n'), /already in use/);
    await fs.rm(dir, { recursive: true, force: true });
  } finally {
    blocker.close();
  }
});

// A fetch that never answers on its own, only when its signal fires.
const hanging = (calls) => (url, init) =>
  new Promise((_resolve, reject) => {
    calls.push({ url, init });
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });

test('outbound: a read that times out is retried with backoff, then reported', async () => {
  const calls = [];
  const sleeps = [];
  await assert.rejects(
    requestJson(hanging(calls), 'https://api.example/x', {
      timeoutMs: 10,
      retries: 2,
      sleep: async (ms) => sleeps.push(ms),
    }),
    { code: 'timeout' }
  );
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [250, 500]);
});

test('outbound: a send that times out is send-unknown, sent once, no fallback', async () => {
  const calls = [];
  await assert.rejects(
    requestJson(hanging(calls), 'https://api.example/send', {
      method: 'POST',
      body: { text: 'hi' },
      timeoutMs: 10,
    }),
    (error) =>
      error.code === 'send-unknown' &&
      error.fallback === false &&
      error.outcome === 'unknown'
  );
  assert.equal(calls.length, 1);
  const bot = createTelegramBotLive({
    token: '1:abc',
    fetchImpl: hanging(calls),
    timing: { timeoutMs: 10 },
  });
  await assert.rejects(bot.post({ text: 'hello', chat: '1' }), {
    code: 'send-unknown',
  });
  assert.equal(calls.length, 2);
});

test('outbound: a normal answer still passes through with a signal attached', async () => {
  let seen = null;
  const answer = await requestJson(async (_url, init) => {
    seen = init.signal;
    return { ok: true, status: 200, text: async () => '{"a":1}' };
  }, 'https://api.example/ok');
  assert.deepEqual(answer, { a: 1 });
  assert.ok(seen instanceof globalThis.AbortSignal);
});

test('regex: pattern length and input size are capped, a runaway match is cut off', () => {
  assert.throws(() => safeRegExp('a'.repeat(MAX_PATTERN_LENGTH + 1)), {
    code: 'unsafe-pattern',
  });
  assert.ok(safeRegExp('a+') instanceof RegExp);
  // Text beyond the cap is not looked at.
  const late = `${'x'.repeat(MAX_INPUT_LENGTH)}needle`;
  assert.equal(safeTest(/needle/, late), false);
  assert.equal(safeTest(/needle/, 'a needle'), true);
  // Catastrophic backtracking returns false inside the budget.
  const started = Date.now();
  assert.equal(safeTest(/(a+)+$/, `${'a'.repeat(5000)}b`), false);
  assert.ok(Date.now() - started < 2000);
  const automation = {
    triggers: [{ kind: 'incoming', pattern: '(a+)+$', flags: 'i' }],
  };
  const t2 = Date.now();
  assert.equal(incomingTrigger(automation, `${'a'.repeat(5000)}b`), null);
  assert.ok(Date.now() - t2 < 2000);
});

test('graph run: a stored pattern that is too long is a 400, not a freeze', async () => {
  await withServer({}, async (handle, base) => {
    await handle.store.put({
      id: 'graph:g',
      nodes: [
        { id: 'n', kind: 'pattern', regex: 'a'.repeat(MAX_PATTERN_LENGTH + 1) },
      ],
      edges: [],
    });
    const res = await fetch(`${base}/api/graphs/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'graph:g', message: 'hi' }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'unsafe-pattern');
    const none = await fetch(`${base}/api/graphs/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(none.status, 400);
    await none.text();
  });
});
