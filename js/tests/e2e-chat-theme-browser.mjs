// Real browser e2e for chat themes and several usernames (R-Y170), as
// Telegram Desktop has them. A chat with a person has "Change colours" in
// its info column: a picker of the themes Telegram offers (each with a
// preview of its colours for the app's light or dark mode) and "No theme";
// nothing is sent until a click, a click sets (or clears) the theme, and a
// chat with a theme shows its accent and outgoing bubble colours as CSS
// variables on the chat view only. The user's own profile lists the
// usernames with their t.me links: collectible ones are activated or
// deactivated, the active ones moved up and down or dragged, each one
// request; the same for a channel the user owns, in its info column.
// Telegram's answers faked in the page, fake chats in a memory store, a
// server on a free port, a headless browser; nothing reaches a network or
// a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:chat-theme

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const BOB = '43';
const CHANNEL = '-1001234567';
const store = createMemoryStore();
for (const [chat, name, type] of [
  [ANN, 'Ann Lee', 'private'],
  [BOB, 'Bob Ray', 'private'],
  [CHANNEL, 'Our Channel', 'channel'],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: type,
    sender: chat,
    senderName: name,
    body: 'hello',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    raw: { id: 1 },
  });
}

// Colour ints as Telegram sends them (0xRRGGBB).
const THEMES = [
  {
    emoticon: '\u{1F423}',
    title: 'Chick',
    light: { base: 'day', accent: 0xff8800, outgoing: 0x112233, messages: [] },
    dark: {
      base: 'night',
      accent: 0x00aaff,
      outgoing: 0x221100,
      messages: [0x334455, 0x556677],
    },
  },
  {
    emoticon: '\u{1F337}',
    title: 'Tulip',
    light: { base: 'day', accent: 0xcc2266, outgoing: null, messages: [] },
    dark: null,
  },
];

const { base, page, until, finish } = await openChatApp('chat-theme', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  if (chat === CHANNEL) {
    return fulfil(route, {
      chat,
      kind: 'channel',
      title: 'Our Channel',
      members: 9,
      broadcast: true,
      canEditUsernames: true,
      usernames: [
        { username: 'ourchan', editable: true, active: true },
        { username: 'gold', editable: false, active: true },
        { username: 'silver', editable: false, active: false },
      ],
    });
  }
  return fulfil(route, {
    chat,
    kind: 'user',
    title: chat === BOB ? 'Bob Ray' : 'Ann Lee',
    members: 1,
    ...(chat === BOB ? { theme: THEMES[1].emoticon } : {}),
  });
});
await page.route('**/api/telegram/chat-themes', (route) =>
  fulfil(route, { ok: true, themes: THEMES })
);
const themeSets = [];
await page.route('**/api/telegram/chat-theme-set', (route) => {
  themeSets.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
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
    usernames: [
      { username: 'me', editable: true, active: true },
      { username: 'alpha', editable: false, active: true },
      { username: 'beta', editable: false, active: true },
      { username: 'gamma', editable: false, active: false },
    ],
  })
);
const toggles = [];
const reorders = [];
await page.route('**/api/telegram/username-toggle', (route) => {
  toggles.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/usernames-reorder', (route) => {
  reorders.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});

const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const openChat = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await page
    .locator(`[data-message="msg:telegram:${chat}:1"]`)
    .waitFor({ timeout: 10000 });
};
const main = page.locator('.chat-main');
const dark = () =>
  page.evaluate(() => document.documentElement.dataset.theme === 'dark');
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const vars = () =>
  main.evaluate((node) => {
    const style = globalThis.getComputedStyle(node);
    return {
      accent: style.getPropertyValue('--chat-accent').trim(),
      bubble: style.getPropertyValue('--bubble-out').trim(),
      theme: node.dataset.chatTheme ?? null,
    };
  });
const rootAccent = () =>
  page.evaluate(() =>
    globalThis
      .getComputedStyle(document.documentElement)
      .getPropertyValue('--chat-accent')
      .trim()
  );

const themeSteps = async () => {
  await page.goto(`${base}/`);
  // A chat that has a theme shows its colours on the chat view only.
  await openChat(BOB);
  await until(async () => (await vars()).theme === THEMES[1].emoticon, 'tulip');
  const tulip = await vars();
  assert(tulip.accent === hex(0xcc2266), `tulip accent: ${tulip.accent}`);
  assert((await rootAccent()) !== tulip.accent, 'the rest of the app is left');

  // A chat without one has none of it.
  await openChat(ANN);
  await until(async () => (await vars()).theme === null, 'Ann has no theme');
  assert((await vars()).accent !== hex(0xff8800), 'no theme colours');

  // The picker: none, and the two themes with their previews.
  await page.locator('[data-action="chat-about"]').click();
  await page
    .locator('.person-panel [data-action="chat-theme"]')
    .click({ timeout: 10000 });
  const dialog = page.locator('[data-dialog="chat-theme"]');
  await dialog.locator('[data-theme-tile]').nth(2).waitFor({ timeout: 10000 });
  const names = await dialog
    .locator('[data-theme-tile]')
    .evaluateAll((list) => list.map((n) => n.dataset.themeTile));
  assert(
    names.join() === ['none', ...THEMES.map((th) => th.emoticon)].join(),
    `tiles: ${names}`
  );
  assert(themeSets.length === 0, 'nothing sent before a click');
  const isDark = await dark();
  const chick = THEMES[0][isDark ? 'dark' : 'light'];
  const swatch = await dialog
    .locator(`[data-theme-tile="${THEMES[0].emoticon}"] .theme-swatch`)
    .evaluate((node) => ({
      accent: node.style.getPropertyValue('--swatch-accent'),
      bubble: node.style.getPropertyValue('--swatch-bubble'),
    }));
  assert(swatch.accent === hex(chick.accent), `swatch: ${swatch.accent}`);
  assert(
    swatch.bubble === hex(chick.messages[0] ?? chick.outgoing),
    `swatch bubble: ${swatch.bubble}`
  );

  // Choosing a theme asks Telegram once and colours the chat view.
  await dialog.locator(`[data-theme-tile="${THEMES[0].emoticon}"]`).click();
  await until(() => themeSets.length === 1, 'asked Telegram');
  assert(
    JSON.stringify(themeSets[0]) ===
      JSON.stringify({ chat: ANN, emoticon: THEMES[0].emoticon }),
    `set: ${JSON.stringify(themeSets[0])}`
  );
  await gone(dialog, 'the picker closes');
  await until(async () => (await vars()).theme === THEMES[0].emoticon, 'chick');
  const chosen = await vars();
  assert(chosen.accent === hex(chick.accent), `accent: ${chosen.accent}`);
  assert(
    chosen.bubble === hex(chick.messages[0] ?? chick.outgoing),
    `bubble: ${chosen.bubble}`
  );

  // No theme clears it.
  await page.locator('.person-panel [data-action="chat-theme"]').click();
  await dialog.locator('[data-theme-tile="none"]').click();
  await until(() => themeSets.length === 2, 'asked Telegram again');
  assert(themeSets[1].emoticon === '', 'an empty emoticon is no theme');
  await until(async () => (await vars()).theme === null, 'theme cleared');
};

