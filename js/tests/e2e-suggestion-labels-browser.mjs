// Long suggestions expose both ends without changing their complete message.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
await store.put({
  id: 'person:telegram:555',
  source: 'telegram',
  name: 'Suggestion fixture',
});
const prefix = 'Привет! Хотел обсудить помощь с новым проектом. '.repeat(6);
const endings = [
  'Встречаемся в понедельник?',
  'Встречаемся во вторник?',
  'Встречаемся в среду?',
];
const candidates = endings.map((end) => `${prefix}${end}`);
const { page, base, until, finish } = await openChatApp('suggestion-labels', {
  store,
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
  globalThis.localStorage.setItem('metaSovereignReadReceipts', 'off');
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
});
await page.route('**/api/suggest?*', (route) =>
  fulfil(route, {
    stage: 'message',
    suggestions: [
      ...candidates,
      candidates[0],
      candidates[1].toUpperCase(),
      'Привет!',
    ].map((text) => ({ kind: 'message', text, count: 1 })),
  })
);

const labels = () =>
  page.locator('.suggestions button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const node = button.querySelector('.middle-ellipsis > span');
      const range = globalThis.document.createRange();
      range.selectNodeContents(node);
      return {
        text: node.textContent,
        full: button.getAttribute('aria-label'),
        title: button.title,
        fits: range.getBoundingClientRect().width <= node.clientWidth + 1,
      };
    })
  );
const fitted = async () => {
  await until(async () => {
    const items = await labels();
    return (
      items.length === 4 &&
      items.slice(0, 3).every((item, i) => {
        const [head, tail] = item.text.split('…');
        return (
          item.fits &&
          head?.length > 3 &&
          tail?.length > 3 &&
          candidates[i].startsWith(head) &&
          candidates[i].endsWith(tail)
        );
      })
    );
  }, 'long labels show a fitted beginning and ending');
  const items = await labels();
  assert(
    new Set(items.map((item) => item.text)).size === 4,
    'endings distinguish the choices'
  );
  for (let i = 0; i < candidates.length; i++) {
    assert(
      items[i].full === candidates[i],
      'the accessible name keeps the full message'
    );
    assert(
      items[i].title.startsWith(candidates[i]),
      'the tooltip exposes the full message'
    );
  }
  assert(items[3].text === 'Привет!', 'short suggestions stay intact');
  return items;
};

await finish(async () => {
  await page.goto(`${base}/#chat=telegram:555`);
  const box = page.locator('.chat-composer textarea');
  await box.fill('При');
  const desktop = await fitted();
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await fitted();
  assert(
    phone[0].text.length < desktop[0].text.length,
    'narrow panes recompute the preview'
  );
  await page.setViewportSize({ width: 1200, height: 800 });
  await until(
    async () => (await labels())[0].text === desktop[0].text,
    'labels expand again'
  );
  await page.evaluate(() => {
    globalThis.document.documentElement.style.fontSize = '20px';
  });
  await fitted();
  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }
  await page.locator('.suggestions button').nth(1).click();
  assert(
    (await box.inputValue()) === candidates[1],
    'click inserts the complete message'
  );
  assert(
    (await store.query((link) => link.id.startsWith('msg:'))).length === 0,
    'choosing a suggestion never sends it'
  );
});
