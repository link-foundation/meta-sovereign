// Real browser e2e for forward options and message links (R-Y154), as
// Telegram Desktop has them: picking the chat for a forward opens it with
// a bar over the box ("Forward n messages", the senders, a menu with Hide
// sender's name, Hide captions and Choose another chat); what is typed is
// sent first, then the forward goes with the chosen flags. "Copy link" in
// a supergroup's menu copies the link Telegram exports, and a click on a
// t.me/c link in a message opens that message in a chat the app knows.
// Telegram's answers are recorded fakes in the page, the chats fakes in a
// memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:forward-options

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const SRC = '-1001111';
const DST = '42';
const PRIVATE = '-1005555';
const URL_TEXT = 'https://t.me/c/5555/7';
const store = createMemoryStore();
const stamp = (n) => new Date(Date.now() - (100 - n) * 60_000).toISOString();
const put = (chat, name, type, id, extra = {}) =>
  store.put({
    id: `msg:telegram:${chat}:${id}`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: type,
    sender: 'u1',
    senderName: 'Alice',
    body: `message number ${id}`,
    timestamp: stamp(id),
    raw: { id },
    ...extra,
  });
await put(SRC, 'Source Group', 'supergroup', 1);
await put(SRC, 'Source Group', 'supergroup', 2);
await put(SRC, 'Source Group', 'supergroup', 3, {
  body: `see ${URL_TEXT} please`,
  raw: {
    id: 3,
    entities: [
      { className: 'MessageEntityUrl', offset: 4, length: URL_TEXT.length },
    ],
  },
});
await put(SRC, 'Source Group', 'supergroup', 4, {
  senderName: 'Bob',
  body: 'a caption',
  raw: {
    id: 4,
    media: {
      className: 'MessageMediaDocument',
      document: {
        id: '9',
        mimeType: 'application/pdf',
        size: 1000,
        attributes: [
          { className: 'DocumentAttributeFilename', fileName: 'paper.pdf' },
        ],
      },
    },
  },
});
await put(DST, 'Dest Friend', 'private', 1, { sender: DST });
for (let i = 1; i <= 30; i += 1) {
  await put(PRIVATE, 'Private Club', 'supergroup', i);
}

const { engine, base, page, until, finish } = await openChatApp(
  'forward-options',
  { store }
);
await page.addInitScript(() => {
  // Every message that was ever highlighted by a jump.
  globalThis.__found = [];
  new globalThis.MutationObserver((records) => {
    for (const r of records) {
      const node = r.target;
      if (node.classList?.contains('is-found') && node.dataset.message) {
        globalThis.__found.push(node.dataset.message);
      }
    }
  }).observe(document, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
});
if (engine === 'chromium') {
  await page
    .context()
    .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
}

// What the fake Telegram was asked, in order.
const events = [];
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(route, { chat, kind: 'group', title: 'Chat' });
});
await page.route('**/api/send', (route) => {
  events.push(['send', route.request().postDataJSON()]);
  return fulfil(route, { status: 'sent', links: [] });
});
await page.route('**/api/telegram/forward', (route) => {
  events.push(['forward', route.request().postDataJSON()]);
  return fulfil(route, { ok: true, forwarded: 1 });
});
await page.route('**/api/telegram/message-link', (route) => {
  events.push(['message-link', route.request().postDataJSON()]);
  return fulfil(route, { ok: true, link: 'https://t.me/c/1111/2' });
});
const named = (kind) => events.filter(([k]) => k === kind).map(([, b]) => b);

const open = (chat) => page.locator(`[data-chat="telegram:${chat}"]`).click();
const rightClick = async (chat, n) => {
  const body = page.locator(
    `[data-row="msg:telegram:${chat}:${n}"] .bubble-body`
  );
  await body.scrollIntoViewIfNeeded();
  const box = await body.boundingBox();
  await page.mouse.click(box.x + 10, box.y + box.height / 2, {
    button: 'right',
  });
  await page.waitForSelector('[role=menu] [data-action]', { timeout: 3000 });
};
const bar = page.locator('.forward-bar');
const barItems = () =>
  bar
    .locator('[role=menu] [data-action]')
    .evaluateAll((list) => list.map((b) => b.dataset.action));
