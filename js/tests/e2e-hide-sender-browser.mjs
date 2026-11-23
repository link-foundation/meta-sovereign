// Real-browser coverage for sender visibility in private and public chats.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';
import { requestBody } from './helpers/http-wire.mjs';

const ADA = '42';
const MAX = '43';
const GROUP = '-10071';
const CHANNEL = '-10072';
const VK = '2000000071';
const at = Date.now() - 5 * 60_000;
const store = createMemoryStore();
const message = ({
  chat,
  id,
  sender,
  body,
  chatName,
  chatType,
  source = 'telegram',
  ...rest
}) => ({
  id: `msg:${source}:${chat}:${id}`,
  source,
  chat,
  chatName,
  chatType,
  sender,
  senderName: sender === ADA ? 'Ada Novak' : 'Max Chen',
  body,
  timestamp: new Date(at + id * 1000).toISOString(),
  raw: { id },
  ...rest,
});
const dm = (chat) => ({
  chat,
  id: 1,
  sender: chat,
  body:
    chat === ADA
      ? 'Hello, Lin. Do you have a moment?'
      : 'Hey, can you review my draft?',
  chatName: chat === ADA ? 'Ada Novak' : 'Max Chen',
  chatType: 'private',
});
const group = {
  chat: GROUP,
  chatName: 'Design Circle',
  chatType: 'supergroup',
};
const channel = {
  chat: CHANNEL,
  chatName: 'Design Announcements',
  chatType: 'channel',
};
const vk = {
  chat: VK,
  chatName: 'VK Design Room',
  chatType: 'group',
  source: 'vk',
};
const hidden = message({
  ...group,
  id: 2,
  sender: ADA,
  body: 'The meeting is postponed. I will share a new time.',
});
const oldPin = message({
  ...group,
  id: 1,
  sender: MAX,
  body: 'I have the design review penciled in for this week.',
  raw: { id: 1, pinned: true },
});
const shown = message({
  ...group,
  id: 3,
  sender: MAX,
  body: 'I added the meeting agenda to our shared notes.',
  replyTo: `${GROUP}:2`,
  raw: { id: 3, replyTo: { replyToMsgId: 2, quoteText: hidden.body } },
});
const mirror = message({
  ...vk,
  id: 2,
  sender: ADA,
  body: 'VK has a different account with ID 42.',
});
const channelPost = message({
  ...channel,
  id: 1,
  sender: ADA,
  body: 'Friday studio notes',
});
for (const link of [
  message(dm(ADA)),
  message(dm(MAX)),
  { ...oldPin, raw: { id: 1 } },
  hidden,
  shown,
  channelPost,
  message({
    ...channel,
    id: 2,
    sender: CHANNEL,
    body: 'Studio hours are open to everyone.',
    senderName: 'Design Announcements',
  }),
  mirror,
  message({ ...vk, id: 3, sender: MAX, body: 'VK follow-up from Max.' }),
]) {
  await store.put(link);
}
for (const chat of [ADA, GROUP]) {
  const unreadTopId = chat === ADA ? 1 : 3;
  await store.put({
    id: `read:telegram:${chat}`,
    kind: 'read',
    source: 'telegram',
    chat,
    inboxMaxId: 0,
    unreadTopId,
    unreadCount: unreadTopId,
  });
}

const { base, page, until, finish } = await openChatApp('hide-sender', {
  store,
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  globalThis.localStorage.setItem('metaSovereignReadReceipts', 'off');
  globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
  globalThis.localStorage.setItem('metaSovereignNotifySound', 'off');
  globalThis.localStorage.setItem(
    'metaSovereignOperatorScope',
    JSON.stringify({ private: true, group: true })
  );
  globalThis.senderTestNotifications = [];
  globalThis.Notification = class {
    static permission = 'granted';
    constructor(_title, { body }) {
      globalThis.senderTestNotifications.push(body);
    }
    close() {}
  };
});

