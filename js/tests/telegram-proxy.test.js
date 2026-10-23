// The connection proxy (R-Y192): validation, write-only secrets (nothing
// the route answers holds a password or secret), the options GramJS gets
// (an injected fake client), reconnecting on save, the check by an
// injected probe, and the routes. Nothing opens a socket.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../src/storage/universal.js';
import {
  PROXY_ID,
  createProxy,
  publicProxy,
  proxyOptions,
  readProxy,
  secretOf,
  validHost,
  validateProxy,
  portOf,
} from '../src/sources/telegram-proxy.js';
import { gramjsClientFactory } from '../src/sources/telegram-mtproto.js';
import { PROXY_POSTS } from '../src/server/routes-telegram-proxy.js';
import { post } from './helpers/telegram-fakes.mjs';

const HEX = '0123456789abcdef0123456789abcdef';
const PASSWORD = 'hunter2-very-secret';

test('hosts are names or IP addresses, never URLs', () => {
  for (const ok of [
    'example.com',
    'a-b.example.org',
    '10.0.0.1',
    '::1',
    '2001:db8::1',
    'localhost',
  ]) {
    assert.equal(validHost(ok), true, ok);
  }
  for (const bad of [
    'http://example.com',
    'example.com/path',
    'example.com:443',
    'user@example.com',
    '999.1.1.1',
    '1.2.3',
    '-bad.com',
    ' example.com',
    '',
    'a b',
    42,
    null,
  ]) {
    assert.equal(validHost(bad), false, String(bad));
  }
});

test('ports are 1 to 65535', () => {
  assert.equal(portOf(1080), 1080);
  assert.equal(portOf('443'), 443);
  for (const bad of [0, 65536, -1, 1.5, 'x', '', '99999', null, undefined]) {
    assert.equal(portOf(bad), null, String(bad));
  }
});

test('a secret is hex or base64url, 16 bytes (dd for secure ones)', () => {
  assert.deepEqual(secretOf(HEX), { hex: HEX });
  assert.deepEqual(secretOf(`dd${HEX}`), { hex: `dd${HEX}` });
  const url = Buffer.from(HEX, 'hex').toString('base64url');
  assert.deepEqual(secretOf(url), { hex: HEX });
  assert.deepEqual(secretOf(`ee${HEX}6578616d706c652e636f6d`), {
    error: 'unsupported-secret',
  });
  for (const bad of ['', 'short', 'zz'.repeat(16), HEX.slice(1), 5, null]) {
    assert.equal(secretOf(bad), null, String(bad));
  }
});

test('validateProxy checks kind, host, port, login and secret', () => {
  assert.deepEqual(validateProxy({ kind: 'none', host: 'ignored' }), {
    ok: true,
    value: { kind: 'none' },
  });
  assert.deepEqual(
    validateProxy({ kind: 'socks5', host: 'h.example', port: '1080' }).value,
    {
      kind: 'socks5',
      host: 'h.example',
      port: 1080,
      username: '',
      password: '',
    }
  );
  const code = (body, before) => validateProxy(body, before).code;
  assert.equal(code({ kind: 'http' }), 'bad-kind');
  assert.equal(code(null), 'bad-kind');
  assert.equal(
    code({ kind: 'socks5', host: 'https://x.com', port: 1 }),
    'bad-host'
  );
  assert.equal(code({ kind: 'socks5', host: 'x.com', port: 0 }), 'bad-port');
  assert.equal(
    code({ kind: 'socks5', host: 'x.com', port: 1, password: 'p' }),
    'bad-login'
  );
  assert.equal(
    code({ kind: 'socks5', host: 'x.com', port: 1, username: 'u'.repeat(256) }),
    'bad-login'
  );
  assert.equal(code({ kind: 'mtproto', host: 'x.com', port: 1 }), 'bad-secret');
  assert.equal(
    code({ kind: 'mtproto', host: 'x.com', port: 1, secret: 'nope' }),
    'bad-secret'
  );
  assert.equal(
    code({ kind: 'mtproto', host: 'x.com', port: 1, secret: `ee${HEX}aa` }),
    'unsupported-secret'
  );
  // A base64url secret is kept as hex, what GramJS reads unambiguously.
  assert.equal(
    validateProxy({
      kind: 'mtproto',
      host: 'x.com',
      port: 443,
      secret: Buffer.from(HEX, 'hex').toString('base64url'),
    }).value.secret,
    HEX
  );
});

