// Real browser e2e for rich messages (R-Y220): layer 232 lets a message
// carry page blocks instead of text. In a group, a bot's message shows
// headings, a folded "Thinking…" part, a formula, a task list, a quote, a
// file and a button row, drawn as a normal bubble; a message still being
// written ends in "…"; a layer-232 inline keyboard under it works; a
// reply's rich quote shows its words. Telegram's answers faked in the
// page, fake chats in a memory store, a server on a free port, a headless
// browser; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:rich-messages

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-5';
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - 60_000 * (100 - n)).toISOString();

const text = (s) => ({ className: 'TextPlain', text: s });
const bold = (s) => ({ className: 'TextBold', text: text(s) });
const block = (className, extra = {}) => ({ className, ...extra });

const rich = (blocks, extra = {}) => ({
  className: 'RichMessage',
  blocks,
  photos: [],
  documents: [],
  ...extra,
});

const whole = rich(
  [
    block('PageBlockHeading1', { text: text('Plan of the day') }),
    block('PageBlockParagraph', {
      text: { className: 'TextConcat', texts: [text('First '), bold('bold')] },
    }),
    block('PageBlockThinking', { text: text('weighing two options') }),
    block('PageBlockMath', { source: 'E = mc^2' }),
    block('PageBlockList', {
      items: [
        {
          className: 'PageListItemText',
          checkbox: true,
          checked: true,
          text: text('wake up'),
        },
        {
          className: 'PageListItemText',
          checkbox: true,
          checked: false,
          text: text('write code'),
        },
      ],
    }),
    block('PageBlockBlockquoteBlocks', {
      blocks: [block('PageBlockParagraph', { text: text('quoted blocks') })],
      caption: text('someone'),
    }),
    block('PageBlockPhoto', {
      photoId: '55',
      caption: { text: text('a picture'), credit: { className: 'TextEmpty' } },
    }),
    block('PageBlockDocument', {
      documentId: '77',
      caption: { text: { className: 'TextEmpty' }, credit: null },
    }),
    block('PageBlockButtonRow', {
      alignCenter: true,
      buttons: [
        {
          text: text('Open docs'),
          type: {
            className: 'InlineButtonTypeUrl',
            url: 'https://example.test/d',
          },
        },
        {
          text: text('Answer'),
          type: {
            className: 'InlineButtonTypeCallback',
            data: { bytes: 'YQ==' },
          },
        },
      ],
    }),
  ],
  {
    photos: [{ className: 'Photo', id: '55', sizes: [] }],
    documents: [
      {
        className: 'Document',
        id: '77',
        mimeType: 'application/pdf',
        size: '2048',
        attributes: [
          { className: 'DocumentAttributeFilename', fileName: 'plan.pdf' },
        ],
      },
    ],
  }
);

const message = (id, body, raw, sender = '90') => ({
  id: `msg:telegram:${GROUP}:${id}`,
  source: 'telegram',
  chat: GROUP,
  chatName: 'Fake Group',
  chatType: 'group',
  sender,
  senderName: 'Helper Bot',
  body,
  timestamp: at(id),
  raw: { id, ...raw },
});

await store.put(message(1, 'earlier words', {}, '31'));
await store.put(
  message(2, 'Plan of the day\nFirst bold', {
    richMessage: whole,
    replyMarkup: {
      className: 'ReplyInlineMarkup',
      rows: [
        {
          buttons: [
            {
              className: 'KeyboardInlineButton',
              text: 'Layer 232 button',
              type: {
                className: 'InlineButtonTypeUrl',
                url: 'https://example.test/k',
              },
            },
          ],
        },
      ],
    },
  })
);
await store.put(
  message(3, 'Writing', {
    richMessage: rich(
      [block('PageBlockParagraph', { text: text('Typing the answer') })],
      { part: true }
    ),
  })
);
await store.put(
  message(4, 'مرحبا', {
    richMessage: rich(
      [block('PageBlockParagraph', { text: text('مرحبا بالعالم') })],
      { rtl: true }
    ),
  })
);
await store.put(
  message(
    5,
    'and a reply',
    {
      replyTo: {
        replyToMsgId: 1,
        quoteRich: [text('quoted rich words')],
      },
    },
    '31'
  )
);

