// Long suggestions expose both ends without changing their complete message.
import { createMemoryStore } from '../src/storage/universal.js';
import { buildReplyIndex } from '../src/replies/reply-graph.js';
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
const wordModel = buildReplyIndex(
  ['Подготовим материалы.', 'Обсудим детали.', 'Согласуем время.'].map(
    (body, n) => ({
      id: `msg:telegram:999:${n}`,
      source: 'telegram',
      chat: '999',
      sender: 'me',
      body,
      timestamp: new Date(1700000000000 + n * 1000).toISOString(),
    })
  )
);
const { page, base, until, finish } = await openChatApp('suggestion-labels', {
  store,
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
  globalThis.localStorage.setItem('metaSovereignReadReceipts', 'off');
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
});
const queries = [];
await page.route('**/api/suggest?*', (route) => {
  const typed = new URL(route.request().url()).searchParams.get('typed') ?? '';
  queries.push(typed);
  if (typed.includes('\n')) {
    const result = wordModel.autocomplete({ typed });
    // An older server can still return low-value predictions; the UI must filter them.
    return fulfil(route, {
      ...result,
      suggestions: [
        ...['И', 'Я', 'А'].map((word) => ({
          kind: 'word',
          text: `${typed} ${word}`,
          word,
          insert: ` ${word}`,
          count: 100,
        })),
        ...result.suggestions,
      ],
    });
  }
  return fulfil(route, {
    stage: 'message',
    suggestions: [
      ...candidates,
      candidates[0],
      candidates[1].toUpperCase(),
      'Привет!',
    ].map((text) => ({ kind: 'message', text, count: 1 })),
  });
});

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

const previewOnly = async (box) => {
  const first = page.locator('.suggestions button').first();
  await first.hover();
  await first.focus();
  assert(
    (await box.inputValue()) === 'При',
    'hover and focus do not select a suggestion'
  );
  await box.press('Tab');
  assert(
    (await box.inputValue()) === 'При',
    'Tab never fills the first suggestion'
  );
  assert(
    await box.evaluate((node) => node !== globalThis.document.activeElement),
    'Tab moves focus normally'
  );
  await box.press('Shift+Tab');
  assert(
    (await box.inputValue()) === 'При',
    'reverse focus navigation keeps the draft'
  );
};

await finish(async () => {
  await page.goto(`${base}/#chat=telegram:555`);
  const box = page.locator('.chat-composer textarea');
  await box.waitFor();
  assert(
    (await box.inputValue()) === '',
    'loading suggestions never prefills an empty composer'
  );
  await box.fill('При');
  const desktop = await fitted();
  await previewOnly(box);
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
  const draft = 'Привет\nМожешь помочь с настройкой учебного проекта?';
  await box.fill(draft);
  await until(
    () => queries.includes(draft),
    'finished sentence receives server predictions'
  );
  await page.waitForTimeout(100);
  assert(
    (await page.locator('.suggestions button').count()) === 0,
    'a finished sentence has no random word strip'
  );
  assert(
    (await box.inputValue()) === draft,
    'a late suggestion response preserves the draft'
  );
  const nextSentence = `${draft} `;
  await box.fill(nextSentence);
  const words = page.locator('.suggestion-words button');
  await until(
    async () => (await words.count()) === 3,
    'generated words have their own strip'
  );
  assert(
    JSON.stringify(await words.allTextContents()) ===
      JSON.stringify(['Подготовим', 'Обсудим', 'Согласуем']),
    'only useful words survive, including when the server returns single letters'
  );
  assert(
    (await page.locator('.suggestion-kind').textContent()) === 'Next word',
    'word provenance is visible'
  );
  assert(
    (await page.locator('.suggestion-messages').count()) === 0,
    'no historical sentence is invented'
  );
  assert(
    !(await words.first().getAttribute('title')).includes('Used'),
    'prediction frequency never claims the whole sentence was sent'
  );
  await until(
    () => box.evaluate((node) => node.scrollHeight <= node.clientHeight + 1),
    'multiline draft is visible'
  );
  if (process.env.E2E_SHOT) {
    await page.screenshot({
      path: process.env.E2E_SHOT.replace(/\.png$/, '-words.png'),
    });
  }
  await words.first().click();
  assert(
    (await box.inputValue()) === `${nextSentence}Подготовим`,
    'next-word choice preserves the entire draft'
  );
  await box.fill(nextSentence);
  await until(
    async () => (await words.count()) === 3,
    'word suggestions return'
  );
  await box.press('Tab');
  assert(
    (await box.inputValue()) === nextSentence,
    'Tab does not accept a word prediction'
  );
  await words.first().focus();
  await words.first().press('Enter');
  assert(
    (await box.inputValue()) === `${nextSentence}Подготовим`,
    'Enter on a focused option explicitly selects it'
  );
  await until(
    () =>
      box.evaluate(
        (node) =>
          node === globalThis.document.activeElement &&
          node.selectionStart === node.value.length
      ),
    'explicit selection returns focus and the caret to the draft'
  );
  await box.fill(nextSentence);
  await until(
    async () => (await words.count()) === 3,
    'word choices return for Space activation'
  );
  await words.nth(1).focus();
  await words.nth(1).press('Space');
  assert(
    (await box.inputValue()) === `${nextSentence}Обсудим`,
    'Space on a focused option explicitly selects it'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await until(
    () =>
      box.evaluate((node) => {
        const maximum = parseFloat(globalThis.getComputedStyle(node).maxHeight);
        return (
          node.scrollHeight <= node.clientHeight + 1 ||
          Math.abs(node.offsetHeight - maximum) < 1
        );
      }),
    'phone wrapping grows to fit or reaches the scrollable height limit'
  );
  await box.fill('Hello');
  await until(
    () => box.evaluate((node) => node.clientHeight < 50),
    'short drafts shrink back to one row'
  );
  assert(
    (await store.query((link) => link.id.startsWith('msg:'))).length === 0,
    'choosing a suggestion never sends it'
  );
});