test('a saved password or secret is kept for the same host only', () => {
  const socks = {
    kind: 'socks5',
    host: 'a.example',
    port: 1080,
    username: 'u',
    password: PASSWORD,
  };
  const keep = validateProxy(
    { kind: 'socks5', host: 'a.example', port: 1081, username: 'u' },
    socks
  );
  assert.equal(keep.value.password, PASSWORD);
  const moved = validateProxy(
    { kind: 'socks5', host: 'b.example', port: 1080, username: 'u' },
    socks
  );
  assert.equal(moved.value.password, '');
  const cleared = validateProxy(
    {
      kind: 'socks5',
      host: 'a.example',
      port: 1080,
      username: 'u',
      password: '',
    },
    socks
  );
  assert.equal(cleared.value.password, '');
  const mt = { kind: 'mtproto', host: 'a.example', port: 443, secret: HEX };
  assert.equal(
    validateProxy({ kind: 'mtproto', host: 'a.example', port: 444 }, mt).value
      .secret,
    HEX
  );
  assert.equal(
    validateProxy({ kind: 'mtproto', host: 'c.example', port: 444 }, mt).code,
    'bad-secret'
  );
});

test('the page only sees that a password or secret is set', () => {
  const socks = publicProxy({
    kind: 'socks5',
    host: 'h',
    port: 1,
    username: 'u',
    password: PASSWORD,
  });
  assert.deepEqual(socks, {
    kind: 'socks5',
    host: 'h',
    port: 1,
    username: 'u',
    passwordSet: true,
  });
  const mt = publicProxy({ kind: 'mtproto', host: 'h', port: 1, secret: HEX });
  assert.deepEqual(mt, {
    kind: 'mtproto',
    host: 'h',
    port: 1,
    secretSet: true,
  });
  assert.deepEqual(publicProxy(null), { kind: 'none' });
});

test('GramJS gets the proxy in its own shape', () => {
  assert.equal(proxyOptions(null), undefined);
  assert.equal(proxyOptions({ kind: 'none' }), undefined);
  assert.deepEqual(
    proxyOptions({
      kind: 'socks5',
      host: 'h',
      port: 1080,
      username: 'u',
      password: 'p',
    }),
    {
      ip: 'h',
      port: 1080,
      socksType: 5,
      timeout: 10,
      username: 'u',
      password: 'p',
    }
  );
  assert.deepEqual(
    proxyOptions({ kind: 'mtproto', host: 'h', port: 443, secret: HEX }),
    { ip: 'h', port: 443, MTProxy: true, secret: HEX }
  );
});

const fakeTelegram = () => {
  const built = [];
  class TelegramClient {
    constructor(session, apiId, apiHash, options) {
      built.push({ session, apiId, apiHash, options });
    }
  }
  const importer = async () => ({
    TelegramClient,
    sessions: {
      StringSession: class {
        constructor(s) {
          this.s = s;
        }
      },
    },
  });
  return { built, importer };
};

test('the client is built with the saved proxy (an injected factory)', async () => {
  const { built, importer } = fakeTelegram();
  let setting = {
    kind: 'socks5',
    host: 'h',
    port: 1080,
    username: '',
    password: '',
  };
  const factory = gramjsClientFactory(importer, { proxy: async () => setting });
  await factory({ apiId: '1', apiHash: 'x', session: 's' });
  assert.equal(built[0].options.proxy.socksType, 5);
  assert.equal(built[0].options.proxy.ip, 'h');
  assert.equal(built[0].options.connectionRetries, 5);
  setting = { kind: 'mtproto', host: 'm', port: 443, secret: HEX };
  await factory({ apiId: '1', apiHash: 'x', session: 's' });
  assert.equal(built[1].options.proxy.MTProxy, true);
  setting = null;
  await factory({ apiId: '1', apiHash: 'x', session: 's' });
  assert.equal('proxy' in built[2].options, false);
  // Without a getter nothing changes: direct.
  await gramjsClientFactory(importer)({ apiId: '1', apiHash: 'x' });
  assert.equal('proxy' in built[3].options, false);
});

const make = () => {
  const store = createMemoryStore();
  const calls = { disconnect: 0, reopen: 0, probes: [], logs: [] };
  const env = {
    store,
    connection: { disconnect: async () => (calls.disconnect += 1) },
    reopen: async () => (calls.reopen += 1),
    proxyProbe: async (what) => {
      calls.probes.push(what);
      return { reachable: what.port === 1080, ms: 7 };
    },
    log: (entry) => calls.logs.push(entry),
    now: () => 0,
  };
  return { store, calls, proxy: createProxy(env) };
};

