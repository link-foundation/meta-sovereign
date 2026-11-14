// Actual EventSource -> production route -> Lino browser decoder. No accounts.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
const { page, base, until, finish } = await openChatApp('lino-events', {
  store,
});

await finish(async () => {
  await page.goto(`${base}/#settings`);
  await page.waitForFunction(() => !!globalThis.__msApi);
  await page.evaluate(async () => {
    globalThis.__wireEvents = [];
    globalThis.__wireStates = [];
    globalThis.__stopWireEvents = await globalThis.__msApi.events(
      (event) => globalThis.__wireEvents.push(event),
      (state) => globalThis.__wireStates.push(state)
    );
  });
  await until(
    () => page.evaluate(() => globalThis.__wireStates.includes('open')),
    'event stream open'
  );
  const link = {
    id: 'msg:telegram:42:wire-fixture',
    source: 'telegram',
    chat: '42',
    body: '你好\nПривет\r\n"quoted"',
  };
  await store.put({ id: 'secret:wire-fixture', value: 'private fixture' });
  await store.put(link);
  await until(
    () => page.evaluate(() => globalThis.__wireEvents.length === 1),
    'Lino message delivered'
  );
  const received = await page.evaluate(() => globalThis.__wireEvents[0]);
  assert(
    received.type === 'put' && received.link.body === link.body,
    'multiline Unicode round-trip'
  );
  await store.delete(link.id);
  await until(
    () => page.evaluate(() => globalThis.__wireEvents.length === 2),
    'Lino deletion delivered'
  );
  const deleted = await page.evaluate(() => globalThis.__wireEvents[1]);
  assert(
    deleted.type === 'delete' && deleted.id === link.id,
    'deletion round-trip'
  );
  await page.evaluate(() => globalThis.__stopWireEvents());
});
