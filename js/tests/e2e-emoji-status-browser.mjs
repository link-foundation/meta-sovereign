// Real browser e2e for emoji statuses (R-Y162), as Telegram Desktop shows
// and sets them: a person's status is a small custom emoji after their
// name in the chat list, the chat header, the person panel and, in a
// group, beside the sender's name on their messages; one past its time is
// not shown. A Premium account opens its status from the profile card,
// picks a default or recent one for a duration (the fake records what
// was sent) and removes it; an account without Premium sees the picker
// locked with an explanation. Telegram's answers faked in the page, fake
// chats in a memory store, a server on a free port, a headless browser;
// nothing reaches a network or a running app. Not part of `npm test`;
// run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:emoji-status

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '5';
const BOB = '6';
const TEAM = '-9';
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - 60_000 * (100 - n)).toISOString();
const later = Math.floor(Date.now() / 1000) + 86_400;
const earlier = Math.floor(Date.now() / 1000) - 3600;
const message = (chat, name, type, sender, senderName, extra) => ({
  id: `msg:telegram:${chat}:1`,
  source: 'telegram',
  chat,
  chatName: name,
  chatType: type,
  sender,
  senderName,
  body: 'hello there',
  timestamp: at(Number(chat.replace('-', '')) + 10),
  raw: { id: 1 },
  ...extra,
});
await store.put(
  message(ANN, 'Ann', 'personal_chat', ANN, 'Ann', {
    senderEmojiStatus: '111',
    senderEmojiUntil: later,
  })
);
await store.put(
  message(BOB, 'Bob', 'personal_chat', BOB, 'Bob', {
    senderEmojiStatus: '222',
    senderEmojiUntil: earlier,
  })
);
await store.put(
  message(TEAM, 'Team', 'private_group', '31', 'Cy', {
    senderEmojiStatus: '333',
  })
);

const { base, page, until, finish } = await openChatApp('emoji-status', {
  store,
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
await page.route('**/api/telegram/custom-emoji*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = String(route.request().postDataJSON()?.chat ?? '');
  return fulfil(route, {
    chat,
    kind: chat === TEAM ? 'group' : 'user',
    title: 'Fake',
  });
});

let premium = true;
let mine = { id: '444', until: later };
await page.route('**/api/telegram/profile', (route) =>
  fulfil(route, {
    ok: true,
    id: '7',
    firstName: 'Me',
    lastName: '',
    about: '',
    username: 'me',
    phone: '',
    hasPhoto: false,
    aboutMax: 70,
    premium,
    emojiStatus: mine,
  })
);
await page.route('**/api/telegram/emoji-statuses', (route) =>
  fulfil(route, {
    ok: true,
    premium,
    current: mine,
    defaults: [{ id: '555' }, { id: '666' }],
    recent: [{ id: '777' }],
  })
);
const sets = [];
await page.route('**/api/telegram/emoji-status-set', (route) => {
  const body = route.request().postDataJSON();
  sets.push(body);
  mine = body.documentId ? { id: body.documentId, until: body.until } : null;
  return fulfil(route, { ok: true });
});

const count = (selector) => page.locator(selector).count();
const row = (chat) => `[data-chat="telegram:${chat}"]`;

const showSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(row(ANN)).waitFor();
  // The list: Ann's status after her name, Bob's expired one hidden.
  assert((await count(`${row(ANN)} [data-emoji-status="111"]`)) === 1, 'list');
  assert((await count(`${row(BOB)} [data-emoji-status]`)) === 0, 'expired');
  assert((await count(`${row(TEAM)} [data-emoji-status]`)) === 0, 'group row');
  // The header and the person panel.
  await page.locator(row(ANN)).click();
  await page.locator('.chat-header').waitFor();
  assert(
    (await count('.chat-header [data-emoji-status="111"]')) === 1,
    'header'
  );
  await page.locator('[data-action="chat-about"]').click();
  await page.locator('.person-panel .profile-name').waitFor();
  assert(
    (await count('.person-panel [data-emoji-status="111"]')) === 1,
    'person panel'
  );
  await page.locator('[data-action="chat-about"]').click();
  // Bob has none in his header.
  await page.locator(row(BOB)).click();
  await until(
    async () =>
      (await page.locator('.chat-header strong').textContent()) === 'Bob',
    'Bob opened'
  );
  assert(
    (await count('.chat-header [data-emoji-status]')) === 0,
    'expired header'
  );
  // A group message: the sender's name with the status.
  await page.locator(row(TEAM)).click();
  await page.locator('.bubble-name').first().waitFor();
  assert(
    (await count('.bubble-name [data-emoji-status="333"]')) === 1,
    'beside the sender'
  );
  // The picture is the server's custom emoji.
  await until(
    async () => (await count('.bubble-name .msg-custom-emoji-img')) === 1,
    'emoji picture'
  );
};

