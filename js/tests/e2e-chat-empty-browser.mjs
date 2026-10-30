// Empty conversations share the loader's usable pane and preserve typing.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
const message = (chat) => ({
  id: `msg:telegram:${chat}:1`,
  source: 'telegram',
  chat,
  chatType: 'personal_chat',
  sender: chat,
  body: 'A fixture message',
  timestamp: new Date().toISOString(),
  raw: { id: 1 },
});
await store.putMany([
  message('888'),
  { id: 'person:telegram:555', source: 'telegram', name: 'Empty fixture' },
  { id: 'person:telegram:777', source: 'telegram', name: 'Business fixture' },
]);
const { page, base, until, finish } = await openChatApp('chat-empty', {
  store,
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
  globalThis.localStorage.setItem('metaSovereignReadReceipts', 'off');
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
});
let hold = true;
const readers = [];
await page.route('**/api/telegram/history', async (route) => {
  if (hold && route.request().postDataJSON()?.chat === '555') {
    await new Promise((resolve) => readers.push(resolve));
  }
  return fulfil(route, { written: 0, cached: true, complete: true });
});
await page.route('**/api/telegram/business-profile', (route) => {
  const business = route.request().postDataJSON()?.chat === '777';
  return fulfil(route, {
    ok: true,
    intro: business
      ? { title: 'Welcome!', description: 'Ask me anything' }
      : null,
  });
});
await page.route('**/api/suggest?*', (route) => {
  const typed = new URL(route.request().url()).searchParams.get('typed') ?? '';
  return fulfil(route, {
    stage: 'reply',
    suggestions: typed.startsWith('Поздравляю')
      ? [
          { text: 'Поздравляю с днём рождения 🙂', count: 1 },
          { text: 'Поздравляю, желаю радости и удачи во всём 🥳', count: 1 },
        ]
      : [],
  });
});

const position = (selector) =>
  page.locator(selector).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const scroll = node.closest('.chat-scroll');
    const pane = scroll.getBoundingClientRect();
    const style = globalThis.getComputedStyle(scroll);
    const top = pane.top + parseFloat(style.paddingTop);
    const bottom = pane.bottom - parseFloat(style.paddingBottom);
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      wantedX: pane.left + pane.width / 2,
      wantedY: (top + bottom) / 2,
      bottom: rect.bottom,
      composerTop: globalThis.document
        .querySelector('.chat-composer')
        .getBoundingClientRect().top,
    };
  });
const centered = async (selector) => {
  await until(async () => {
    const at = await position(selector);
    return (
      Math.abs(at.x - at.wantedX) < 3 &&
      Math.abs(at.y - at.wantedY) < 3 &&
      at.bottom < at.composerTop - 8
    );
  }, `${selector} is centered above the composer`);
};

await finish(async () => {
  await page.goto(`${base}/#chat=telegram:555`);
  await page.locator('.chat-empty-region [data-older="loading"]').waitFor();
  await centered('.chat-empty-region .chat-older');
  assert(
    (await page.locator('.chat-empty-title').count()) === 0,
    'loading never claims no messages'
  );
  hold = false;
  readers.splice(0).forEach((resolve) => resolve());
  await page.locator('.chat-empty-title').waitFor();
  await centered('.chat-empty');
  assert(
    (await page.locator('.chat-empty button').count()) === 0,
    'the composer remains the primary action'
  );
  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }
  const box = page.locator('.chat-composer textarea');
  await box.fill('Поздравляю');
  await until(
    async () => (await page.locator('.suggestions button').count()) === 2,
    'suggestions are visible'
  );
  await centered('.chat-empty');
  assert(
    await box.evaluate((node) => node === globalThis.document.activeElement),
    'empty state does not steal typing focus'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await centered('.chat-empty');
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.evaluate(() => {
    globalThis.document.documentElement.dataset.theme = 'light';
  });
  await centered('.chat-empty');
  await store.put(message('555'));
  await page.locator('[data-row="msg:telegram:555:1"]').waitFor();
  assert(
    (await page.locator('.chat-empty-region').count()) === 0,
    'the first message replaces the empty state'
  );
  assert(
    (await box.inputValue()) === 'Поздравляю',
    'an incoming message preserves the draft'
  );
  await page.goto(`${base}/#chat=telegram:777`);
  await page.locator('[data-business="intro"]').waitFor();
  await centered('[data-business="intro"]');
  assert(
    (await page.locator('.chat-empty-title').count()) === 0,
    'business introductions replace the generic state'
  );
});
