import { createMemoryStore } from '../src/storage/universal.js';
import { openChatApp, fulfil, assert } from './helpers/e2e-chat.mjs';
const store = createMemoryStore();
await store.put({
  id: 'msg:telegram:7:1',
  source: 'telegram',
  chat: '7',
  chatType: 'personal_chat',
  chatName: 'Collection fixture',
  sender: '7',
  body: 'Hello',
  timestamp: '2026-10-31T00:00:00Z',
});
const { page, base, until, finish } = await openChatApp('sticker-collections', {
  store,
});
const sticker = (id, emoji) => ({ id, emoji, kind: 'sticker', format: 'webp' });
const items = [sticker('1001', '👋'), sticker('1002', '🎂')];
const sent = [];
await page.route('**/api/telegram/send-document', (route) => {
  sent.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, chat: '7' });
});
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1kAAAAASUVORK5CYII=',
  'base64'
);
await page.route('https://vk.com/**', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: png })
);
await page.route('**/api/telegram/stickers', (route) =>
  fulfil(route, {
    ok: true,
    faved: items,
    recent: [],
    sets: [{ id: '7', title: 'Fixture pack' }],
  })
);
await page.route('**/api/telegram/sticker-search', (route) =>
  fulfil(route, { ok: true, stickers: [items[0]], sets: [] })
);
await page.route('**/api/telegram/sticker-set', (route) =>
  fulfil(route, { ok: true, stickers: items })
);
await page.route('**/api/telegram/sticker?*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: png })
);
await finish(async () => {
  await page.goto(`${base}/#/greetings`);
  const screen = page.locator('[data-sticker-collections]');
  await screen
    .getByRole('heading', { name: 'Stickers', exact: true })
    .waitFor();
  const collection = screen.locator('[data-collection-field="collection"]');
  await collection.selectOption('telegram:greeting');
  const wave = screen.locator('[data-collection-sticker="telegram:1001"]');
  await wave.waitFor();
  assert(
    (await wave.getAttribute('aria-pressed')) === 'true',
    'greeting identified from metadata'
  );
  const birthday = screen.locator('[data-collection-sticker="telegram:1002"]');
  assert(
    (await birthday.getAttribute('aria-pressed')) === 'false',
    'birthday is not a greeting'
  );
  await wave.click();
  assert(
    (await wave.getAttribute('aria-pressed')) === 'false',
    'manual exclusion persists'
  );
  await screen.locator('[data-action="collections-save"]').click();
  await until(
    async () =>
      (await store.get('stickers:collections'))?.collections.find(
        (c) => c.id === 'telegram:greeting'
      )?.automatic === false,
    'manual collection saved'
  );
  await screen.locator('[data-action="collection-add"]').click();
  await screen
    .locator('[data-collection-field="name"]')
    .fill('Birthday favourites');
  await screen
    .locator('[data-collection-field="category"]')
    .selectOption('birthday');
  await screen.locator('[data-collection-field="automatic"]').check();
  await screen.locator('[data-action="collections-save"]').click();
  await until(
    async () =>
      (await store.get('stickers:collections'))?.collections.some(
        (c) =>
          c.name === 'Birthday favourites' &&
          c.stickers.some((s) => s.id === '1002')
      ),
    'birthday collection saved'
  );
  await page.reload();
  await collection.waitFor();
  assert(
    (await collection.textContent()).includes('Birthday favourites'),
    'saved collection survives reload'
  );
  await page.locator('[data-view="chat"]').click();
  await page.locator('[data-chat="telegram:7"]').click();
  await page.locator('[data-action="emoji"]').click();
  await page.locator('.emoji-panel [data-tab="stickers"]').click();
  const picker = page.locator('.chat-sticker-collections');
  await picker
    .getByRole('combobox')
    .selectOption({ label: 'Birthday favourites' });
  await picker.locator('[data-sticker="1002"]').click();
  await until(
    async () => sent.length === 1,
    'collection sticker send confirmed by fixture'
  );
  assert(sent[0].id === '1002', 'the selected provider sticker is sent');
});
