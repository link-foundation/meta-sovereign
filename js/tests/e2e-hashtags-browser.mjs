// Real browser e2e for hashtags and live view counters (R-Y182), as
// Telegram Desktop has them. A click on #tag in a message opens a search
// for it in that chat, with "All chats" and "Public posts" beside it; a
// found message opens in its chat; `#tag@username` searches that
// channel. Channel posts on screen are marked viewed once (in one
// batch), their counters show the answer and are refreshed in place
// (views, forwards, replies) without being marked again. Telegram's
// answers faked in the page, fake chats in a memory store, a server on a
// free port, a headless browser; nothing reaches a network or a running
// app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:hashtags

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHANNEL = '-1005';
const GROUP = '-1006';
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - (10 - n) * 60_000).toISOString();
const channel = {
  source: 'telegram',
  chat: CHANNEL,
  chatName: 'Fake Channel',
  chatType: 'channel',
  sender: CHANNEL,
  senderName: 'Fake Channel',
};
const group = {
  source: 'telegram',
  chat: GROUP,
  chatName: 'Other Group',
  chatType: 'supergroup',
  sender: '77',
  senderName: 'Fake Gus',
};
await store.put({
  ...channel,
  id: `msg:telegram:${CHANNEL}:1`,
  body: '#fakenews today',
  timestamp: at(1),
  raw: {
    id: 1,
    post: true,
    views: 100,
    forwards: 2,
    replies: { replies: 4, comments: true },
    entities: [{ className: 'MessageEntityHashtag', offset: 0, length: 9 }],
  },
});
await store.put({
  ...channel,
  id: `msg:telegram:${CHANNEL}:2`,
  body: 'a plain post',
  timestamp: at(2),
  raw: { id: 2, post: true, views: 7 },
});
await store.put({
  ...group,
  id: `msg:telegram:${GROUP}:1`,
  body: '#fakenews elsewhere $FAKE #deep@fakechan',
  timestamp: at(3),
  raw: {
    id: 1,
    entities: [
      { className: 'MessageEntityHashtag', offset: 0, length: 9 },
      { className: 'MessageEntityCashtag', offset: 20, length: 5 },
      { className: 'MessageEntityHashtag', offset: 26, length: 14 },
    ],
  },
});

const { base, page, until, finish } = await openChatApp('hashtags', { store });
// Time is the page's own, so the refresh can be waited for in a moment.
await page.clock.install();
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);

const viewCalls = [];
await page.route('**/api/telegram/message-views', (route) => {
  const body = route.request().postDataJSON();
  viewCalls.push(body);
  const items = body.ids.map((id) =>
    body.increment
      ? { id, views: id === 1 ? 150 : 8, forwards: id === 1 ? 2 : 0 }
      : {
          id,
          views: id === 1 ? 175 : 9,
          forwards: id === 1 ? 5 : 0,
          replies: id === 1 ? 9 : undefined,
        }
  );
  return fulfil(route, { ok: true, items });
});

const found = (id, text) => ({
  id: `msg:telegram:${GROUP}:${id}`,
  source: 'telegram',
  chat: GROUP,
  chatName: 'Other Group',
  chatType: 'supergroup',
  sender: '77',
  senderName: 'Fake Gus',
  body: text,
  timestamp: at(3),
});
const searches = [];
await page.route('**/api/telegram/search-tag', (route) => {
  const body = route.request().postDataJSON();
  searches.push(body);
  const messages =
    body.scope === 'public' ? [] : [found(1, `${body.tag} elsewhere`)];
  return fulfil(route, {
    ok: true,
    messages,
    count: messages.length,
    more: false,
  });
});
await page.route('**/api/telegram/resolve-link', (route) =>
  fulfil(route, {
    ok: true,
    chat: CHANNEL,
    name: 'Fake Channel',
    kind: 'channel',
  })
);

const dialog = page.locator('[data-dialog="tag-search"]');
const last = () => searches.at(-1);

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHANNEL}"]`).click();
  await page.locator(`[data-message="msg:telegram:${CHANNEL}:2"]`).waitFor();

  // Counters: the stored numbers first, then Telegram's answer.
  await until(() => viewCalls.some((c) => c.increment), 'marked viewed');
  await page.locator('.bubble-time .bubble-views[data-views="150"]').waitFor();
  await page.locator('.bubble-time .bubble-views[data-views="8"]').waitFor();
  const marked = viewCalls.filter((c) => c.increment).flatMap((c) => c.ids);
  assert(
    marked.sort().join() === '1,2',
    `each post marked once: ${JSON.stringify(viewCalls)}`
  );
  console.log(
    '[e2e-hashtags] posts on screen marked viewed once, counters set'
  );

  // Later, the posts still on screen are asked again, not marked again.
  await page.clock.fastForward(31_000);
  await until(() => viewCalls.some((c) => !c.increment), 'refreshed');
  await page.locator('.bubble-time .bubble-views[data-views="175"]').waitFor();
  assert(
    (
      await page.locator('.bubble-time .bubble-forwards').first().textContent()
    ).includes('5'),
    'forwards updated in place'
  );
  await page.locator('.bubble-comments-label', { hasText: '9' }).waitFor();
  const peeks = viewCalls.filter((c) => !c.increment);
  assert(
    peeks.every((c) => c.chat === CHANNEL),
    'asked for the open chat'
  );
  assert(
    viewCalls.filter((c) => c.increment).flatMap((c) => c.ids).length === 2,
    'not marked again'
  );
  console.log('[e2e-hashtags] refreshed in place: views, forwards, replies');

  // A click on #tag searches the chat first.
  await page.locator('.msg-tag-search[data-tag="#fakenews"]').click();
  await dialog.waitFor();
  await until(() => searches.length === 1, 'searched');
  assert(
    last().scope === 'chat' &&
      last().chat === CHANNEL &&
      last().tag === '#fakenews',
    `chat search: ${JSON.stringify(last())}`
  );
  const tabs = await dialog
    .locator('[data-scope]')
    .evaluateAll((list) => list.map((b) => b.dataset.scope));
  assert(tabs.join() === 'chat,all,public', `tabs: ${tabs}`);
  await dialog.locator('[data-tags="results"]').waitFor();

  // All chats, then public posts (nothing there).
  await dialog.locator('[data-scope="public"]').click();
  await until(() => last().scope === 'public', 'public posts searched');
  await dialog.locator('[data-tags="none"]').waitFor();
  await dialog.locator('[data-scope="all"]').click();
  await until(() => last().scope === 'all', 'all chats searched');
  await dialog.locator('[data-found]').first().click();
  await dialog.waitFor({ state: 'detached' });
  await page.locator(`[data-message="msg:telegram:${GROUP}:1"]`).waitFor();
  console.log(
    '[e2e-hashtags] #tag: this chat, all chats, public posts; a result opens'
  );

  // A cashtag, and #tag@username searching that channel.
  await page.locator('.msg-tag-search[data-tag="$FAKE"]').click();
  await dialog.waitFor();
  await until(() => last().tag === '$FAKE', 'cashtag searched');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await page.locator('.msg-tag-search[data-tag="#deep@fakechan"]').click();
  await dialog.waitFor();
  await until(
    () => last().tag === '#deep' && last().chat === CHANNEL,
    'the named channel searched'
  );
  assert(last().scope === 'chat', 'in that channel');
  await dialog.locator('[data-action="close"]').click();
  await dialog.waitFor({ state: 'detached' });
  console.log('[e2e-hashtags] $cashtag and #tag@username');
});
