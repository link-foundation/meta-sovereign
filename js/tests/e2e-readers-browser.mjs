// Real browser e2e for "Seen by" and who reacted (R-Y127), as Telegram's
// apps show them: the menu of one's own message in a small group has
// "Seen by…", which lists who read it with the time; a message with
// reactions has "Who reacted", which lists who reacted with which emoji,
// a tab for each emoji and "Show more" for the next page; a refusal
// (the message too old) is told in words; a message of someone else
// offers no "Seen by". Telegram's answers faked in the page, a fake group
// in a memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:readers

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-5';
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - 60_000 * (100 - n)).toISOString();
const message = (n, sender, body, raw = {}) => ({
  id: `msg:telegram:${GROUP}:${n}`,
  source: 'telegram',
  chat: GROUP,
  chatName: 'Fake Group',
  chatType: 'group',
  sender,
  senderName: sender === 'me' ? 'You' : 'Ann Fake',
  body,
  timestamp: at(n),
  raw: { id: n, ...raw },
});
const results = [
  { reaction: { className: 'ReactionEmoji', emoticon: '👍' }, count: 2 },
  { reaction: { className: 'ReactionEmoji', emoticon: '🔥' }, count: 1 },
];
await store.put(message(1, 'me', 'my message', { reactions: { results } }));
await store.put(message(2, '31', 'her message'));
await store.put(message(3, 'me', 'old message'));

const { base, page, until, finish } = await openChatApp('readers', { store });

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, { chat: GROUP, kind: 'group', title: 'Fake Group' })
);
const asked = [];
await page.route('**/api/telegram/readers', (route) => {
  const body = route.request().postDataJSON();
  asked.push(['readers', body]);
  if (body.id === 3) {
    return fulfil(route, { ok: false, error: 'MSG_TOO_OLD', code: 'too-old' });
  }
  return fulfil(route, {
    ok: true,
    readers: [
      { id: '31', name: 'Ann Fake', date: Date.now() - 5 * 60_000 },
      { id: '32', name: 'Bob Fake', date: Date.now() - 10 * 60_000 },
    ],
  });
});
const item = (name, emoji, date, my = false) => ({
  peer: String(30 + name.length),
  name,
  emoji,
  customEmojiId: null,
  date,
  my,
});
await page.route('**/api/telegram/reactors', (route) => {
  const body = route.request().postDataJSON();
  asked.push(['reactors', body]);
  const now = Date.now();
  if (body.emoji === '🔥') {
    return fulfil(route, {
      ok: true,
      count: 1,
      items: [item('Cid Fake', '🔥', now)],
      next: null,
    });
  }
  if (body.offset === 'p2') {
    return fulfil(route, {
      ok: true,
      count: 3,
      items: [item('Dan Fake', '🔥', now)],
      next: null,
    });
  }
  return fulfil(route, {
    ok: true,
    count: 3,
    items: [item('Ann Fake', '👍', now), item('Bob Fake', '👍', now, true)],
    next: 'p2',
  });
});

const panel = page.locator('[data-dialog="readers"]');
const row = (n) =>
  page.locator(`.chat-scroll [data-message="msg:telegram:${GROUP}:${n}"]`);
const menuOn = async (n) => {
  await row(n).locator('.bubble-body, .bubble').first().click({
    button: 'right',
  });
  await page.locator('.msg-context-menu').waitFor({ timeout: 5000 });
};
const gone = (what) => until(async () => (await panel.count()) === 0, what);
const action = (name) =>
  page.locator(`.msg-context-menu [data-action="${name}"]`);

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  await row(1).waitFor({ timeout: 15000 });

  // Someone else's message offers neither.
  await menuOn(2);
  assert((await action('readers').count()) === 0, 'no Seen by on hers');
  assert((await action('reactors').count()) === 0, 'no reactors without any');
  await page.keyboard.press('Escape');
  await page.mouse.click(3, 3);

  // Seen by: names and times.
  await menuOn(1);
  assert((await action('readers').textContent()).includes('Seen by'), 'item');
  await action('readers').click();
  await panel
    .locator('[data-reader="seen"]')
    .first()
    .waitFor({ timeout: 5000 });
  const text = await panel.textContent();
  assert(text.includes('Seen by 2 people'), `title: ${text}`);
  assert(text.includes('Ann Fake') && text.includes('Bob Fake'), 'names');
  assert(text.includes('today at'), `time: ${text}`);
  assert(
    JSON.stringify(asked[0]) === `["readers",{"chat":"${GROUP}","id":1}]`,
    `asked: ${JSON.stringify(asked[0])}`
  );
  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }
  await page.keyboard.press('Escape');
  await gone('closed by Escape');

  // Who reacted: a page, more, a tab per emoji.
  await menuOn(1);
  await action('reactors').click();
  await panel
    .locator('[data-reader="reacted"]')
    .first()
    .waitFor({ timeout: 5000 });
  assert((await panel.textContent()).includes('3 reactions'), 'the count');
  assert(
    (await panel.locator('[data-reader="reacted"]').count()) === 2,
    'page'
  );
  assert((await panel.textContent()).includes('Bob Fake (you)'), 'my own');
  await panel.locator('[data-action="reactors-more"]').click();
  await until(
    async () => (await panel.locator('[data-reader="reacted"]').count()) === 3,
    'the next page'
  );
  assert(
    asked.at(-1)[1].offset === 'p2',
    `offset: ${JSON.stringify(asked.at(-1))}`
  );
  await panel.locator('[data-tab="🔥"]').click();
  await until(
    async () => (await panel.locator('[data-reader="reacted"]').count()) === 1,
    'one emoji'
  );
  assert((await panel.textContent()).includes('Cid Fake'), 'a 🔥 reactor');
  assert(asked.at(-1)[1].emoji === '🔥', 'asked for the emoji');
  await page.mouse.click(3, 3);
  await gone('closed beside it');

  // A refusal is told.
  await menuOn(3);
  await action('readers').click();
  await panel.locator('[role="alert"]').waitFor({ timeout: 5000 });
  assert(
    (await panel.textContent()).includes('too old'),
    `refusal: ${await panel.textContent()}`
  );
});
