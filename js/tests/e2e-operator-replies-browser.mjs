// Browser -> confirmed HTTP send -> shared adapter -> Telegram wire request.
// Fake Telegram clears unread after a send, as may happen on another device.
import { createMemoryStore } from '../src/storage/universal.js';
import { createDefaultSender } from '../src/sources/browser-sender.js';
import { sendText } from '../src/sources/telegram-send.js';
import { named } from './helpers/telegram-fakes.mjs';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
const logs = [];
const wire = [];
let sequence = 100;
const read = (chat, unread = 1) => ({
  id: `read:telegram:${chat}`,
  tokens: ['read', 'telegram', chat],
  kind: 'read',
  source: 'telegram',
  chat,
  inboxMaxId: unread ? 1 : sequence,
  unreadCount: unread,
  unreadTopId: unread ? 2 : sequence,
});
for (const chat of ['111', '222']) {
  await store.put({
    id: `msg:telegram:${chat}:2`,
    source: 'telegram',
    chat,
    chatName: `Person ${chat}`,
    chatType: 'personal_chat',
    sender: chat,
    body: `Question ${chat}`,
    timestamp: `2026-01-0${chat === '111' ? 1 : 2}T00:00:00Z`,
    raw: { id: 2 },
  });
  await store.put(read(chat));
}
const Api = {
  InputReplyToMessage: named('InputReplyToMessage'),
  messages: { SendMessage: named('messages.SendMessage') },
};
const client = {
  getInputEntity: async (peer) => peer,
  invoke: async (request) => {
    wire.push(request);
    sequence += 1;
    await store.put(read(request.peer, 0));
    return {
      className: 'UpdateShortSentMessage',
      id: sequence,
      date: Math.floor(Date.now() / 1000),
    };
  },
};
const send = createDefaultSender({
  getSource: () => ({
    live: {
      post: async (draft) => {
        const parts = await sendText({
          ...draft,
          peer: draft.chat,
          client,
          Api,
          helpers: { readBigIntFromBuffer: (bytes) => bytes.readBigInt64LE() },
          log: (entry) => logs.push(entry),
        });
        return {
          links: parts.map((part) => ({
            id: `msg:telegram:${draft.chat}:${part.id}`,
            source: 'telegram',
            chat: draft.chat,
            chatType: 'personal_chat',
            sender: 'me',
            body: part.text,
            clientId: draft.clientId,
            timestamp: new Date().toISOString(),
            raw: draft.replyTo
              ? { replyTo: { replyToMsgId: draft.replyTo } }
              : {},
          })),
        };
      },
    },
  }),
});
const { base, page, until, finish } = await openChatApp('operator-replies', {
  store,
  send,
  serverOptions: { log: (entry) => logs.push(entry) },
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
  globalThis.localStorage.removeItem('metaSovereignReadReceipts');
  const Original = globalThis.EventSource;
  globalThis.__eventStreams = [];
  globalThis.EventSource = new Proxy(Original, {
    construct(Target, args) {
      const stream = new Target(...args);
      if (String(args[0]).includes('/api/events')) {
        globalThis.__eventStreams.push(stream);
      }
      return stream;
    },
  });
});
const acknowledgements = [];
await page.route('**/api/telegram/dialog-state', async (route) => {
  const { chat } = route.request().postDataJSON();
  return fulfil(route, {
    ok: true,
    read: await store.get(`read:telegram:${chat}`),
  });
});
await page.route('**/api/telegram/read', async (route) => {
  acknowledgements.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
const card = () =>
  page.locator('[data-operator-chat]').getAttribute('data-operator-chat');
const box = () => page.locator('.operator-card textarea');
const reply = async (chat) => {
  await page
    .locator(`[data-row="msg:telegram:${chat}:2"] .bubble-body`)
    .click({ button: 'right' });
  await page.locator('[role="menu"] [data-action="reply"]').click();
  await page.locator('.composer-reply-bar').waitFor();
};
const stable = async (chat) => {
  await page.waitForTimeout(600);
  assert(
    (await card()) === `telegram:${chat}`,
    'sending/read updates never complete or advance work'
  );
  assert(acknowledgements.length === 0, 'no read acknowledgements before Done');
  assert(
    (await page.locator('[data-nav-count="operator"]').textContent()) === '2',
    'badge counts unfinished work'
  );
};
const reconnectSteps = async () => {
  const signal = (type) =>
    page.evaluate((type) => {
      globalThis.__eventStreams
        .filter((stream) => stream.readyState !== 2)
        .forEach((stream) => stream.dispatchEvent(new globalThis.Event(type)));
    }, type);
  for (const view of ['operator', 'chat', 'profile']) {
    await page.locator(`button[data-view="${view}"]`).click();
    await page.locator('.mode-badge.online').waitFor();
    await signal('error');
    await page.locator('.mode-badge.reconnecting').waitFor();
    assert(
      (await page.locator('.mode-badge.reconnecting').textContent()) ===
        'Reconnecting',
      `${view}: reconnecting is global`
    );
    const color = await page
      .locator('.mode-badge.reconnecting')
      .evaluate((node) => globalThis.getComputedStyle(node).color);
    assert(color === 'rgb(255, 223, 107)', `${view}: reconnecting is yellow`);
    assert(
      (await page.locator('.chat-banner').count()) === 0,
      `${view}: no reconnect panel inside chats`
    );
    await signal('ready');
    await page.locator('.mode-badge.online').waitFor();
  }
};
await finish(async () => {
  await page.goto(`${base}/#/operator`);
  await until(
    async () => (await card()) === 'telegram:111',
    'first unread card'
  );
  await reply('111');
  await box().fill('First response');
  await box().press('Enter');
  await until(() => wire.length === 1, 'first reply sent');
  assert(
    wire[0].replyTo?.replyToMsgId === 2,
    'first reply preserved on Telegram wire'
  );
  await stable('111');
  await reply('111');
  await page.locator('[data-action="operator-next"]').click();
  await until(
    async () => (await card()) === 'telegram:222',
    'Next postpones unfinished zero-unread card'
  );
  assert(
    (await page.locator('.composer-reply-bar').count()) === 0,
    'reply target cannot leak to another chat'
  );
  await reply('222');
  await box().fill('Second response');
  await box().press('Enter');
  await until(() => wire.length === 2, 'second reply sent');
  assert(
    wire[1].replyTo?.replyToMsgId === 2 && wire[1].peer === '222',
    'second reply has the correct target chat and message'
  );
  await stable('222');
  await page.locator('[data-action="operator-next"]').click();
  await until(
    async () => (await card()) === 'telegram:111',
    'postponed zero-unread work returns'
  );
  await page.reload();
  await until(
    async () => (await card()) === 'telegram:111',
    'unfinished work survives reload'
  );
  await stable('111');
  await page.locator('[data-action="operator-done"]').click();
  await until(
    async () => (await card()) === 'telegram:222',
    'Done completes only its card'
  );
  await page.locator('[data-action="operator-done"]').click();
  await page.locator('.operator-empty').waitFor();
  assert(
    acknowledgements.length === 2,
    'only the two Done actions acknowledge history'
  );
  await until(
    () => logs.some((entry) => entry.event === 'client_operator_done_result'),
    'client decisions reach the verbose server log'
  );
  assert(
    logs.some(
      (entry) => entry.event === 'message_send_requested' && entry.replyTo === 2
    ),
    'HTTP trace includes reply target'
  );
  assert(
    logs.some(
      (entry) => entry.event === 'telegram_send_request' && entry.replyTo === 2
    ),
    'provider trace includes reply target'
  );
  assert(
    logs.some(
      (entry) => entry.event === 'client_send_start' && entry.replyTo === 2
    ),
    'client trace includes reply target'
  );
  assert(
    !JSON.stringify(logs).includes('First response'),
    'verbose diagnostics omit message text'
  );
  await reconnectSteps();
});