test('saving keeps the setting, reconnects, and never echoes secrets', async () => {
  const { store, calls, proxy } = make();
  assert.deepEqual((await proxy.proxyGet()).proxy, { kind: 'none' });
  const saved = await proxy.proxySave({
    kind: 'socks5',
    host: 'h.example',
    port: 1080,
    username: 'u',
    password: PASSWORD,
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.proxy.passwordSet, true);
  assert.equal(calls.disconnect, 1);
  assert.equal(calls.reopen, 1);
  const kept = await readProxy(store);
  assert.equal(kept.password, PASSWORD);
  assert.equal((await store.get(PROXY_ID)).id, PROXY_ID);
  // Saving again without a password keeps it; nothing changed: no reconnect.
  const again = await proxy.proxySave({
    kind: 'socks5',
    host: 'h.example',
    port: 1080,
    username: 'u',
  });
  assert.equal((await readProxy(store)).password, PASSWORD);
  assert.equal(calls.disconnect, 1);
  const mt = await proxy.proxySave({
    kind: 'mtproto',
    host: 'm.example',
    port: 443,
    secret: HEX,
  });
  assert.equal(calls.disconnect, 2);
  const everything = JSON.stringify([
    saved,
    again,
    mt,
    await proxy.proxyGet(),
    calls.logs,
  ]);
  assert.equal(everything.includes(PASSWORD), false);
  assert.equal(everything.includes(HEX), false);
  const failed = await proxy.proxySave({
    kind: 'mtproto',
    host: 'm.example',
    port: 443,
    secret: 'zz-not-a-secret-zz',
  });
  assert.deepEqual(failed, { ok: false, code: 'bad-secret' });
  assert.equal(JSON.stringify(failed).includes('zz-not'), false);
  // Back to direct.
  assert.equal((await proxy.proxySave({ kind: 'none' })).proxy.kind, 'none');
});

test('check asks the injected probe, for the given or the saved address', async () => {
  const { calls, proxy } = make();
  assert.deepEqual(
    await proxy.proxyCheck({ host: 'h.example', port: '1080' }),
    {
      ok: true,
      host: 'h.example',
      port: 1080,
      reachable: true,
      ms: 7,
    }
  );
  assert.equal(
    (await proxy.proxyCheck({ host: 'h.example', port: 1 })).reachable,
    false
  );
  assert.equal(
    (await proxy.proxyCheck({ host: 'http://x', port: 1 })).code,
    'bad-host'
  );
  assert.equal(
    (await proxy.proxyCheck({ host: 'x.example', port: 0 })).code,
    'bad-port'
  );
  assert.equal(calls.probes.length, 2);
  await proxy.proxySave({
    kind: 'mtproto',
    host: 's.example',
    port: 1080,
    secret: HEX,
  });
  assert.equal((await proxy.proxyCheck({})).host, 's.example');
});

test('the routes validate bodies and answer without secrets', async () => {
  const { proxy } = make();
  const account = { ...proxy };
  const run = (name, body) => PROXY_POSTS[name](account, body);
  assert.equal((await run('proxy-get', { x: 1 }))[0], 400);
  assert.equal((await run('proxy-save', { kind: 'socks5', extra: 1 }))[0], 400);
  assert.equal((await run('proxy-save', { kind: 5 }))[0], 400);
  assert.equal((await run('proxy-save', []))[0], 400);
  const [status, bad] = await run('proxy-save', {
    kind: 'socks5',
    host: 'ftp://x',
    port: 1,
    password: PASSWORD,
  });
  assert.equal(status, 400);
  assert.equal(bad.code, 'bad-host');
  assert.equal(JSON.stringify(bad).includes(PASSWORD), false);
  const [ok, saved] = await run('proxy-save', {
    kind: 'socks5',
    host: 'h.example',
    port: 1080,
    username: 'u',
    password: PASSWORD,
  });
  assert.equal(ok, 200);
  const [, read] = await run('proxy-get', {});
  assert.equal(JSON.stringify([saved, read]).includes(PASSWORD), false);
  assert.equal(read.proxy.passwordSet, true);
  assert.equal(
    (await run('proxy-check', { host: 'h.example', port: 1080 }))[0],
    200
  );
  assert.equal((await run('proxy-check', { port: true }))[0], 400);
  assert.equal((await run('proxy-get', {}))[0], 200);
  assert.equal((await PROXY_POSTS['proxy-get']({}, {}))[0], 400);
});

test('the routes are reachable through the Telegram handler', async () => {
  const { proxy } = make();
  assert.equal((await post('proxy-get', {}, proxy)).status, 200);
  assert.equal(
    (await post('proxy-save', { kind: 'bogus' }, proxy)).status,
    400
  );
});
