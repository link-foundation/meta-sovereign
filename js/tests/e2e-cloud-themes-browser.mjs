// Real browser e2e for cloud themes and the per-chat translation switch
// (R-Y209), as Telegram Desktop has them: Settings lists the cloud themes
// as cards drawn from their colours; Apply maps a theme onto the app's
// accent, outgoing bubble and light or dark mode (kept over a reload, the
// account told), "Back to default" restores; a t.me/addtheme link in a
// message opens a preview with Apply; a chat's ⋯ menu turns the offer to
// translate it off and back on, and shows what the chat's info says.
// Telegram's answers faked in the page, fake chats in a memory store, a
// server on a free port, a headless browser; nothing reaches a network or
// a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:cloud-themes

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const BOB = '43';
const store = createMemoryStore();
for (const [chat, name, id, body] of [
  [ANN, 'Ann Lee', 1, 'hello'],
  [ANN, 'Ann Lee', 2, 'Try https://t.me/addtheme/linkedtheme today'],
  [BOB, 'Bob Ray', 1, 'hello'],
]) {
  await store.put({
    id: `msg:telegram:${chat}:${id}`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: 'private',
    sender: chat,
    senderName: name,
    body,
    timestamp: new Date(Date.now() - 60_000 + id).toISOString(),
    raw: { id },
  });
}

// Colour ints as Telegram sends them (0xRRGGBB).
const colours = (base, accent, outgoing) => ({
  base,
  accent,
  outgoing,
  messages: [],
});
const THEMES = [
  {
    id: '11',
    accessHash: '111',
    slug: 'sunset',
    title: 'Sunset',
    light: colours('day', 0xff8800, 0x112233),
    dark: colours('night', 0x00aaff, 0x221100),
  },
  {
    id: '12',
    accessHash: '121',
    slug: 'midnight',
    title: 'Midnight',
    light: null,
    dark: colours('night', 0x9933cc, 0x330044),
  },
  {
    id: '13',
    accessHash: '131',
    slug: 'fileonly',
    title: 'File only',
    light: null,
    dark: null,
  },
];
const LINKED = {
  id: '14',
  accessHash: '141',
  slug: 'linkedtheme',
  title: 'Linked',
  light: colours('day', 0x22aa44, 0x113311),
  dark: null,
};

