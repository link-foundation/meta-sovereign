// Real browser e2e for a group's sticker set, pinned topics' order and new
// chats in a shared folder (R-Y211), as Telegram Desktop has them:
// - in Edit group, "Group sticker set" takes a short name or a
//   t.me/addstickers link, shows the set found, saves it (the set named by
//   its short name) and takes it off; a member sees the group's set first in
//   the sticker panel and sends from it;
// - an admin drags a pinned topic's tab to a new place and the pinned
//   topics' new order is posted;
// - a shared folder with new chats shows "+N" on its tab and a bar with
//   View (a dialog: Join chats joins the ticked ones only) and Hide.
// Telegram's answers faked in the page, fake chats in a memory store, a
// server on a free port, a headless browser; nothing reaches a network or
// a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:group-stickers

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-1007';
const MEMBER_GROUP = '-1008';
const FORUM = '-1009';
const store = createMemoryStore();
const at = Date.now();
for (const [chat, name, ago] of [
  [GROUP, 'Fake Group', 60_000],
  [MEMBER_GROUP, 'Fake Club', 120_000],
  [FORUM, 'Fake Forum', 180_000],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: 'channel',
    sender: '77',
    senderName: 'Fake Erin',
    body: `hello from ${name}`,
    timestamp: new Date(at - ago).toISOString(),
    raw: { id: 1 },
  });
}
await store.put({
  id: `read:telegram:${FORUM}`,
  tokens: ['read', 'telegram', FORUM],
  kind: 'read',
  source: 'telegram',
  chat: FORUM,
  inboxMaxId: 1,
  forum: 1,
});

const { base, page, until, finish } = await openChatApp('group-stickers', {
  store,
});

// A 1x1 PNG for every sticker picture.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const sticker = (id) => ({
  id: String(id),
  kind: 'sticker',
  format: 'webp',
  emoji: '🐱',
  w: 512,
  h: 512,
});
const GROUP_SET = {
  id: '9',
  shortName: 'FakeCats',
  title: 'Fake Cats',
  count: 2,
};

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/scheduled', (route) =>
  fulfil(route, { ok: true, messages: [] })
);
await page.route('**/api/telegram/read', (route) =>
  fulfil(route, { ok: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);

// ---- The fake Telegram ------------------------------------------------------
const calls = {
  groupSet: [],
  reorder: [],
  join: [],
  hide: [],
  sends: [],
  boxes: [],
};
// What Telegram says the group has; the member's group always has the set.
let groupSet = null;
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  if (chat === FORUM) {
    return fulfil(route, {
      chat,
      kind: 'channel',
      title: 'Fake Forum',
      forum: true,
      topics: { manage: true, create: true, delete: true },
    });
  }
  const admin = chat === GROUP;
  return fulfil(route, {
    chat,
    kind: 'channel',
    title: admin ? 'Fake Group' : 'Fake Club',
    members: 150,
    canEdit: admin,
    canSetStickers: admin,
    groupStickers: {
      stickers: admin ? groupSet : GROUP_SET,
      emojis: null,
    },
  });
});
await page.route('**/api/telegram/group-sticker-set', (route) => {
  const body = route.request().postDataJSON();
  calls.groupSet.push(body);
  groupSet = body.shortName === null ? null : GROUP_SET;
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/sticker-set-box', (route) => {
  const body = route.request().postDataJSON();
  calls.boxes.push(body);
  return body.shortName === 'FakeCats'
    ? fulfil(route, {
        ok: true,
        set: { ...GROUP_SET, format: 'webp', emoji: false, installed: false },
        items: [sticker(901), sticker(902)],
      })
    : fulfil(route, { ok: false, error: 'x', code: 'unknown-set' });
});
await page.route('**/api/telegram/stickers', (route) =>
  fulfil(route, {
    ok: true,
    faved: [],
    recent: [],
    sets: [{ id: '7', title: 'Mine', count: 1, format: 'webp', emoji: false }],
  })
);
await page.route('**/api/telegram/sticker-set', (route) =>
  fulfil(route, { ok: true, id: '7', stickers: [sticker(701)] })
);
await page.route('**/api/telegram/sticker?*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);
await page.route('**/api/telegram/send-document', (route) => {
  calls.sends.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});

// Topics: General and three pinned ones, in the order Telegram keeps.
const topic = (id, title, extra = {}) => ({
  id,
  title,
  iconColor: 0x6fb9f0,
  iconEmojiId: null,
  top: id,
  unread: 0,
  readInboxMaxId: 100,
  mentions: 0,
  pinned: false,
  closed: false,
  hidden: false,
  mine: false,
  at: null,
  last: null,
  ...extra,
});
let pinned = [2, 3, 4];
const titles = { 2: 'Design', 3: 'Release', 4: 'Ideas' };
await page.route('**/api/telegram/forum-topics', (route) =>
  fulfil(route, {
    ok: true,
    forum: true,
    topics: [
      ...pinned.map((id) => topic(id, titles[id], { pinned: true })),
      topic(1, 'General'),
    ],
  })
);
await page.route('**/api/telegram/topic-reorder', (route) => {
  const body = route.request().postDataJSON();
  calls.reorder.push(body);
  pinned = body.order;
  return fulfil(route, { ok: true });
});

// Folders: two joined from links, each with new chats to join.
const blank = {
  emoticon: null,
  contacts: false,
  nonContacts: false,
  groups: false,
  broadcasts: false,
  bots: false,
  excludeMuted: false,
  excludeRead: false,
  excludeArchived: false,
  exclude: [],
  pinned: [],
  chatlist: true,
  hasMyInvites: false,
};
const folders = [
  { id: 5, title: 'Hub', ...blank, include: [GROUP] },
  { id: 6, title: 'Club', ...blank, include: [MEMBER_GROUP] },
];
const fresh = (chat, name) => ({ chat, name, kind: 'channel' });
const news = {
  5: [fresh('-901', 'Hub One'), fresh('-902', 'Hub Two')],
  6: [fresh('-903', 'Club New')],
};
await page.route('**/api/telegram/folders', (route) =>
  fulfil(route, { ok: true, folders: [...folders, { id: 0, all: true }] })
);
await page.route('**/api/telegram/folders-suggested', (route) =>
  fulfil(route, { ok: true, suggested: [] })
);
await page.route('**/api/telegram/chatlist-updates', (route) =>
  fulfil(route, { ok: true, chats: news[route.request().postDataJSON().id] })
);
await page.route('**/api/telegram/chatlist-updates-join', (route) => {
  const body = route.request().postDataJSON();
  calls.join.push(body);
  news[body.id] = [];
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/chatlist-updates-hide', (route) => {
  const body = route.request().postDataJSON();
  calls.hide.push(body);
  news[body.id] = [];
  return fulfil(route, { ok: true });
});

// ---- Helpers ------------------------------------------------------------------
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const openChat = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
};
const panel = page.locator('.emoji-panel');
const openStickers = async () => {
  await page.locator('[data-action="emoji"]').click();
  await panel.waitFor({ timeout: 5000 });
  await panel.locator('[data-tab="stickers"]').click();
  await panel.locator('[data-category="set:7"]').waitFor({ timeout: 5000 });
};
const sections = () =>
  panel
    .locator('[data-category]')
    .evaluateAll((list) => list.map((s) => s.dataset.category).join());

