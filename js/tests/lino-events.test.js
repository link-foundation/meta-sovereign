import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { ACCOUNTS_GETS } from '../src/server/routes-telegram-accounts.js';
import { decodeWire, readWireResponse } from '../src/transport/lino.js';

const LINE = 'text/lino-line';
const fixture = async (t, options = {}) => {
  const store = createMemoryStore();
  const server = await startServer({
    store,
    port: 0,
    enableHandlers: false,
    enableSync: false,
    telegramAccount: false,
    automations: { scheduler: false },
    ...options,
  });
  t.after(() => server.close());
  return { store, origin: `http://127.0.0.1:${server.port}` };
};

const collect = async (reader, until) => {
  const decoder = new TextDecoder();
  let text = '';
  for (let i = 0; i < 32 && text.length < 32 * 1024; i += 1) {
    const { value, done } = await reader.read();
    text += decoder.decode(value, { stream: !done });
    if (until(text) || done) {
      return text;
    }
  }
  throw new Error('bounded event fixture did not receive its frame');
};
const dataOf = (text, event, type = LINE) => {
  const frame = text
    .split('\n\n')
    .find((item) => item.startsWith(`event: ${event}\n`));
  assert.ok(frame, `missing ${event} frame`);
  const lines = frame.split('\n');
  assert.equal(
    lines.length,
    2,
    'one physical data line even for multiline messages'
  );
  return decodeWire(lines[1].slice('data: '.length), type, {
    jsonCompatibility: type === 'application/json',
  });
};

test(
  'default events use single-line Lino, filter secrets and preserve origin checks',
  { timeout: 10000 },
  async (t) => {
    const { store, origin } = await fixture(t);
    const response = await fetch(`${origin}/api/events`, { signal: t.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/event-stream/);
    const reader = response.body.getReader();
    t.after(() => reader.cancel());
    const ready = await collect(reader, (text) =>
      text.includes('event: ready')
    );
    assert.ok(dataOf(ready, 'ready').at);
    const link = {
      id: 'msg:telegram:42:1',
      chat: '42',
      body: '你好\nПривет\r\n"quoted"',
    };
    await store.put({ id: 'secret:telegram:private', value: 'never-stream' });
    await store.put(link);
    const text = await collect(reader, (value) =>
      value.includes('event: link')
    );
    assert.deepEqual(dataOf(text, 'link'), { type: 'put', link });
    assert.ok(!text.includes('never-stream'));
    await store.delete(link.id);
    const deleted = await collect(reader, (value) =>
      value.includes('event: link')
    );
    assert.deepEqual(dataOf(deleted, 'link'), { type: 'delete', id: link.id });
    await reader.cancel();
    const denied = await fetch(`${origin}/api/events`, {
      headers: { origin: 'https://untrusted.invalid' },
    });
    assert.equal(denied.status, 403);
  }
);

test(
  'event JSON requires opt-in; Lino browser streams also work with compatibility enabled',
  { timeout: 10000 },
  async (t) => {
    const strict = await fixture(t);
    const denied = await fetch(`${strict.origin}/api/events?format=json`);
    assert.equal(denied.status, 406);
    assert.equal(
      (await readWireResponse(denied)).code,
      'unsupported-event-format'
    );
    const legacy = await fixture(t, { jsonCompatibility: true });
    for (const [query, type] of [
      ['', 'application/json'],
      ['?format=lino-line', LINE],
    ]) {
      const response = await fetch(`${legacy.origin}/api/events${query}`, {
        signal: t.signal,
      });
      const reader = response.body.getReader();
      t.after(() => reader.cancel());
      const ready = await collect(reader, (text) =>
        text.includes('event: ready')
      );
      assert.ok(dataOf(ready, 'ready', type).at);
      assert.equal(response.headers.get('x-lino-event-format'), type);
      await reader.cancel();
    }
  }
);

test('account notification streams follow Lino policy and release watchers', () => {
  for (const [jsonCompatibility, query, type] of [
    [false, '', LINE],
    [true, '', 'application/json'],
    [true, '?format=lino-line', LINE],
  ]) {
    const req = Object.assign(new EventEmitter(), {
      url: `/api/telegram/accounts-events${query}`,
      headers: {},
      lino: { jsonCompatibility },
    });
    const chunks = [];
    let publish;
    let stopped = 0;
    const res = Object.assign(new EventEmitter(), {
      writableLength: 0,
      writeHead: () => {},
      write: (text) => chunks.push(text),
    });
    const ctx = {
      telegramExtras: {
        watch: (fn) => {
          publish = fn;
          return () => {
            stopped += 1;
          };
        },
      },
    };
    assert.equal(ACCOUNTS_GETS['accounts-events'](null, req, res, ctx), true);
    const message = { account: 2, chat: '42', body: '通知\nsecond line' };
    publish(message);
    assert.deepEqual(dataOf(chunks.join(''), 'message', type), message);
    req.emit('close');
    res.emit('error', new Error('fixture closed'));
    assert.equal(stopped, 1, 'cleanup is idempotent');
  }
});
