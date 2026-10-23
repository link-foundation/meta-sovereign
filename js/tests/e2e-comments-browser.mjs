// Real browser e2e for a channel post's comments (R-Y126), as Telegram's
// apps show them: a post with comments has "N comments" at its foot, one
// without "Leave a comment"; a click opens the panel with the post on
// top, "Discussion started", the comments with their senders' names;
// older ones load on demand; a comment is sent from the panel's composer
// (Enter), as an answer to the post or, after Reply on a comment, to
// that comment; Escape and a click beside the panel close it. Telegram's
// answers faked in the page, a fake channel in a memory store, a server
// on a free port, a headless browser; nothing reaches a network or a
// running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:comments

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHANNEL = '-1001';
const GROUP = '-10077';
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - 60_000 * (100 - n)).toISOString();
const postOf = (n, body, replies) => ({
  id: `msg:telegram:${CHANNEL}:${n}`,
  source: 'telegram',
  chat: CHANNEL,
  chatName: 'Fake Channel',
  chatType: 'channel',
  sender: CHANNEL,
  senderName: 'Fake Channel',
  body,
  timestamp: at(n),
  raw: {
    id: n,
    post: true,
    replies: { className: 'MessageReplies', comments: true, ...replies },
  },
});
await store.put(postOf(1, 'First post', { replies: 3, maxId: 43 }));
await store.put(postOf(2, 'Second post', { replies: 0 }));

const comment = (n, sender, name, body) => ({
  id: `msg:telegram:${GROUP}:${n}`,
  source: 'telegram',
  chat: GROUP,
  chatName: 'Fake Chat',
  chatType: 'supergroup',
  sender,
  senderName: name,
  body,
  timestamp: at(n - 30),
  raw: { id: n },
});
const NEWEST = [
  comment(42, '31', 'Ann Fake', 'nice one'),
  comment(43, '32', 'Bob Fake', 'agreed'),
];
const OLDER = [comment(41, '33', 'Cid Fake', 'early bird')];

const { base, page, until, finish } = await openChatApp('comments', {
  store,
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, { chat: CHANNEL, kind: 'channel', title: 'Fake Channel' })
);
const asked = [];
const sent = [];
await page.route('**/api/telegram/comments', (route) => {
  const body = route.request().postDataJSON();
  asked.push(body);
  const group = { chat: GROUP, title: 'Fake Chat' };
  if (body.post === 2) {
    return fulfil(route, {
      ok: true,
      group,
      root: 50,
      unread: 0,
      messages: [],
      complete: true,
    });
  }
  const older = body.before === 42;
  const newest = sent.map((s, i) => comment(60 + i, 'me', 'You', s.text));
  return fulfil(route, {
    ok: true,
    group,
    root: 40,
    unread: 0,
    messages: older ? OLDER : [...NEWEST, ...newest],
    complete: older,
  });
});
const reads = [];
await page.route('**/api/telegram/comments-read', (route) => {
  reads.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/comment-send', (route) => {
  sent.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, chat: GROUP });
});

const panel = page.locator('[data-dialog="comments"]');
const bar = (n) =>
  page.locator(
    `.chat-scroll [data-message="msg:telegram:${CHANNEL}:${n}"] [data-action="comments"]`
  );
const gone = (what) => until(async () => (await panel.count()) === 0, what);

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHANNEL}"]`).click();
  await bar(1).waitFor({ timeout: 15000 });

  // The bars: a count, or an invitation to comment.
  assert((await bar(1).textContent()) === '3 comments', 'three comments');
  assert(
    (await bar(2).textContent()) === 'Leave a comment',
    `bar: ${await bar(2).textContent()}`
  );

  // The panel: the post, the start, the comments with names.
  await bar(1).click();
  await panel.locator('[data-message$=":43"]').waitFor({ timeout: 5000 });
  const text = await panel.textContent();
  assert(text.includes('First post'), 'the post on top');
  assert(text.includes('Discussion started'), 'the start');
  assert(text.includes('Fake Chat'), "the group's title");
  assert(text.includes('Ann Fake') && text.includes('nice one'), 'a comment');
  assert(
    JSON.stringify(asked[0]) === `{"chat":"${CHANNEL}","post":1}`,
    `asked: ${JSON.stringify(asked[0])}`
  );

  // The comments shown are read up to the newest.
  await until(() => reads.length === 1, 'read');
  assert(
    JSON.stringify(reads[0]) === `{"chat":"${CHANNEL}","post":1,"max":43}`,
    `read: ${JSON.stringify(reads[0])}`
  );

  // Older comments on demand, above the rest.
  await panel.locator('[data-action="comments-older"]').click();
  await panel.locator('[data-message$=":41"]').waitFor({ timeout: 5000 });
  assert(asked.at(-1).before === 42, `before: ${asked.at(-1).before}`);
  const order = await panel
    .locator('.comments-column [data-message]')
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.message.split(':')[3]));
  assert(order.join() === '1,41,42,43', `order: ${order}`);
  assert(
    (await panel.locator('[data-action="comments-older"]').count()) === 0,
    'no more older ones'
  );
  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }

  // A comment: Enter sends it to the post.
  const box = panel.locator('textarea');
  await box.fill('my comment');
  await box.press('Enter');
  await until(() => sent.length === 1, 'sent');
  assert(
    sent[0].chat === CHANNEL &&
      sent[0].post === 1 &&
      sent[0].text === 'my comment' &&
      sent[0].replyTo === undefined,
    `send: ${JSON.stringify(sent[0])}`
  );
  await panel.locator('[data-message$=":60"]').waitFor({ timeout: 5000 });
  assert((await box.inputValue()) === '', 'the composer is cleared');
  await until(() => reads.at(-1)?.max === 60, 'the new comment is read');

  // Reply on a comment answers it.
  const ann = panel.locator('[data-message$=":42"]');
  await ann.hover();
  await panel
    .locator('.bubble-row:has([data-message$=":42"]) .bubble-fast-reply')
    .click();
  await panel.locator('.comments-reply').waitFor({ timeout: 5000 });
  assert(
    (await panel.locator('.comments-reply').textContent()).includes('Ann Fake'),
    'replying to Ann'
  );
  await box.fill('to Ann');
  await panel.locator('[data-action="comment-send"]').click();
  await until(() => sent.length === 2, 'reply sent');
  assert(sent[1].replyTo === 42, `reply: ${JSON.stringify(sent[1])}`);
  await until(
    async () => (await panel.locator('.comments-reply').count()) === 0,
    'the reply bar leaves'
  );

  // Escape closes; a click beside the panel closes.
  await page.keyboard.press('Escape');
  await gone('closed by Escape');
  await bar(2).click();
  await panel.locator('.meta', { hasText: 'No comments here yet.' }).waitFor({
    timeout: 5000,
  });
  await page.mouse.click(3, 3);
  await gone('closed beside it');
});
