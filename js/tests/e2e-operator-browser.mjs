// Unread conversations are Operator cards, with a real composer and no list.
import { assertControlSpacing } from './helpers/e2e-controls.mjs';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';
import { summarizeChats } from '../src/web/chat-model.js';

const store = createMemoryStore();
const at = Date.now();
const message = (
  chat,
  id,
  body,
  timestamp = at - (4 - Number(chat) / 111) * 60_000
) => ({
  id: `msg:telegram:${chat}:${id}`,
  source: 'telegram',
  chat,
  chatName: `Person ${chat}`,
  chatType: 'personal_chat',
  sender: id === 1 ? 'me' : chat,
  senderName: id === 1 ? 'Me' : `Person ${chat}`,
  body,
  timestamp: new Date(timestamp).toISOString(),
  raw: { id },
});
const read = (chat, maxId, unreadCount) => ({
  id: `read:telegram:${chat}`,
  tokens: ['read', 'telegram', chat],
  kind: 'read',
  source: 'telegram',
  chat,
  inboxMaxId: maxId,
  unreadTopId: 2,
  unreadCount,
});
for (const chat of ['111', '222', '333']) {
  await store.put(message(chat, 1, `Previous context ${chat}`));
  await store.put(message(chat, 2, `Unread question ${chat}`));
  await store.put(read(chat, chat === '333' ? 2 : 1, chat === '333' ? 0 : 1));
}
await store.put(message('000', 2, 'Already read in Telegram'));
await store.put(read('000', 1, 1)); // Deliberately stale; Telegram will report zero.
await store.put(message('001', 2, 'Forum with no unread topics'));
await store.put({ ...read('001', 1, 6), forum: 1 });
const sends = [];
const { base, page, until, finish } = await openChatApp('operator', {
  store,
  secure: true,
  send: async (draft) => {
    sends.push(draft);
    return { via: 'fake' };
  },
});
let failRead = false;
let failDirectory = true;
await page.addInitScript(() => {
  globalThis.localStorage.removeItem('metaSovereignReadReceipts');
  globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
});
await page.route(/\/links\?except=msg:/, (route) =>
  failDirectory
    ? fulfil(route, { error: 'temporary directory outage' }, 503)
    : route.continue()
);
const inspected = [];
await page.route('**/api/telegram/dialog-state', async (route) => {
  const { chat } = route.request().postDataJSON();
  inspected.push(chat);
  const current = summarizeChats(await store.query()).find(
    (item) => item.chat === chat
  );
  const unread = chat === '000' ? 0 : (current?.unread ?? 0);
  const link =
    chat === '001'
      ? {
          ...read(chat, 1, 6),
          forum: 1,
          forumUnreadCount: 0,
          forumUnreadTopId: 2,
          forumDialogUnreadCount: 6,
          forumReadInboxMaxId: 1,
        }
      : read(chat, unread ? 1 : 2, unread);
  await store.put(link);
  return fulfil(route, { ok: true, read: link });
});
const reads = [];
await page.route('**/api/telegram/read', async (route) => {
  const body = route.request().postDataJSON();
  reads.push(body);
  if (failRead) {
    return fulfil(route, { error: 'simulated failure' }, 502);
  }
  await store.put(read(body.chat, body.maxId, 0));
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/calls', (route) =>
  fulfil(route, {
    ok: true,
    calls: [
      {
        id: 3,
        chat: '111',
        date: at,
        missed: true,
        out: false,
        name: 'Person 111',
      },
    ],
    next: null,
  })
);
const card = () =>
  page.locator('[data-operator-chat]').getAttribute('data-operator-chat');
const badge = (name) => page.locator(`[data-nav-count="${name}"]`);

const startupFailureSteps = async () => {
  await page.goto(`${base}/#/operator`);
  await until(
    async () => (await page.locator('[data-load-error]').count()) > 0,
    'startup directory failure is visible'
  );
  await page.locator('button[data-view="operator"]').click();
  assert(
    (await page.locator('.operator-empty').count()) === 0,
    'a failed first load is never an empty queue'
  );
  await page.locator('main[data-view="operator"] [data-load-error]').waitFor();
  failDirectory = false;
  await until(
    async () => (await card()) === 'telegram:111',
    'skip the stale zero-unread candidate'
  );
  assert(
    inspected.includes('000'),
    'check Telegram counters before selecting stale work'
  );
};

const remountFailureSteps = async () => {
  failDirectory = true;
  await page.locator('button[data-view="calls"]').click();
  const reopened = Date.now();
  await page.locator('button[data-view="operator"]').click();
  await until(
    async () => (await card()) === 'telegram:111',
    'cached card survives a failed directory refresh'
  );
  assert(Date.now() - reopened < 2500, 'remount paints a cached card promptly');
  assert(
    (await page.locator('.operator-empty').count()) === 0,
    'no false empty state during refresh failure'
  );
  failDirectory = false;
};

const scopeSteps = async () => {
  for (const [chat, chatType] of [
    ['-55', 'group'],
    ['-10066', 'channel'],
    ['444', 'bot_chat'],
  ]) {
    await store.put({
      ...message(chat, 2, `Unread ${chatType}`, at - 600_000),
      chatType,
    });
    await store.put(read(chat, 1, 1));
  }
  await page.locator('button[data-view="settings"]').click();
  const setting = (kind) => page.locator(`[data-action="operator-${kind}"]`);
  assert(
    await setting('private').isChecked(),
    'one-to-one chats enabled by default'
  );
  assert(
    !(await setting('group').isChecked()) &&
      !(await setting('channel').isChecked()),
    'groups and channels excluded by default'
  );
  assert(!(await setting('bot').isChecked()), 'bots excluded by default');
  await until(
    async () => (await badge('operator').textContent()) === '1',
    'default badge counts only private work'
  );
  await setting('private').uncheck();
  await setting('group').check();
  await page.locator('button[data-view="operator"]').click();
  await until(
    async () => (await card()) === 'telegram:-55',
    'explicit group opt-in changes the queue'
  );
  await assertControlSpacing(page);
  await page.locator('button[data-view="settings"]').click();
  await setting('channel').check();
  await until(
    async () => (await badge('operator').textContent()) === '2',
    'badge updates immediately to configured types'
  );
  await page.reload();
  await page.locator('button[data-view="settings"]').click();
  await setting('channel').waitFor();
  assert(
    (await setting('channel').isChecked()) &&
      !(await setting('private').isChecked()),
    'scope survives reload'
  );
  await setting('group').uncheck();
  await page.locator('button[data-view="operator"]').click();
  await until(
    async () => (await card()) === 'telegram:-10066',
    'channel opt-in applies to embedded cards too'
  );
  await page.locator('button[data-view="settings"]').click();
  await setting('bot').check();
  await setting('channel').uncheck();
  await page.locator('button[data-view="operator"]').click();
  await until(
    async () => (await card()) === 'telegram:444',
    'bot opt-in works independently of private chats'
  );
  await until(
    async () => (await badge('operator').textContent()) === '1',
    'bot badge matches the bot-only queue'
  );
  await page.locator('button[data-view="settings"]').click();
  await setting('private').check();
  await setting('bot').uncheck();
  await page.locator('button[data-view="operator"]').click();
  await until(
    async () => (await card()) === 'telegram:111',
    'returning to private scope never keeps a stale channel card'
  );
};

const restoreCardSteps = async () => {
  await page.goBack();
  await until(
    async () => (await card()) === 'telegram:111',
    'Back restores the previous Operator card'
  );
  await page.goForward();
  await until(
    async () => (await card()) === 'telegram:222',
    'Forward restores the next Operator card'
  );
  await page.reload();
  await page.locator('main[data-view="operator"]').waitFor();
  await until(
    async () => (await card()) === 'telegram:222',
    'reload keeps Operator and its unread card'
  );
  assert(reads.length === 0, 'history navigation never completes work');
};

const postponeSteps = async () => {
  await store.put(message('555', 2, 'Third unread question', at - 30_000));
  await store.put(read('555', 1, 1));
  await until(
    async () => (await badge('operator').textContent()) === '3',
    'three queued conversations'
  );
  await page.locator('[data-action="operator-next"]').click();
  await until(
    async () => (await card()) === 'telegram:222',
    'Next conversation'
  );
  assert(reads.length === 0, 'Next preserves unread state');
};

const selectionSteps = async () => {
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const row = page.locator('[data-row="msg:telegram:111:1"]');
    const time = row.locator('.bubble-time');
    await time.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const before = await row.locator('.bubble').boundingBox();
    await time.click();
    await page.locator('.operator-card .selection-top').waitFor();
    const during = await row.locator('.bubble').boundingBox();
    const check = await row.locator('.bubble-check').boundingBox();
    const column = await page
      .locator('.operator-card .chat-column')
      .boundingBox();
    assert(
      check.x > column.x + column.width,
      `${width}: Operator check stays outside the column`
    );
    for (const key of ['x', 'y', 'width', 'height']) {
      assert(
        Math.abs(before[key] - during[key]) <= 1,
        `${width}: Operator selection keeps ${key}`
      );
    }
    await assertControlSpacing(page);
    await page.keyboard.press('Escape');
    assert(
      reads.length === 0,
      'selecting and clearing never acknowledge Operator work'
    );
  }
  await page.setViewportSize({ width: 1200, height: 800 });
};