const dialog = page.locator('[data-dialog="my-profile"]');
const picker = page.locator('[data-dialog="emoji-status"]');
const openPicker = async () => {
  await page.locator('[data-action="my-profile"]').click();
  await dialog.locator('[data-action="emoji-status"]').click();
  await picker.waitFor();
};
const closeAll = async () => {
  await picker.locator('[data-action="submit"]').click();
  await until(async () => (await picker.count()) === 0, 'picker closed');
  await page.keyboard.press('Escape');
  await until(async () => (await dialog.count()) === 0, 'card closed');
};

const setSteps = async () => {
  await openPicker();
  await picker.locator('[data-emoji-status-pick="555"]').waitFor();
  assert((await picker.locator('[data-locked]').count()) === 0, 'not locked');
  assert(
    (await picker.locator('[data-emoji-status-pick]').count()) === 3,
    'recent and default statuses'
  );
  await picker.locator('[data-field="duration"]').selectOption('hour2');
  const before = Math.floor(Date.now() / 1000);
  await picker.locator('[data-emoji-status-pick="555"]').click();
  await until(async () => sets.length === 1, 'set sent');
  assert(sets[0].documentId === '555', `document ${sets[0].documentId}`);
  assert(
    Math.abs(sets[0].until - (before + 7200)) < 30,
    `for 2 hours: ${sets[0].until - before}`
  );
  // Until I change it: no time at all.
  await picker.locator('[data-field="duration"]').selectOption('forever');
  await picker.locator('[data-emoji-status-pick="777"]').click();
  await until(async () => sets.length === 2, 'second set sent');
  assert(
    sets[1].documentId === '777' && !('until' in sets[1]),
    JSON.stringify(sets[1])
  );
  await picker.locator('[data-action="remove-emoji-status"]').click();
  await until(async () => sets.length === 3, 'remove sent');
  assert(
    JSON.stringify(sets[2]) === JSON.stringify({ documentId: null }),
    JSON.stringify(sets[2])
  );
  await until(
    async () =>
      (await picker.locator('[data-action="remove-emoji-status"]').count()) ===
      0,
    'remove button gone'
  );
  await closeAll();
};

const lockedSteps = async () => {
  premium = false;
  mine = null;
  await openPicker();
  await picker.locator('[data-locked]').waitFor();
  assert((await picker.textContent()).includes('Premium'), 'explains Premium');
  assert(
    (await picker.locator('[data-field="duration"]').count()) === 0,
    'no durations'
  );
  const picks = picker.locator('[data-emoji-status-pick]');
  await picks.first().waitFor();
  assert((await picks.count()) === 3, 'statuses listed');
  for (let i = 0; i < 3; i += 1) {
    assert(await picks.nth(i).isDisabled(), `pick ${i} disabled`);
  }
  assert(sets.length === 3, 'nothing was sent');
  await closeAll();
};

await finish(async () => {
  await showSteps();
  await setSteps();
  await lockedSteps();
});