const profileSteps = async () => {
  await page.locator('[data-action="my-profile"]').click();
  const dialog = page.locator('[data-dialog="my-profile"]');
  const rows = dialog.locator('[data-username]');
  await rows.nth(3).waitFor({ timeout: 10000 });
  const order = () =>
    rows.evaluateAll((list) => list.map((n) => n.dataset.username).join());
  assert((await order()) === 'me,alpha,beta,gamma', await order());
  const link = await dialog
    .locator('[data-username-link="alpha"]')
    .getAttribute('href');
  assert(link === 'https://t.me/alpha', `link: ${link}`);
  assert(
    (await dialog
      .locator(
        '[data-username="me"] [data-action="username-activate"], [data-username="me"] [data-action="username-deactivate"]'
      )
      .count()) === 0,
    'the editable one is not toggled here'
  );
  assert(toggles.length + reorders.length === 0, 'nothing sent before a click');

  // Move up / down: the active ones, one request each.
  await dialog
    .locator('[data-username="beta"] [data-action="username-up"]')
    .click();
  await until(() => reorders.length === 1, 'reordered');
  assert(
    JSON.stringify(reorders[0]) ===
      JSON.stringify({ order: ['me', 'beta', 'alpha'] }),
    `reorder: ${JSON.stringify(reorders[0])}`
  );
  await until(async () => (await order()) === 'me,beta,alpha,gamma', 'moved');
  await dialog
    .locator('[data-username="me"] [data-action="username-down"]')
    .click();
  await until(() => reorders.length === 2, 'reordered again');
  assert(reorders[1].order.join() === 'beta,me,alpha', 'down');

  // Dragging a row onto another moves it there.
  await dialog
    .locator('[data-username="alpha"]')
    .dragTo(dialog.locator('[data-username="beta"]'));
  await until(() => reorders.length === 3, 'dragged');
  assert(reorders[2].order.join() === 'alpha,beta,me', 'drag');
  await until(async () => (await order()) === 'alpha,beta,me,gamma', 'dropped');

  // Activating and deactivating (inactive ones stay after the active).
  await dialog
    .locator('[data-username="gamma"] [data-action="username-activate"]')
    .click();
  await until(() => toggles.length === 1, 'activated');
  assert(
    JSON.stringify(toggles[0]) ===
      JSON.stringify({ username: 'gamma', active: true }),
    JSON.stringify(toggles[0])
  );
  await dialog
    .locator('[data-username="alpha"] [data-action="username-deactivate"]')
    .click();
  await until(() => toggles.length === 2, 'deactivated');
  assert(toggles[1].active === false && toggles[1].username === 'alpha', 'off');
  await until(async () => (await order()) === 'beta,me,gamma,alpha', 'list');
  await page.keyboard.press('Escape');
  await gone(dialog, 'the profile closes');
};

const channelSteps = async () => {
  toggles.length = 0;
  await openChat(CHANNEL);
  // The info column may still be open from the other chat.
  if ((await page.locator('.person-panel').count()) === 0) {
    await page.locator('[data-action="chat-about"]').click();
  }
  await page
    .locator('.person-panel [data-action="chat-usernames"]')
    .click({ timeout: 10000 });
  const dialog = page.locator('[data-dialog="chat-usernames"]');
  await dialog.locator('[data-username="silver"]').waitFor({ timeout: 10000 });
  assert(
    (await dialog
      .locator('[data-username-link="silver"]')
      .getAttribute('href')) === 'https://t.me/silver',
    'the channel username link'
  );
  await dialog
    .locator('[data-username="silver"] [data-action="username-activate"]')
    .click();
  await until(() => toggles.length === 1, 'channel toggle');
  assert(
    JSON.stringify(toggles[0]) ===
      JSON.stringify({ username: 'silver', active: true, chat: CHANNEL }),
    JSON.stringify(toggles[0])
  );
  await dialog
    .locator('[data-username="silver"] [data-action="username-up"]')
    .click();
  await until(() => reorders.length === 4, 'channel reorder');
  assert(
    JSON.stringify(reorders[3]) ===
      JSON.stringify({ order: ['ourchan', 'silver', 'gold'], chat: CHANNEL }),
    JSON.stringify(reorders[3])
  );
};

await finish(async () => {
  await themeSteps();
  await profileSteps();
  await channelSteps();
});
