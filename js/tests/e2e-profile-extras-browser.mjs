// Real browser e2e for profile extras (R-Y178), as Telegram Desktop has
// them: the profile card opens "Birthday, colours, personal channel" where
// the birthday (day, month, optional year), the name colour and the
// profile colour (with previews) and the personal channel are chosen and
// nothing is written until Save, which sends only what changed; a
// person's info column shows their birthday with the age, a profile-colour
// header and their personal channel as a card (name, subscribers, latest
// post) that opens the channel; the chat header gets a cake on their
// birthday; the chat list has a Birthdays block. Telegram's answers faked
// in the page, fake chats in a memory store, a server on a free port, a
// headless browser; nothing reaches a network or a running app. Not part
// of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:profile-extras

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const BOB = '43';
const CAROL = '44';
const EVE = '45';
const today = new Date();
const onDay = (offset) => {
  const date = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + offset
  );
  return { day: date.getDate(), month: date.getMonth() + 1 };
};
const BIRTHDAY = {
  day: today.getDate(),
  month: today.getMonth() + 1,
  year: today.getFullYear() - 30,
};
const store = createMemoryStore();
for (const [chat, name] of [
  [ANN, 'Ann Lee'],
  [BOB, 'Bob Ray'],
  [CAROL, 'Carol Sun'],
  [EVE, 'Eve Bell'],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: 'private',
    sender: chat,
    senderName: name,
    body: 'hello',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    raw: { id: 1 },
  });
}

// The greeting is no longer the head, but still dismisses the reminder.
await store.put({
  id: `msg:telegram:${EVE}:0`,
  source: 'telegram',
  chat: EVE,
  sender: 'me',
  chatName: 'Eve Bell',
  chatType: 'private',
  body: 'С днём рождения!',
  timestamp: new Date(Date.now() - 120_000).toISOString(),
});
const { base, page, until, finish } = await openChatApp('profile-extras', {
  store,
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
});
let sentRoute = null;
let releaseSend = null;
await page.route('**/api/send', async (route) => {
  sentRoute = route;
  await new Promise((resolve) => {
    releaseSend = resolve;
  });
  const link = {
    id: `msg:telegram:${BOB}:5`,
    source: 'telegram',
    chat: BOB,
    sender: 'me',
    chatName: 'Bob Ray',
    chatType: 'private',
    body: 'Happy birthday!',
    timestamp: new Date().toISOString(),
  };
  await store.put(link);
  return fulfil(route, { status: 'sent', link });
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(
    route,
    chat === ANN
      ? {
          chat,
          kind: 'user',
          title: 'Ann Lee',
          birthday: BIRTHDAY,
          profileColor: { color: 3, emoji: null },
          personalChannel: true,
        }
      : { chat, kind: 'user', title: 'Bob Ray' }
  );
});
await page.route('**/api/telegram/personal-channel', (route) =>
  fulfil(route, {
    ok: true,
    card: {
      chat: '-10055',
      title: 'Ann Blog',
      username: 'annblog',
      members: 1200,
      message: { id: 7, text: 'Latest post text' },
    },
  })
);
await page.route('**/api/telegram/contact-birthdays', (route) =>
  fulfil(route, {
    ok: true,
    birthdays: [
      { chat: BOB, name: 'Bob Ray', ...onDay(0), days: 0 },
      { chat: ANN, name: 'Ann Lee', ...onDay(3), days: 3 },
      { chat: CAROL, name: 'Carol Sun', ...onDay(1), days: 1 },
      { chat: EVE, name: 'Eve Bell', ...onDay(0), days: 0 },
    ],
  })
);
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
  })
);
await page.route('**/api/telegram/profile-extras', (route) =>
  fulfil(route, {
    ok: true,
    premium: true,
    birthday: null,
    color: { color: 1, emoji: null },
    profileColor: null,
    personalChannel: null,
  })
);
await page.route('**/api/telegram/profile-colors', (route) =>
  fulfil(route, {
    ok: true,
    name: [0, 1, 2, 8].map((id) => ({ id, colors: ['#ff8800'] })),
    profile: [0, 3, 9].map((id) => ({ id, colors: ['#336699', '#224466'] })),
  })
);
await page.route('**/api/telegram/personal-channels', (route) =>
  fulfil(route, {
    ok: true,
    channels: [{ chat: '-10055', title: 'My Blog', members: 5 }],
  })
);
await page.route('**/api/telegram/emoji-statuses', (route) =>
  fulfil(route, {
    ok: true,
    premium: true,
    current: null,
    defaults: [],
    recent: [],
  })
);
const writes = [];
for (const name of ['birthday-save', 'color-save', 'personal-channel-save']) {
  await page.route(`**/api/telegram/${name}`, (route) => {
    writes.push([name, route.request().postDataJSON()]);
    return fulfil(route, { ok: true });
  });
}

