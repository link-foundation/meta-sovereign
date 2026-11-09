// Two isolated browser stores converge only through the real WebRTC channel.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';
import { watchChatPages } from './helpers/e2e-page-errors.mjs';

const store = createMemoryStore();
const { page, base, until, finish, errors, engine } = await openChatApp(
  'lino-sync',
  {
    store,
    serverOptions: { enableSync: true },
  }
);
await finish(async () => {
  const browser = page.context().browser();
  const context = await browser.newContext();
  watchChatPages(context, { errors, engine, base });
  const other = await context.newPage();
  try {
    // Record actual wire frames and negotiated protocols without replacing sockets.
    for (const target of [page, other]) {
      await target.addInitScript(() => {
        globalThis.__syncWire = [];
        const Native = globalThis.WebSocket;
        globalThis.WebSocket = class extends Native {
          constructor(...args) {
            super(...args);
            this.addEventListener('open', () =>
              globalThis.__syncWire.push({ protocol: this.protocol })
            );
            this.addEventListener('message', (event) =>
              globalThis.__syncWire.push({
                text: typeof event.data === 'string',
                data: event.data,
              })
            );
          }
        };
      });
      await target.goto(`${base}/#settings`);
      await target.waitForFunction(() => !!globalThis.__msApi);
      await target.evaluate(() => globalThis.__msApi.status());
    }
    const link = {
      id: 'l:rtc-lino-fixture',
      tokens: ['wire', '🚀'],
      body: '你好\r\nПривет "quoted"',
      single: [true],
      empty: [],
    };
    await page.evaluate(async (value) => {
      await globalThis.__msApi.put({
        id: 'secret:rtc-fixture',
        value: 'private fixture',
      });
      await globalThis.__msApi.put(value);
    }, link);
    await until(
      () =>
        other.evaluate(
          async (id) => (await globalThis.__msApi.get(id))?.body,
          link.id
        ),
      'WebRTC convergence',
      20000
    );
    const received = await other.evaluate(
      (id) => globalThis.__msApi.get(id),
      link.id
    );
    assert(
      received.body === link.body &&
        received.single[0] === true &&
        received.empty.length === 0,
      'exact typed Unicode record'
    );
    assert(
      !(await other.evaluate(() =>
        globalThis.__msApi.get('secret:rtc-fixture')
      )),
      'secrets excluded'
    );
    assert(
      !(await store.get(link.id)),
      'convergence uses the data channel, not a server write'
    );
    for (const target of [page, other]) {
      const frames = await target.evaluate(() => globalThis.__syncWire);
      assert(
        frames.some(
          (frame) => frame.protocol === 'meta-sovereign-sync.lino.v2'
        ),
        'explicit Lino signaling protocol'
      );
      assert(
        frames.some((frame) => frame.text && frame.data.includes('sdp')),
        'actual Lino SDP received'
      );
      assert(
        frames
          .filter((frame) => frame.text)
          .every((frame) => !frame.data.trim().startsWith('{')),
        'signaling does not use JSON'
      );
    }
    await page.evaluate((id) => globalThis.__msApi.del(id), link.id);
    await until(
      () =>
        other.evaluate(
          async (id) => !(await globalThis.__msApi.get(id)),
          link.id
        ),
      'WebRTC deletion'
    );
  } finally {
    await context.close();
  }
});