// Forward message `n` of the source chat: the menu, the picker, the chat.
const stage = async (n, to) => {
  await open(SRC);
  await rightClick(SRC, n);
  await page.locator('[role=menu] [data-action="forward"]').click();
  await page
    .locator('.forward-picker-list li', { hasText: to })
    .first()
    .click();
  await bar.waitFor({ timeout: 10000 });
};

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${SRC}"]`).waitFor();

  // The target chat opens with the bar over the box; nothing went yet.
  await stage(2, 'Dest Friend');
  assert(events.length === 0, 'nothing is forwarded before Send');
  const title = await bar.locator('.forward-bar-title').textContent();
  assert(title === 'Forward 1 message', `title: ${title}`);
  const names = await bar.locator('.forward-bar-names').textContent();
  assert(names === 'Alice', `names: ${names}`);
  assert(
    (
      await page.locator('.chat-header, .chat-top').first().textContent()
    ).includes('Dest Friend'),
    'the target chat is open'
  );

  // The menu: the sender's name, another chat; no captions without any.
  await bar.locator('[data-action="forward-options"]').click();
  assert(
    (await barItems()).join() === 'forward-name,forward-choose',
    `menu: ${await barItems()}`
  );
  await bar.locator('[data-action="forward-name"]').click();
  assert(
    (await bar.locator('.forward-bar-names').textContent()) ===
      "Sender's name hidden",
    'the bar says the name is hidden'
  );
  await bar.locator('[data-action="forward-options"]').click();
  assert(
    (await bar.locator('[data-action="forward-name"]').textContent()) ===
      "Show sender's name",
    'the item now shows the name'
  );
  await bar.locator('[data-action="forward-options"]').click();

  // The comment is sent first, then the forward with dropAuthor.
  await page.locator('textarea').fill('look at this');
  await page.locator('textarea').press('Enter');
  await until(() => named('forward').length === 1, 'the forward');
  assert(
    events.map(([k]) => k).join() === 'send,forward',
    `order: ${events.map(([k]) => k)}`
  );
  assert(events[0][1].text === 'look at this', 'the comment text');
  assert(events[0][1].chat === DST, 'the comment goes to the target');
  const [first] = named('forward');
  assert(
    JSON.stringify(first) ===
      JSON.stringify({
        fromChat: SRC,
        ids: [2],
        toChat: DST,
        dropAuthor: true,
      }),
    `forward body: ${JSON.stringify(first)}`
  );
  await bar.waitFor({ state: 'detached' });

  // A captioned file: the captions option; no comment, the Send button.
  await stage(4, 'Dest Friend');
  assert(
    (await bar.locator('.forward-bar-names').textContent()) === 'Bob',
    'the sender of the second forward'
  );
  await bar.locator('[data-action="forward-options"]').click();
  assert(
    (await barItems()).join() ===
      'forward-name,forward-captions,forward-choose',
    `menu with captions: ${await barItems()}`
  );
  await bar.locator('[data-action="forward-captions"]').click();
  await page.locator('button.send').click();
  await until(() => named('forward').length === 2, 'the second forward');
  const second = named('forward')[1];
  assert(
    JSON.stringify(second) ===
      JSON.stringify({
        fromChat: SRC,
        ids: [4],
        toChat: DST,
        dropMediaCaptions: true,
      }),
    `second body: ${JSON.stringify(second)}`
  );
  assert(named('send').length === 1, 'no comment, no message');

  // Choose another chat, then cancel: nothing more is sent.
  await stage(1, 'Dest Friend');
  await bar.locator('[data-action="forward-options"]').click();
  await bar.locator('[data-action="forward-choose"]').click();
  await page
    .locator('.forward-picker-list li', { hasText: 'Source Group' })
    .click();
  await page.locator(`[data-forward-bar="telegram:${SRC}"]`).waitFor();
  await bar.locator('[data-action="forward-cancel"]').click();
  await bar.waitFor({ state: 'detached' });
  assert(named('forward').length === 2, 'cancelling forwards nothing');

  // Copy link: Telegram's own link, on the clipboard, with the toast.
  await open(SRC);
  await rightClick(SRC, 2);
  await page.locator('[role=menu] [data-action="copyLink"]').click();
  await until(() => named('message-link').length === 1, 'the link asked');
  assert(
    JSON.stringify(named('message-link')[0]) ===
      JSON.stringify({ chat: SRC, id: 2, thread: false }),
    `asked: ${JSON.stringify(named('message-link'))}`
  );
  await page.getByText('Link copied').waitFor({ timeout: 5000 });
  if (engine === 'chromium') {
    const copied = await page.evaluate(() =>
      globalThis.navigator.clipboard.readText()
    );
    assert(copied === 'https://t.me/c/1111/2', `clipboard: ${copied}`);
  }

  // A t.me/c link in a message opens that message in a known chat.
  await open(SRC);
  const linkNode = page.locator(
    `[data-row="msg:telegram:${SRC}:3"] a.msg-link`
  );
  await linkNode.scrollIntoViewIfNeeded();
  const pages = page.context().pages().length;
  await linkNode.click();
  await until(
    async () =>
      (await page.evaluate(() => globalThis.location.hash)).includes(PRIVATE),
    'the private chat opens'
  );
  await until(
    () =>
      page.evaluate(
        (id) => globalThis.__found.includes(id),
        `msg:telegram:${PRIVATE}:7`
      ),
    'message 7 is highlighted'
  );
  assert(page.context().pages().length === pages, 'no browser tab opened');
});
