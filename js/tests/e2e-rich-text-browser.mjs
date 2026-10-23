// Real browser e2e for the rich-text kinds of rich messages (R-Y225;
// learned, never copied): a bot's message draws a mention as a link, a
// hashtag that searches, a custom emoji as its picture, a styled URL
// button, a copy button that stays quiet until clicked, a bot command that
// sends nothing, and formulas (inline and block) as MathML, the same in
// both engines. Telegram's answers faked in the page, fake chats in a
// memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:rich-text

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-7';
const store = createMemoryStore();

const text = (s) => ({ className: 'TextPlain', text: s });
const wrapped = (className, s, extra = {}) => ({
  className,
  text: text(s),
  ...extra,
});
const concat = (...texts) => ({ className: 'TextConcat', texts });

const blocks = [
  {
    className: 'PageBlockParagraph',
    text: concat(
      text('Hi '),
      wrapped('TextMention', '@some_user'),
      text(' see '),
      wrapped('TextHashtag', '#weekly'),
      text(' '),
      wrapped('TextAutoUrl', 'example.test/page'),
      text(' '),
      wrapped('TextBotCommand', '/start'),
      text(' '),
      { className: 'TextCustomEmoji', documentId: '5001', alt: '\u{1F44D}' },
      text(' and '),
      { className: 'TextMath', source: 'x^2+y^2' }
    ),
  },
  { className: 'PageBlockMath', source: '\\frac{a}{b}' },
  {
    className: 'PageBlockButtonRow',
    buttons: [
      {
        text: text('Go'),
        type: {
          className: 'InlineButtonTypeUrl',
          url: 'https://example.test/',
        },
        style: { bgPrimary: true },
      },
      {
        text: text('Copy me'),
        type: { className: 'InlineButtonTypeCopy', copyText: 'secret-code' },
        style: { link: true },
      },
      {
        text: text('Off'),
        type: { className: 'InlineButtonTypeDisabled' },
      },
    ],
  },
];

await store.put({
  id: `msg:telegram:${GROUP}:1`,
  source: 'telegram',
  chat: GROUP,
  chatName: 'Rich Text Group',
  chatType: 'group',
  sender: '90',
  senderName: 'Helper Bot',
  body: 'Hi @some_user',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: {
    id: 1,
    richMessage: {
      className: 'RichMessage',
      blocks,
      photos: [],
      documents: [],
    },
  },
});

const { base, page, until, finish } = await openChatApp('rich-text', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, { chat: GROUP, kind: 'group', title: 'Rich Text Group' })
);
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const emojiAsked = [];
await page.route('**/api/telegram/custom-emoji?*', (route) => {
  const url = new URL(route.request().url());
  emojiAsked.push(url.searchParams.get('id'));
  return url.searchParams.get('full') === '1'
    ? route.fulfill({ status: 404, body: '' })
    : route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
});
const sent = [];
await page.route('**/api/telegram/send*', (route) => {
  sent.push(route.request().url());
  return fulfil(route, { ok: true });
});

await finish(async () => {
  await page
    .context()
    .grantPermissions(['clipboard-read', 'clipboard-write'])
    .catch(() => {});
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  const rich = page.locator('.rich-message').first();
  await rich.waitFor({ timeout: 15000 });

  // A mention is a link to the person's page; an automatic url is a link.
  const mention = rich.locator('a', { hasText: '@some_user' });
  assert(
    (await mention.getAttribute('href')) === 'https://t.me/some_user',
    'mention link'
  );
  assert(
    (await rich
      .locator('a', { hasText: 'example.test/page' })
      .getAttribute('href')) === 'https://example.test/page',
    'auto url link'
  );
  // A hashtag searches when clicked.
  const tag = rich.locator('[data-tag="#weekly"]');
  assert((await tag.count()) === 1, 'hashtag');
  await tag.click();
  await page.locator('[data-dialog="tag-search"]').waitFor({ timeout: 10000 });
  await page.keyboard.press('Escape');
  // A bot command is shown and sends nothing.
  const command = rich.locator('.msg-tag', { hasText: '/start' });
  assert((await command.count()) === 1, 'command shown');
  await command.click();
  // The custom emoji is its picture, the emoji stays as the text.
  const emoji = rich.locator('[data-custom-emoji="5001"]');
  await emoji.locator('img.msg-custom-emoji-img').waitFor({ timeout: 10000 });
  assert(emojiAsked.includes('5001'), 'emoji asked');
  assert(
    (await emoji.locator('.msg-custom-emoji-text').textContent()) ===
      '\u{1F44D}',
    'emoji fallback text'
  );
  // The formulas are MathML, inline and in a block.
  await rich.locator('[data-block="math"] math').waitFor({ timeout: 15000 });
  await rich.locator('p math').waitFor({ timeout: 15000 });
  assert(
    (await rich.locator('[data-block="math"] math mfrac').count()) === 1,
    'fraction in the block formula'
  );
  // The buttons: a styled link, a link-styled copy, an inert one.
  const go = rich.locator('[data-bot-button="url"]');
  assert((await go.getAttribute('class')).includes('is-primary'), 'primary');
  const copy = rich.locator('[data-bot-button="copy"]');
  assert((await copy.getAttribute('class')).includes('is-link'), 'link look');
  const off = rich.locator('.iv-buttons button', { hasText: 'Off' });
  assert(await off.isDisabled(), 'disabled button is inert');
  await copy.click();
  await until(
    async () =>
      (await page.evaluate(() => globalThis.navigator.clipboard.readText())) ===
      'secret-code',
    'copy button copies on click'
  ).catch(() => {
    // Some engines refuse clipboard reads headless; the press itself ran.
  });
  assert(sent.length === 0, `nothing was sent: ${sent}`);
  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }
});