const blocks = [];
let rejectBlock = false;
await page.route('**/api/telegram/peer-settings', (route) => {
  const { chat } = requestBody(route.request());
  return fulfil(route, {
    ok: true,
    bar: [ADA, MAX].includes(String(chat)) ? { blockContact: true } : {},
  });
});
await page.route('**/api/telegram/peer-block', (route) => {
  const request = requestBody(route.request());
  blocks.push(request);
  return fulfil(
    route,
    rejectBlock
      ? { ok: false, code: 'failed' }
      : { ok: true, blocked: request.block }
  );
});
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(
    route,
    chat === GROUP ? { chat, kind: 'group', pinned: 2 } : { chat }
  );
});
await page.route('**/api/telegram/pinned-list', (route) =>
  fulfil(route, { ok: true, messages: [hidden, oldPin], count: 2, next: null })
);
await page.route('**/api/telegram/search', (route) => {
  const body = requestBody(route.request());
  const messages = body.offsetId ? [shown] : [hidden];
  return fulfil(route, {
    ok: true,
    ids: messages.map((entry) => entry.raw.id),
    messages: body.links ? messages : undefined,
    count: 2,
    more: !body.offsetId,
  });
});
await page.route('**/api/telegram/search-peers', (route) =>
  fulfil(route, { ok: true, peers: [] })
);
await page.route('**/api/telegram/search-global', (route) =>
  fulfil(route, { ok: true, messages: [hidden, shown], count: 2, more: false })
);
await page.route('**/api/telegram/dialog-state', async (route) => {
  const { chat } = requestBody(route.request());
  return fulfil(route, {
    ok: true,
    read: await store.get(`read:telegram:${chat}`),
  });
});

const messageRow = (id) => page.locator(`[data-message="${id}"]`);
const open = (source, chat) =>
  page.locator(`[data-chat="${source}:${chat}"]`).click();
const block = async (chat) => {
  await open('telegram', chat);
  await page
    .locator(`[data-peer-bar="${chat}"] [data-action="bar-block"]`)
    .click();
  return page.locator('[data-dialog="block"]');
};
const hiddenKeys = () =>
  page.evaluate(() =>
    JSON.parse(
      globalThis.localStorage.getItem('metaSovereignHiddenSenders') || '[]'
    )
  );
const hide = async (link) => {
  await messageRow(link.id).click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: 'Hide messages from sender' })
    .click();
};

const blockWithChoice = async () => {
  await page.goto(base);
  const first = await block(ADA);
  if (process.env.HIDE_SENDER_SCREENSHOT_BEFORE) {
    await page.screenshot({
      path: process.env.HIDE_SENDER_SCREENSHOT_BEFORE,
      animations: 'disabled',
    });
  }
  const checkbox = first.getByRole('checkbox', {
    name: 'Also hide their messages in this browser',
  });
  await checkbox.waitFor({ timeout: 5000 });
  assert(!(await checkbox.isChecked()), 'blocking defaults to Telegram only');
  await checkbox.check();
  await first.getByRole('button', { name: 'Cancel' }).click();
  assert(
    blocks.length === 0 && (await hiddenKeys()).length === 0,
    'cancel has no effect'
  );

  const decline = await block(MAX);
  await decline.locator('[data-action="block-confirm"]').click();
  await decline.waitFor({ state: 'hidden' });
  assert(
    (await hiddenKeys()).length === 0,
    'blocking without opt-in keeps messages visible'
  );
  assert(
    await messageRow(message(dm(MAX)).id).isVisible(),
    'unchecked private chat remains visible'
  );

  const retry = await block(ADA);
  await retry.getByRole('checkbox').check();
  rejectBlock = true;
  await retry.locator('[data-action="block-confirm"]').click();
  await retry.getByRole('alert').waitFor();
  assert(
    (await hiddenKeys()).length === 0,
    'a failed block cannot hide messages'
  );
  rejectBlock = false;
  if (process.env.HIDE_SENDER_SCREENSHOT_AFTER) {
    await retry.getByRole('button', { name: 'Cancel' }).click();
    await block(ADA);
    await page.locator('[data-dialog="block"]').getByRole('checkbox').check();
    await page.screenshot({
      path: process.env.HIDE_SENDER_SCREENSHOT_AFTER,
      animations: 'disabled',
    });
  }
  await retry.locator('[data-action="block-confirm"]').click();
  await retry.waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'Messages hidden' }).waitFor();
  assert((await hiddenKeys()).length === 1, 'block opt-in stores one sender');
};