const birthdaySteps = async () => {
  await page.goto(`${base}/`);

  // The Birthdays block of the chat list.
  const block = page.locator('.birthdays-block');
  await block.waitFor({ timeout: 10000 });
  const blockText = await block.textContent();
  assert(
    blockText.includes('Bob Ray') && blockText.includes('Today'),
    `birthdays: ${blockText}`
  );
  assert(
    !blockText.includes('In 3 days'),
    `future birthdays hidden: ${blockText}`
  );

  await until(
    async () =>
      (await page.locator(`[data-birthday-chat="${EVE}"]`).count()) === 0,
    'older sent wishes dismiss Eve'
  );
  assert(
    (await page.locator(`[data-birthday-chat="${CAROL}"]`).count()) === 0,
    'tomorrow hidden by default'
  );
  const settings = () => page.locator('button[data-view="settings"]').click();
  const chats = () => page.locator('button[data-view="chat"]').click();
  const tomorrow = () => page.locator('[data-action="birthdays-tomorrow"]');
  const hideGreeted = () =>
    page.locator('[data-action="birthdays-hide-greeted"]');
  await settings();
  assert(!(await tomorrow().isChecked()), 'tomorrow opt-in');
  assert(await hideGreeted().isChecked(), 'greeted people hidden by default');
  await tomorrow().check();
  await hideGreeted().uncheck();
  await chats();
  await page.locator(`[data-birthday-chat="${CAROL}"]`).waitFor();
  await page.locator(`[data-birthday-chat="${EVE}"]`).waitFor();
  await settings();
  assert(
    await tomorrow().isChecked(),
    'tomorrow preference survives navigation'
  );
  await tomorrow().uncheck();
  await hideGreeted().check();
  await chats();
  await until(
    async () =>
      (await page.locator(`[data-birthday-chat="${EVE}"]`).count()) === 0,
    'greeted hidden again'
  );
  await page.locator(`[data-birthday-chat="${BOB}"]`).click();
  const composer = page.locator('.chat-composer textarea');
  await composer.fill('Happy birthday!');
  await composer.press('Enter');
  await until(() => Boolean(sentRoute), 'fixture send in progress');
  assert(
    (await page.locator(`[data-birthday-chat="${BOB}"]`).count()) === 1,
    'pending greeting keeps reminder'
  );
  releaseSend();
  await until(
    async () => (await page.locator('.birthdays-block').count()) === 0,
    'sent greeting frees the whole reminder block'
  );
  await page.reload();
  await page.locator(`[data-chat="telegram:${ANN}"]`).waitFor();
  await until(
    async () => (await page.locator('.birthdays-block').count()) === 0,
    'sent wishes stay hidden after reload'
  );
};

await finish(async () => {
  await birthdaySteps();
  // A person: birthday with age, profile colour, personal channel, cake.
  await page.locator(`[data-chat="telegram:${ANN}"]`).click();
  if ((await page.locator('.person-panel').count()) === 0) {
    await page.locator('[data-action="chat-about"]').click();
  }
  const head = page.locator('.person-panel .profile-head');
  await head.waitFor({ timeout: 10000 });
  await until(
    async () => (await page.locator('[data-birthday="true"]').count()) > 0,
    'the birthday row'
  );
  const bd = await page.locator('[data-birthday="true"]').textContent();
  assert(bd.includes('30 years old'), `age: ${bd}`);
  await until(
    async () =>
      (await head.evaluate((n) => n.style.background)).includes('gradient'),
    'the profile colour'
  );
  assert(
    (await head.getAttribute('data-profile-color')) === '3',
    'profile colour index'
  );
  assert(
    (await page.locator('[data-birthday-today="true"]').count()) === 1,
    'cake in the header'
  );
  const card = page.locator('[data-personal-channel="-10055"]');
  await card.waitFor({ timeout: 10000 });
  const cardText = await card.textContent();
  assert(
    cardText.includes('Ann Blog') &&
      cardText.includes('1,200') &&
      cardText.includes('Latest post text'),
    `card: ${cardText}`
  );
  await card.click();
  await until(
    async () =>
      (await page.locator('[data-chat="telegram:-10055"]').count()) > 0,
    'the channel opens'
  );

  // Someone without extras shows none.
  await page.locator(`[data-chat="telegram:${BOB}"]`).click();
  await page.waitForTimeout(500);
  assert((await page.locator('[data-birthday="true"]').count()) === 0, 'none');
  assert(
    (await page.locator('[data-personal-channel]').count()) === 0,
    'no card'
  );

  // Editing one's own: nothing is written before Save.
  await page.locator('button[data-view="profile"]').click();
  await page.locator('[data-action="my-profile"]').click();
  await page.locator('[data-action="open-profile-extras"]').click();
  const dialog = page.locator('[data-dialog="profile-extras"]');
  await dialog.waitFor({ timeout: 10000 });
  await dialog.locator('[data-field="birthday-day"]').selectOption('29');
  await dialog.locator('[data-field="birthday-month"]').selectOption('2');
  await dialog.locator('[data-swatch="name:8"]').waitFor({ timeout: 5000 });
  await dialog.locator('[data-swatch="name:8"]').click();
  await dialog.locator('[data-swatch="profile:3"]').click();
  assert(
    (await dialog.locator('[data-preview="profile"]').count()) === 1 &&
      (await dialog.locator('[data-preview="name"]').count()) === 1,
    'previews'
  );
  await dialog
    .locator('[data-field="personal-channel"]')
    .selectOption('-10055');
  await page.waitForTimeout(300);
  assert(writes.length === 0, `nothing written before Save: ${writes.length}`);
  await dialog.locator('button[type="submit"]').click();
  await until(() => writes.length === 4, 'four writes');
  const flat = JSON.stringify(writes);
  assert(
    flat.includes('{"day":29,"month":2}') &&
      flat.includes('{"forProfile":false,"color":8}') &&
      flat.includes('{"forProfile":true,"color":3}') &&
      flat.includes('{"chat":"-10055"}'),
    `writes: ${flat}`
  );
  await until(async () => (await dialog.count()) === 0, 'the dialog closes');
});