const { base, page, until, finish } = await openChatApp('rich-messages', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, { chat: GROUP, kind: 'group', title: 'Fake Group' })
);
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const mediaAsked = [];
await page.route('**/api/telegram/media*', (route) => {
  mediaAsked.push(new URL(route.request().url()).searchParams.get('rich'));
  return route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
});
const pressed = [];
await page.route('**/api/telegram/bot-callback', (route) => {
  pressed.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, kind: 'none' });
});

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  const box = page.locator('.rich-message').first();
  await box.waitFor({ timeout: 15000 });

  const first = page.locator('.rich-message[data-rich="whole"]').first();
  assert((await first.locator('h1').textContent()) === 'Plan of the day', 'h1');
  assert((await first.locator('strong').textContent()) === 'bold', 'bold run');
  // Thinking is folded by default and opens on a click.
  const thinking = first.locator('details[data-block="thinking"]');
  assert((await thinking.getAttribute('open')) === null, 'thinking folded');
  assert(
    (await thinking.locator('summary').textContent()).length > 0,
    'thinking summary'
  );
  await thinking.locator('summary').click();
  await until(
    async () => (await thinking.getAttribute('open')) !== null,
    'thinking opens'
  );
  assert(
    (await thinking.textContent()).includes('weighing two options'),
    'thinking words'
  );
  // The formula stays LaTeX text.
  assert(
    (await first.locator('[data-block="math"]').textContent()) === 'E = mc^2',
    'math source'
  );
  // The task list has its boxes, one ticked.
  const boxes = first.locator('.iv-task-box');
  assert((await boxes.count()) === 2, 'two boxes');
  assert(await boxes.nth(0).isChecked(), 'first ticked');
  assert(!(await boxes.nth(1).isChecked()), 'second open');
  assert(
    (await first.locator('blockquote').textContent()).includes('quoted blocks'),
    'quote of blocks'
  );
  // Its picture is asked from the rich route.
  await first.locator('img.iv-img').waitFor({ timeout: 5000 });
  assert(mediaAsked.includes('photo:55'), `media: ${mediaAsked}`);
  // The file row names the document.
  const file = first.locator('[data-block="file"]');
  assert((await file.textContent()).includes('plan.pdf'), 'file name');
  assert((await file.textContent()).includes('2.0 KB'), 'file size');
  // The buttons: a link and a callback.
  const buttons = first.locator('[data-block="buttons"] [data-bot-button]');
  assert((await buttons.count()) === 2, 'two buttons');
  assert(
    (await buttons.nth(0).getAttribute('data-bot-button')) === 'url',
    'url'
  );
  await buttons.nth(1).click();
  await until(() => pressed.length === 1, 'callback sent');
  // The layer-232 inline keyboard under the bubble.
  const keyboard = page.locator(
    `[data-bot-keyboard="msg:telegram:${GROUP}:2"] [data-bot-button="url"]`
  );
  await keyboard.waitFor({ timeout: 5000 });
  assert(
    (await keyboard.textContent()).includes('Layer 232 button'),
    'inline keyboard'
  );

  // A message still being written ends in "…".
  const part = page.locator('.rich-message[data-rich="part"]');
  await part.waitFor({ timeout: 5000 });
  assert((await part.locator('.rich-part').textContent()) === '…', 'part mark');
  // Right to left.
  assert(
    (await page
      .locator('.rich-message', { hasText: 'مرحبا بالعالم' })
      .getAttribute('dir')) === 'rtl',
    'rtl'
  );
  // A reply's rich quote shows its words.
  await until(
    async () =>
      (await page.locator('body').textContent()).includes('quoted rich words'),
    'rich quote'
  );
  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }
});
