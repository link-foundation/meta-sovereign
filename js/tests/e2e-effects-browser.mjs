// Real browser e2e for message effects (R-Y149), as Telegram Desktop has
// them: a received message with an effect shows its emoji badge by the
// time (the burst plays when it appears and when the badge is clicked);
// in a private chat Send's menu offers "Send with effect" with a panel of
// the effects (the Premium-only one locked), and picking one sends the
// box's text with its id; a group has no such entry. The effects list is
// faked in the page, the sender is a fake, fake chats in a memory store;
// nothing reaches a network or a running app. Not part of `npm test`; run:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:effects

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const GROUP = '-5';
const FIRE = '5104841245755180586';
const GEM = '5046509860389126442';
const store = createMemoryStore();
const stamp = new Date(Date.now() - 5000).toISOString();
await store.put({
  id: `msg:telegram:${ANN}:1`,
  source: 'telegram',
  chat: ANN,
  chatName: 'Ann Lee',
  chatType: 'private',
  sender: ANN,
  senderName: 'Ann Lee',
  body: 'with fire',
  timestamp: stamp,
  raw: { id: 1, effect: FIRE },
});
await store.put({
  id: `msg:telegram:${GROUP}:1`,
  source: 'telegram',
  chat: GROUP,
  chatName: 'Fake Group',
  chatType: 'group',
  sender: '31',
  senderName: 'Bob',
  body: 'hello group',
  timestamp: stamp,
  raw: { id: 1 },
});

const sent = [];
const { base, page, until, finish } = await openChatApp('effects', {
  store,
  send: async (draft) => {
    sent.push(draft);
    return { via: 'fake' };
  },
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = String(route.request().postDataJSON()?.chat ?? '');
  return fulfil(
    route,
    chat === GROUP
      ? { chat, kind: 'group', title: 'Fake Group' }
      : { chat, kind: 'user', title: 'Ann Lee' }
  );
});
await page.route('**/api/telegram/scheduled', (route) =>
  fulfil(route, { ok: true, links: [] })
);
await page.route('**/api/telegram/effects', (route) =>
  fulfil(route, {
    ok: true,
    premium: false,
    effects: [
      { id: FIRE, emoticon: '🔥' },
      { id: GEM, emoticon: '💎', premiumRequired: true },
    ],
  })
);

const box = page.locator('.chat-composer textarea');
const open = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await box.waitFor({ timeout: 15000 });
};

await finish(async () => {
  await page.goto(`${base}/`);

  // A received message with an effect: the badge, the burst on a click.
  await open(ANN);
  const badge = page.locator(`[data-message-effect="${FIRE}"]`);
  await badge.waitFor({ timeout: 10000 });
  await until(async () => (await badge.textContent()) === '🔥', 'its emoji');
  await page.evaluate(() =>
    document.querySelectorAll('.effect-burst').forEach((n) => n.remove())
  );
  await badge.click();
  await until(
    async () => (await page.locator('.effect-burst').count()) > 0,
    'a click plays the burst'
  );

  // Sending: right click on Send, "Send with effect", the panel.
  await box.fill('hello Ann');
  await page.locator('.chat-composer button.send').click({ button: 'right' });
  await page.locator('[data-action="sendEffect"]').click();
  const panel = page.locator('[data-effect-panel]');
  await panel.waitFor({ timeout: 5000 });
  await until(
    async () => (await panel.locator('[data-effect-id]').count()) === 2,
    'both effects listed'
  );
  const locked = panel.locator(`[data-effect-id="${GEM}"]`);
  assert(await locked.isDisabled(), 'the Premium effect is locked');
  await panel.locator(`[data-effect-id="${FIRE}"]`).click();
  await until(() => sent.length === 1, 'sent with the effect');
  assert(sent[0].effect === FIRE, `effect: ${JSON.stringify(sent[0])}`);
  assert((sent[0].text ?? sent[0].body) === 'hello Ann', 'its text');
  assert((await panel.count()) === 0, 'the panel closed');

  // A group: no effect entry.
  await open(GROUP);
  await box.fill('hello all');
  await page.locator('.chat-composer button.send').click({ button: 'right' });
  await page.waitForTimeout(300);
  assert(
    (await page.locator('[data-action="sendEffect"]').count()) === 0,
    'no effect entry in a group'
  );
});
