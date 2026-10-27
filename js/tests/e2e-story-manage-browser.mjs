// Real browser e2e for managing one's own stories (R-Y210), as Telegram
// Desktop has it: the viewer's ⋯ menu on one's own story offers "Edit
// caption" and "Edit privacy" (the posting dialog's audiences, with the
// contacts for a chosen few), "Save to profile" / "Remove from profile",
// "Copy link" (also on someone else's public story, not on a private
// one) and "Delete story" (asked first). Telegram's answers faked in the
// page, fake chats in a memory store, a server on a free port, a headless
// browser; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:story-manage

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const ME = '7';
const store = createMemoryStore();
for (const [chat, name] of [[ANN, 'Ann Lee']]) {
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

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const NOW = Math.floor(Date.now() / 1000);
const story = (id, extra = {}) => ({
  id,
  date: NOW - 60,
  caption: `caption ${id}`,
  entities: [],
  media: { kind: 'photo' },
  ...extra,
});
const STORIES = {
  [ME]: [
    story(31, { mine: true, privacy: 'everyone', pinned: false }),
    story(32, { mine: true, privacy: 'contacts', pinned: true }),
  ],
  [ANN]: [story(11, { public: true }), story(12)],
};
const head = (peer, name, extra = {}) => ({
  peer,
  name,
  self: false,
  count: STORIES[peer].length,
  lastId: STORIES[peer].at(-1).id,
  maxReadId: 0,
  unread: true,
  ...extra,
});
const PEERS = [
  head(ME, 'Me', { self: true, unread: false }),
  head(ANN, 'Ann Lee', { maxReadId: 0 }),
];

const { base, page, until, finish } = await openChatApp('story-manage', {
  store,
});
await page.addInitScript(() => {
  globalThis.__STORY_PHOTO_MS__ = 60_000;
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text) => {
        globalThis.__copied = text;
      },
    },
  });
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignStoriesEnabled', 'on');
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/stories', (route) =>
  fulfil(route, {
    ok: true,
    peers: route.request().postDataJSON()?.hidden ? [] : PEERS,
    state: 'S',
    more: false,
  })
);
await page.route('**/api/telegram/stories-peer', (route) => {
  const { chat } = route.request().postDataJSON();
  return fulfil(route, {
    ok: true,
    peer: PEERS.find((p) => p.peer === chat),
    stories: STORIES[chat] ?? [],
  });
});
await page.route('**/api/telegram/stories-read', (route) =>
  fulfil(route, { ok: true })
);
await page.route(/\/api\/telegram\/story\?/, (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);
await page.route('**/api/telegram/chat-contacts', (route) =>
  fulfil(route, {
    ok: true,
    contacts: [{ id: '5', name: 'Cy Doe', username: null }],
  })
);
const sent = { edit: [], link: [], pin: [], remove: [] };
const record = (name, list, answer) =>
  page.route(`**/api/telegram/${name}`, (route) => {
    const body = route.request().postDataJSON();
    list.push(body);
    return fulfil(route, answer(body));
  });
await record('story-edit', sent.edit, (b) => ({
  ok: true,
  ...(b.caption === undefined ? {} : { caption: b.caption }),
  ...(b.privacy === undefined ? {} : { privacy: b.privacy }),
}));
await record('story-link', sent.link, (b) => ({
  ok: true,
  link: `https://t.me/story/${b.chat}/s/${b.id}`,
}));
await record('story-pin', sent.pin, (b) => ({
  ok: true,
  pinned: b.pinned,
  ids: b.ids,
}));
await record('story-delete', sent.remove, () => ({ ok: true }));

const view = page.locator('[data-story-viewer]');
const at = async () =>
  [
    await view.getAttribute('data-story-viewer'),
    await view.getAttribute('data-story'),
  ].join(':');
const waitAt = (want) =>
  until(async () => (await view.count()) === 1 && (await at()) === want, want);
const closeView = async () => {
  // Escape closes a panel first, then the viewer.
  if ((await view.locator('.story-menu').count()) === 1) {
    await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Escape');
  await until(async () => (await view.count()) === 0, 'closed');
};
const menu = async () => {
  await view.locator('[data-action="story-menu"]').click();
  await until(
    async () => (await view.locator('.story-menu').count()) === 1,
    'menu'
  );
};
const entry = (action) => view.locator(`[data-action="${action}"]`);
const dialog = (name) => page.locator(`[data-dialog="${name}"]`);

const openMine = async () => {
  await page.goto(`${base}/`);
  await until(
    async () => (await page.locator('[data-story-peer]').count()) === 2,
    'the strip'
  );
  await page.locator(`[data-story-peer="${ME}"]`).click();
  await waitAt(`${ME}:31`);
};

const caption = async () => {
  // 1. Edit caption: the dialog starts with the caption; Save sends it.
  await menu();
  await entry('story-edit-caption').click();
  const box = dialog('story-edit-caption');
  await until(async () => (await box.count()) === 1, 'caption dialog');
  const input = box.locator('[data-field="caption"]');
  assert((await input.inputValue()) === 'caption 31', 'current caption');
  await input.fill('  A new caption ');
  await box.locator('[data-action="submit"]').click();
  await until(() => sent.edit.length === 1, 'edit sent');
  assert(
    JSON.stringify(sent.edit[0]) ===
      JSON.stringify({ chat: ME, id: 31, caption: 'A new caption' }),
    `edit body: ${JSON.stringify(sent.edit[0])}`
  );
  await until(async () => (await box.count()) === 0, 'dialog closed');
  await until(
    async () =>
      ((await view.locator('.story-caption').textContent()) ?? '').includes(
        'A new caption'
      ),
    'the caption shown'
  );
};

const privacy = async () => {
  // 2. Edit privacy: the choices of posting; "selected" needs a contact.
  await menu();
  await entry('story-edit-privacy').click();
  const box = dialog('story-edit-privacy');
  await until(async () => (await box.count()) === 1, 'privacy dialog');
  assert(
    await box.locator('[data-choice="everyone"]').isChecked(),
    'currently everyone'
  );
  await box.locator('[data-choice="selected"]').check();
  await box.locator('[data-action="submit"]').click();
  assert(sent.edit.length === 1, 'no contact chosen: nothing sent');
  assert(
    (await box.locator('[role="alert"]').count()) === 1,
    'asks for a contact'
  );
  await box.locator('input[type="checkbox"]').first().check();
  await box.locator('[data-action="submit"]').click();
  await until(() => sent.edit.length === 2, 'privacy sent');
  assert(
    JSON.stringify(sent.edit[1]) ===
      JSON.stringify({ chat: ME, id: 31, privacy: 'selected', users: ['5'] }),
    `privacy body: ${JSON.stringify(sent.edit[1])}`
  );
  await until(async () => (await box.count()) === 0, 'dialog closed');
  // Escape closes only the dialog.
  await menu();
  await entry('story-edit-privacy').click();
  await until(async () => (await box.count()) === 1, 'dialog again');
  assert(
    await box.locator('[data-choice="selected"]').isChecked(),
    'now selected'
  );
  await page.keyboard.press('Escape');
  await until(async () => (await box.count()) === 0, 'Escape closes it');
  assert((await view.count()) === 1, 'the viewer stays');
};

const profile = async () => {
  // 3. Save to profile / Remove from profile; a link copy.
  await menu();
  assert(
    (await entry('story-pin').textContent()) === 'Save to profile',
    'save item'
  );
  await entry('story-pin').click();
  await until(() => sent.pin.length === 1, 'pin sent');
  assert(
    JSON.stringify(sent.pin[0]) ===
      JSON.stringify({ chat: ME, ids: [31], pinned: true }),
    `pin body: ${JSON.stringify(sent.pin[0])}`
  );
  await menu();
  assert(
    (await entry('story-unpin').textContent()) === 'Remove from profile',
    'remove item after saving'
  );
  await entry('story-unpin').click();
  await until(() => sent.pin.length === 2, 'unpin sent');
  assert(sent.pin[1].pinned === false, 'unpin body');
  await menu();
  await entry('story-link').click();
  await until(() => sent.link.length === 1, 'link asked');
  assert(
    JSON.stringify(sent.link[0]) === JSON.stringify({ chat: ME, id: 31 }),
    'link body'
  );
  await until(
    () => page.evaluate(() => globalThis.__copied !== undefined),
    'link copied'
  );
  assert(
    (await page.evaluate(() => globalThis.__copied)) ===
      `https://t.me/story/${ME}/s/31`,
    'the t.me link was copied'
  );
  assert(
    ((await view.locator('[data-story-note]').textContent()) ?? '') ===
      'Link copied',
    'the note'
  );
};

const remove = async () => {
  // 4. Delete story from the menu asks first.
  await menu();
  await entry('story-delete-menu').click();
  assert(
    (await view.locator('[data-story-confirm]').count()) === 1,
    'asks first'
  );
  await view.locator('[data-action="story-delete-no"]').click();
  assert(sent.remove.length === 0, 'No deletes nothing');
  await menu();
  await entry('story-delete-menu').click();
  await view.locator('[data-action="story-delete-yes"]').click();
  await until(() => sent.remove.length === 1, 'delete sent');
  assert(
    JSON.stringify(sent.remove[0]) === JSON.stringify({ chat: ME, id: 31 }),
    'delete body'
  );
  await waitAt(`${ME}:32`);
  await closeView();
};

const others = async () => {
  // 5. Someone else's story: a link only when it is public.
  await page.locator(`[data-story-peer="${ANN}"]`).click();
  await waitAt(`${ANN}:11`);
  await menu();
  assert((await entry('story-link').count()) === 1, 'public story: link');
  assert(
    (await entry('story-edit-caption').count()) === 0,
    'no editing of others’ stories'
  );
  await entry('story-link').click();
  await until(() => sent.link.length === 2, 'link asked for Ann');
  assert(sent.link[1].chat === ANN && sent.link[1].id === 11, 'which story');
  await view.locator('[data-action="story-next"]').click();
  await waitAt(`${ANN}:12`);
  await menu();
  assert((await entry('story-link').count()) === 0, 'private: no link');
  assert((await entry('story-hide').count()) === 1, 'hide stays');
  await closeView();
};

await finish(async () => {
  await openMine();
  await caption();
  await privacy();
  await profile();
  await remove();
  await others();
});