const initialCardSteps = async () => {
  await startupFailureSteps();
  await until(
    async () => (await badge('operator').textContent()) === '2',
    'two unread conversations'
  );
  await until(
    async () => (await badge('calls').textContent()) === '1',
    'one unread missed call'
  );
  await page.locator('button[data-view="operator"]').click();
  await until(
    async () => (await card()) === 'telegram:111',
    'oldest unread card'
  );
  assert(
    await page.locator('.operator-card .chat-composer textarea').isVisible(),
    'embedded composer visible'
  );
  await remountFailureSteps();
  assert(
    (await page.locator('.operator-card .chat-sidebar').count()) === 0,
    'no conversation list in Operator'
  );
  await until(
    async () =>
      (await page.locator('.operator-card').textContent()).includes(
        'Previous context 111'
      ),
    'history context'
  );
  await page.waitForTimeout(900);
  assert(
    reads.length === 0,
    'opening and viewing a card keeps unread messages unread'
  );
  await selectionSteps();
};

await finish(async () => {
  await initialCardSteps();
  await postponeSteps();
  await restoreCardSteps();
  const box = page.locator('.operator-card textarea');
  await box.pressSequentially('need a reply');
  assert(
    (await card()) === 'telegram:222',
    'typing N and D cannot advance the queue'
  );
  await box.press('Enter');
  await until(
    async () => sends.length === 1,
    'reply sent using the embedded composer'
  );
  await until(
    async () => (await box.inputValue()) === '',
    'composer clears after sending'
  );
  failRead = true;
  assert(reads.length === 0, 'replying also preserves unread state until Done');
  await page.locator('[data-action="operator-done"]').click();
  await until(
    async () =>
      (await page.locator('.operator-workspace [role="alert"]').count()) > 0,
    'read failure visible'
  );
  assert((await card()) === 'telegram:222', 'failed Done retains the card');
  assert(
    (await badge('operator').textContent()) === '3',
    'failed Done keeps the unread count'
  );
  failRead = false;
  await page.locator('[data-action="operator-done"]').click();
  await until(
    async () => (await card()) === 'telegram:555',
    'Done respects the skipped card at the end'
  );
  assert(
    (await store.get('read:telegram:111')).unreadCount === 1,
    'skipped chat remains unread in the store'
  );
  assert(
    reads.filter((body) => body.chat === '111').length === 0,
    'no read acknowledgement for Next'
  );
  await page.locator('[data-action="operator-done"]').click();
  await until(
    async () => (await card()) === 'telegram:111',
    'skipped card returns after all other work'
  );
  await until(
    async () => (await badge('operator').textContent()) === '1',
    'conversation badge decremented'
  );
  await until(
    async () => (await badge('chat').textContent()) === '1',
    'message badge decremented'
  );

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  const colors = await badge('operator').evaluate((node) => {
    const style = globalThis.getComputedStyle(node);
    return [style.backgroundColor, style.color];
  });
  assert(
    colors.join() === 'rgb(255, 255, 255),rgb(0, 0, 0)',
    `monochrome badge: ${colors}`
  );
  await page.locator('[data-action="operator-done"]').click();
  await until(
    async () => (await page.locator('[data-operator-chat]').count()) === 0,
    'queue completed'
  );
  assert(
    (await page.locator('.operator-empty').textContent()).includes(
      'No unread conversations'
    ),
    'connected empty queue has a completion state'
  );
  await until(
    async () => (await badge('operator').count()) === 0,
    'zero badges hidden'
  );

  await store.put(message('111', 3, 'A fresh unread message', Date.now()));
  await until(
    async () => (await card()) === 'telegram:111',
    'new unread chat enters the queue live'
  );
  await until(
    async () => (await badge('operator').textContent()) === '1',
    'live unread count'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await box.isVisible(),
    'conversation and composer remain visible on a phone'
  );
  assert(
    (await page.locator('.operator-card .chat-sidebar').count()) === 0,
    'phone has no chat list either'
  );
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.locator('button[data-view="calls"]').click();
  await until(
    async () => (await badge('calls').count()) === 0,
    'reviewing calls clears its badge'
  );
  await page.locator('button[data-view="operator"]').click();
  await until(
    async () => (await card()) === 'telegram:111',
    'unread work survives switching sections'
  );
  await scopeSteps();
});