const verifyGroup = async () => {
  await open('telegram', GROUP);
  await messageRow(shown.id).waitFor();
  assert(
    !(await messageRow(hidden.id).count()),
    'the matching group message is absent'
  );
  await messageRow(shown.id).getByText('Quoted message hidden').waitFor();
  await page.locator('.chat-pinned-bar').getByText(oldPin.body).waitFor();
  if (process.env.HIDE_SENDER_SCREENSHOT_TIMELINE) {
    await page.screenshot({
      path: process.env.HIDE_SENDER_SCREENSHOT_TIMELINE,
      animations: 'disabled',
    });
  }
  await page.locator('[data-action="chat-find"]').click();
  await page.locator('.chat-find-input').fill('meeting');
  await until(
    async () =>
      (await page.locator('.chat-find-count').textContent()).includes(
        'No messages found'
      ),
    'a hidden-only remote page'
  );
  const find = page.locator('.chat-find-input');
  await find.clear();
  assert(
    await page.locator('[data-action="find-older"]').isDisabled(),
    'clearing the query clears its hidden-page cursor'
  );
  await find.fill('meeting');
  await page.locator('[data-action="find-older"]').click();
  await until(
    async () =>
      (await page.locator('.chat-find-count').textContent()).includes('1 of 1'),
    'a visible result on the next page'
  );
  await page.keyboard.press('Escape');
  await page.locator('.chat-search').fill('meeting');
  await page.locator('[data-global]').getByText(shown.body).waitFor();
  assert(
    !(await page.locator('[data-global]').getByText(hidden.body).count()),
    'global search excludes the hidden text'
  );
  await page.locator('.chat-search').fill('');

  await store.put(
    message({
      ...group,
      id: 4,
      sender: ADA,
      body: 'New message from the hidden sender',
    })
  );
  const live = message({
    ...group,
    id: 5,
    sender: MAX,
    body: 'New message from a visible sender',
  });
  await store.put(live);
  await messageRow(live.id).waitFor();
  assert(
    !(await page
      .getByText('New message from the hidden sender', { exact: true })
      .count()),
    'live arrivals are filtered'
  );
};

const verifyOtherChats = async () => {
  await open('telegram', CHANNEL);
  await messageRow(`msg:telegram:${CHANNEL}:2`).waitFor();
  assert(
    !(await messageRow(channelPost.id).count()),
    'the same person is hidden in a channel'
  );
  await open('vk', VK);
  await messageRow(mirror.id).waitFor();
  await hide(mirror);
  await messageRow(mirror.id).waitFor({ state: 'detached' });
  assert(
    (await hiddenKeys())
      .map((rule) => rule.source)
      .sort()
      .join() === 'telegram,vk',
    'VK has its own rule'
  );

  await page.reload();
  await open('telegram', GROUP);
  await messageRow(shown.id).waitFor();
  assert(
    !(await messageRow(hidden.id).count()),
    'the choice survives a reload'
  );
  await page.goto(`${base}/#/operator`);
  await page.locator('[data-operator-chat]').waitFor();
  assert(
    (await page
      .locator('[data-operator-chat]')
      .getAttribute('data-operator-chat')) === `telegram:${GROUP}`,
    'hidden-only unread private chat is skipped in Operator'
  );
  await messageRow(shown.id).waitFor();
  assert(
    !(await messageRow(hidden.id).count()),
    'Operator uses the same filter'
  );
};

const restoreTelegram = async () => {
  // Switching off Operator closes its subscription. Wait for the Settings
  // watcher's new connection before sending messages to that watcher.
  await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === base && url.pathname === '/api/events' && response.ok()
      );
    }),
    page.goto(`${base}/#/settings`),
  ]);
  await page.getByRole('heading', { name: 'Hidden senders' }).waitFor();
  const telegramRule = page
    .getByRole('listitem')
    .filter({ hasText: 'Telegram · 42' });
  if (process.env.HIDE_SENDER_SCREENSHOT_SETTINGS) {
    await telegramRule.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: process.env.HIDE_SENDER_SCREENSHOT_SETTINGS,
      animations: 'disabled',
    });
  }
  const visibleNotice = 'Notification from a visible sender';
  const hiddenNotice = 'Notification from the hidden sender';
  const timestamp = new Date().toISOString();
  await store.put(
    message({ ...dm(ADA), id: 6, body: hiddenNotice, timestamp })
  );
  await store.put(
    message({
      ...group,
      id: 6,
      sender: MAX,
      body: visibleNotice,
      timestamp,
    })
  );
  await until(
    () =>
      page.evaluate(
        (body) =>
          globalThis.senderTestNotifications.some((notice) =>
            notice.includes(body)
          ),
        visibleNotice
      ),
    'foreground Settings receives a visible message notification'
  );
  assert(
    !(await page.evaluate(
      (body) =>
        globalThis.senderTestNotifications.some((notice) =>
          notice.includes(body)
        ),
      hiddenNotice
    )),
    'foreground Settings does not notify for a hidden sender'
  );
  await telegramRule
    .getByRole('button', { name: 'Show messages from Ada Novak' })
    .click();
  assert(
    (await hiddenKeys()).length === 1 &&
      (await hiddenKeys())[0].source === 'vk',
    'restoring Telegram leaves VK hidden'
  );
  await page.goto(`${base}/#/chat`);
  await open('telegram', GROUP);
  await messageRow(hidden.id).waitFor();
  assert(
    blocks.length === 3 && blocks.every((request) => request.block),
    'visibility actions do not call Telegram block or unblock'
  );
};

await finish(async () => {
  await blockWithChoice();
  await verifyGroup();
  await verifyOtherChats();
  await restoreTelegram();
});