// ---- 1. The group's sticker set --------------------------------------------------
const groupSteps = async () => {
  await openChat(GROUP);
  await page.locator('[data-action="chat-about"]').click();
  await page.locator('.person-panel [data-action="edit-chat"]').click();
  const edit = page.locator('[data-dialog="edit-chat"]');
  await edit.waitFor({ timeout: 5000 });
  const row = edit.locator('[data-action="group-stickers"]');
  assert((await row.textContent()).includes('None'), 'no set yet');
  await row.click();
  const set = page.locator('[data-dialog="group-stickers"]');
  await set.waitFor({ timeout: 5000 });
  assert(
    (await set.locator('[data-action="submit"]').isDisabled()) === true,
    'Save waits for a set found'
  );
  await set
    .locator('[data-field="set-name"]')
    .fill('https://t.me/addstickers/FakeCats');
  await set
    .locator('[data-group-set-preview="FakeCats"]')
    .waitFor({ timeout: 5000 });
  assert(
    (await set.locator('.group-set-preview').textContent()) ===
      'Fake Cats, 2 stickers',
    'the set found is shown'
  );
  assert(calls.boxes[0].shortName === 'FakeCats', 'previewed by its name');
  assert(calls.groupSet.length === 0, 'nothing saved before the press');
  await set.locator('[data-action="submit"]').click();
  await until(() => calls.groupSet.length === 1, 'saved');
  assert(
    JSON.stringify(calls.groupSet[0]) ===
      JSON.stringify({ chat: GROUP, shortName: 'FakeCats', emojis: false }),
    `saved: ${JSON.stringify(calls.groupSet[0])}`
  );
  await gone(set, 'the dialog closes');
  await until(
    async () => (await row.textContent()).includes('Fake Cats'),
    'the row names the set'
  );

  // The set leads the sticker panel.
  await edit.locator('[data-action="cancel"]').click();
  await gone(edit, 'Edit closes');
  await openStickers();
  assert(
    (await sections()) === 'group,set:7',
    `panel sections: ${await sections()}`
  );
  await panel.locator('[data-category="group"] [data-sticker="902"]').click();
  await until(() => calls.sends.length === 1, 'a group sticker sent');
  assert(
    calls.sends[0].id === '902' && calls.sends[0].chat === GROUP,
    `sent: ${JSON.stringify(calls.sends[0])}`
  );
  await gone(panel, 'the panel closes after a send');

  // Taking the set off.
  await page.locator('.person-panel [data-action="edit-chat"]').click();
  await edit.waitFor({ timeout: 5000 });
  await row.click();
  await set.waitFor({ timeout: 5000 });
  await set.locator('[data-action="group-set-remove"]').click();
  await until(() => calls.groupSet.length === 2, 'removed');
  assert(
    calls.groupSet[1].shortName === null && calls.groupSet[1].chat === GROUP,
    `removed: ${JSON.stringify(calls.groupSet[1])}`
  );
  await gone(set, 'the dialog closes again');
  await edit.locator('[data-action="cancel"]').click();
  await gone(edit, 'Edit closes again');
  await openStickers();
  assert((await sections()) === 'set:7', `no group set: ${await sections()}`);
  await page.keyboard.press('Escape');
  await gone(panel, 'the panel closes');
};