const { base, page, until, finish } = await openChatApp('cloud-themes', {
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
  return fulfil(route, {
    chat,
    kind: 'user',
    title: chat === BOB ? 'Bob Ray' : 'Ann Lee',
    members: 1,
    ...(chat === BOB ? { translationsDisabled: true } : {}),
  });
});
await page.route('**/api/telegram/cloud-themes', (route) =>
  fulfil(route, { ok: true, themes: THEMES })
);
await page.route('**/api/telegram/cloud-theme', (route) =>
  route.request().postDataJSON().slug === 'linkedtheme'
    ? fulfil(route, { ok: true, theme: LINKED })
    : fulfil(route, { ok: false, code: 'not-found' })
);
const installs = [];
await page.route('**/api/telegram/cloud-theme-install', (route) => {
  installs.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
const toggles = [];
await page.route('**/api/telegram/translations-toggle', (route) => {
  const body = route.request().postDataJSON();
  toggles.push(body);
  return fulfil(route, { ok: true, disabled: body.disabled });
});

const root = (name) =>
  page.evaluate(
    (n) => ({
      inline: document.documentElement.style.getPropertyValue(n),
      theme: document.documentElement.dataset.theme,
      slug: document.documentElement.dataset.cloudTheme ?? null,
    }),
    name
  );
const toSettings = async () => {
  await page.locator('button[data-view="settings"]').click();
  await page.locator('[data-section="cloud-themes"]').waitFor();
};
const toChat = async (chat) => {
  await page.locator('button[data-view="chat"]').click();
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await page
    .locator(`[data-message="msg:telegram:${chat}:1"]`)
    .waitFor({ timeout: 10000 });
};
const card = (slug) => page.locator(`[data-theme-card="${slug}"]`);
const menuItem = async () => {
  const toggle = page.locator('[data-action="chat-more"]');
  const item = page.locator('[data-action="translations-toggle"]');
  // The header can redraw while the chat's info arrives, closing the menu.
  await until(async () => {
    if ((await item.count()) === 0) {
      await toggle.click();
      await page.waitForTimeout(100);
    }
    return (await item.count()) === 1;
  }, 'the menu lists the switch');
  return item;
};

const itemText = async () =>
  (await menuItem()).textContent({ timeout: 1000 }).catch(() => null);

await finish(async () => {
  await page.goto(`${base}/`);

  // The switch: the menu offers "Do not translate"; asked, then the offer back.
  await toChat(ANN);
  await until(
    async () => (await itemText()) === 'Do not translate this chat',
    'the menu offers Do not translate'
  );
  await (await menuItem()).click();
  await until(() => toggles.length === 1, 'toggle asked');
  assert(
    toggles[0].chat === ANN && toggles[0].disabled === true,
    JSON.stringify(toggles[0])
  );
  await until(
    async () => (await itemText()) === 'Offer to translate this chat',
    'the offer back is shown'
  );
  await (await menuItem()).click();
  await until(() => toggles.length === 2, 'toggle back asked');
  assert(toggles[1].disabled === false, JSON.stringify(toggles[1]));
  // A chat whose info says it is off shows the offer back.
  await toChat(BOB);
  await until(
    async () => (await itemText()) === 'Offer to translate this chat',
    'info respected'
  );
  await page.keyboard.press('Escape');

  // The cards: drawn from the colours; a theme without any cannot apply.
  await toSettings();
  await until(
    async () => (await page.locator('.cloud-theme').count()) === 3,
    'three cards'
  );
  assert(
    (await card('fileonly')
      .locator('[data-action="cloud-theme-apply"]')
      .isDisabled()) === true,
    'no colours, no apply'
  );
  assert(
    (await page.locator('[data-action="cloud-theme-default"]').isDisabled()) ===
      true,
    'default is current'
  );
  const accentOf = (slug) =>
    card(slug)
      .locator('.cloud-theme-preview')
      .evaluate((n) => n.style.getPropertyValue('--ct-accent'));

  // Apply a theme with both sides: the accent and bubble of the current mode.
  const before = (await root('--accent')).theme;
  await card('sunset').locator('[data-action="cloud-theme-apply"]').click();
  await until(
    async () => (await root('--accent')).slug === 'sunset',
    'applied'
  );
  const sunset = await root('--accent');
  const wanted = before === 'dark' ? '#00aaff' : '#ff8800';
  assert(sunset.inline === wanted, `accent: ${sunset.inline} != ${wanted}`);
  assert(sunset.theme === before, 'the mode is left alone');
  assert(
    (await accentOf('sunset')) === wanted,
    `card accent: ${await accentOf('sunset')}`
  );
  await until(() => installs.length === 1, 'the account told');
  assert(
    installs[0].id === '11' && installs[0].accessHash === '111',
    JSON.stringify(installs[0])
  );
  assert(
    (await card('sunset').getAttribute('class')).includes('is-selected'),
    'selected'
  );

  // It survives a reload.
  await page.reload();
  await page.locator('button[data-view="settings"]').click();
  await until(async () => (await root('--accent')).slug === 'sunset', 'kept');
  assert((await root('--accent')).inline === wanted, 'accent kept');

  // A dark-only theme switches the page to dark; back to default restores.
  await card('midnight').locator('[data-action="cloud-theme-apply"]').click();
  await until(async () => (await root('--accent')).theme === 'dark', 'dark');
  assert((await root('--accent')).inline === '#9933cc', 'midnight accent');
  assert((await root('--bubble-out')).inline === '#330044', 'bubble');
  await page.locator('[data-action="cloud-theme-default"]').click();
  await until(async () => (await root('--accent')).slug === null, 'reset');
  const reset = await root('--accent');
  assert(reset.inline === '', `accent cleared: ${reset.inline}`);
  assert(reset.theme === before, `mode restored: ${reset.theme}`);
  assert((await root('--bubble-out')).inline === '', 'bubble cleared');
  await until(
    () => installs.some((i) => i.reset === true),
    'the default recorded'
  );

  // A t.me/addtheme link opens a preview with Apply.
  await toChat(ANN);
  await page.locator('[data-message="msg:telegram:42:2"] a.msg-link').click();
  const dialog = page.locator('[data-dialog="add-theme"]');
  await dialog.waitFor();
  await dialog.locator('[data-theme-card="linkedtheme"]').waitFor();
  await dialog.locator('[data-action="theme-link-apply"]').click();
  await until(
    async () => (await root('--accent')).slug === 'linkedtheme',
    'linked applied'
  );
  assert((await root('--accent')).inline === '#22aa44', 'linked accent');
  assert((await dialog.count()) === 0, 'dialog closed');
});