// A member: no Edit, but the group's set in the panel.
const memberSteps = async () => {
  await openChat(MEMBER_GROUP);
  await page.locator('[data-action="chat-about"]').click();
  await page.waitForTimeout(300);
  assert(
    (await page.locator('[data-action="edit-chat"]').count()) === 0,
    'a member has no Edit'
  );
  await openStickers();
  assert(
    (await sections()) === 'group,set:7',
    `member sections: ${await sections()}`
  );
  await page.keyboard.press('Escape');
  await gone(panel, 'the panel closes');
};

// ---- 2. Dragging a pinned topic -------------------------------------------------------
const topicSteps = async () => {
  await openChat(FORUM);
  const strip = page.locator('nav.chat-topics');
  await strip.waitFor({ timeout: 10000 });
  const order = () =>
    strip
      .locator('[data-topic]')
      .evaluateAll((all) => all.map((n) => n.dataset.topic).join());
  assert((await order()) === 'all,2,3,4,1', `topics: ${await order()}`);
  const first = await strip.locator('[data-topic="2"]').boundingBox();
  const last = await strip.locator('[data-topic="4"]').boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2 + 10, first.y + 5, {
    steps: 4,
  });
  await page.mouse.move(last.x + last.width - 4, last.y + last.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await until(() => calls.reorder.length === 1, 'the new order posted');
  assert(
    JSON.stringify(calls.reorder[0]) ===
      JSON.stringify({ chat: FORUM, order: [3, 4, 2] }),
    `reorder: ${JSON.stringify(calls.reorder[0])}`
  );
  await until(
    async () => (await order()) === 'all,3,4,2,1',
    'the strip follows'
  );
};

// ---- 3. New chats in a shared folder ------------------------------------------------------
const folderSteps = async () => {
  const tab = (id) => page.locator(`[data-filter="folder:${id}"]`);
  const bar = (id) => page.locator(`[data-folder-updates="${id}"]`);
  await tab(5).waitFor({ timeout: 10000 });
  await until(
    async () => (await tab(5).locator('[data-new-chats="2"]').count()) === 1,
    'the tab says +2'
  );
  assert(
    (await tab(6).locator('[data-new-chats="1"]').count()) === 1,
    'and +1 on the other'
  );
  assert((await bar(5).count()) === 0, 'no bar while the folder is closed');
  await tab(5).click();
  assert(
    (await bar(5).textContent()).includes('2 new chats'),
    `bar: ${await bar(5).textContent()}`
  );
  await bar(5).locator('[data-action="folder-updates-view"]').click();
  const dialog = page.locator('[data-dialog="folder-updates"]');
  await dialog.waitFor({ timeout: 5000 });
  assert(calls.join.length === 0, 'nothing joined before the press');
  await dialog.locator('[data-update-chat="-902"]').uncheck();
  await dialog.locator('[data-action="submit"]').click();
  await until(() => calls.join.length === 1, 'join posted');
  assert(
    JSON.stringify(calls.join[0]) ===
      JSON.stringify({ id: 5, chats: ['-901'] }),
    `join: ${JSON.stringify(calls.join[0])}`
  );
  await gone(dialog, 'the dialog closes');
  await gone(bar(5), 'the bar goes');
  await gone(tab(5).locator('[data-new-chats]'), 'the badge goes');

  // Hide puts the notice away without joining.
  await tab(6).click();
  await bar(6).waitFor({ timeout: 5000 });
  await bar(6).locator('[data-action="folder-updates-dismiss"]').click();
  await until(() => calls.hide.length === 1, 'hide posted');
  assert(calls.hide[0].id === 6, 'the right folder');
  await gone(bar(6), 'the bar goes after Hide');
  assert(calls.join.length === 1, 'Hide joined nothing');
};

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator('[data-filter="folder:5"]').waitFor({ timeout: 15000 });
  await groupSteps();
  await memberSteps();
  await topicSteps();
  await folderSteps();
});
