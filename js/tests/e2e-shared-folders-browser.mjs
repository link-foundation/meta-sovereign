// Real browser e2e for shared folders, chat lists (R-Y172), as Telegram
// Desktop has them: "Share folder" in the folder editor makes a link for
// chosen groups and channels, lists the folder's links and copies, edits
// and deletes them; a folder with kinds of chats cannot be shared; a shared
// folder is edited with chats only and left with a choice of chats to leave
// as well; a t.me/addlist link in a message opens a preview with "Add
// folder" (or "Join chats", the new chats marked, for a folder the user
// has) and nothing is joined until that press. Telegram's answers faked in
// the page, fake chats in a memory store, a server on a free port, a
// headless browser; nothing reaches a network or a running app. Not part
// of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:shared-folders

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const LINK_GROUP = '-1005';
const LINKS = {
  1: 'https://t.me/addlist/SharedSlug12',
  2: 'https://t.me/addlist/AlreadySlug1',
  3: 'https://t.me/addlist/ExpiredSlug1',
};
const store = createMemoryStore();
const at = Date.now();
const CHATS = [
  ['111', 'Fake Alice', 'user', 60_000],
  ['-333', 'Fake Team', 'group', 180_000],
  ['-444', 'Fake Club', 'group', 240_000],
];
for (const [chat, name, chatType, ago] of CHATS) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType,
    sender: '9',
    senderName: name,
    body: `hello from ${name}`,
    timestamp: new Date(at - ago).toISOString(),
    raw: { id: 1 },
  });
}
for (const [n, link] of Object.entries(LINKS)) {
  await store.put({
    id: `msg:telegram:${LINK_GROUP}:${n}`,
    source: 'telegram',
    chat: LINK_GROUP,
    chatName: 'Link Group',
    chatType: 'supergroup',
    sender: '31',
    senderName: 'Someone',
    timestamp: new Date(at - 600_000 + Number(n) * 60_000).toISOString(),
    body: `folder ${link}`,
    raw: { id: Number(n) },
  });
}

const { base, page, until, finish } = await openChatApp('shared-folders', {
  store,
});
// The clipboard recorded, so Copy is seen in any engine.
await page.addInitScript(() => {
  globalThis.__copied = [];
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text) => {
        globalThis.__copied.push(text);
      },
    },
  });
});

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
};
let folders = [
  { id: 2, title: 'Work', ...blank, include: ['-333', '-444'] },
  { id: 3, title: 'Kinds', ...blank, groups: true, include: [] },
];
let links = []; // the links of folder 2
const sent = {
  export: [],
  edit: [],
  remove: [],
  save: [],
  check: [],
  join: [],
  leave: [],
};

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/folders', (route) =>
  fulfil(route, { ok: true, folders: [...folders, { id: 0, all: true }] })
);
await page.route('**/api/telegram/folders-suggested', (route) =>
  fulfil(route, { ok: true, suggested: [] })
);
await page.route('**/api/telegram/folder-save', (route) => {
  const body = route.request().postDataJSON();
  sent.save.push(body);
  folders = folders.map((f) =>
    f.id === body.id ? { id: f.id, ...body.folder } : f
  );
  return fulfil(route, { ok: true, id: body.id });
});
await page.route('**/api/telegram/chatlist-invites', (route) =>
  fulfil(route, {
    ok: true,
    invites: links,
    chats: [
      { chat: '-333', name: 'Fake Team' },
      { chat: '-444', name: 'Fake Club' },
    ],
  })
);
await page.route('**/api/telegram/chatlist-export', (route) => {
  const body = route.request().postDataJSON();
  sent.export.push(body);
  const invite = {
    slug: 'NewSlug12345',
    title: body.title ?? '',
    url: 'https://t.me/addlist/NewSlug12345',
    chats: body.chats,
  };
  links = [...links, invite];
  // Telegram turns the folder into a shared one.
  folders = folders.map((f) =>
    f.id === body.id ? { ...f, chatlist: true, hasMyInvites: true } : f
  );
  return fulfil(route, { ok: true, invite, folderId: body.id });
});
await page.route('**/api/telegram/chatlist-invite-edit', (route) => {
  const body = route.request().postDataJSON();
  sent.edit.push(body);
  links = links.map((l) =>
    l.slug === body.slug ? { ...l, title: body.title, chats: body.chats } : l
  );
  return fulfil(route, { ok: true, invite: links[0] });
});
await page.route('**/api/telegram/chatlist-invite-delete', (route) => {
  const body = route.request().postDataJSON();
  sent.remove.push(body);
  links = links.filter((l) => l.slug !== body.slug);
  return fulfil(route, { ok: true });
});
const peer = (chat, name, joined = false) => ({
  chat,
  name,
  kind: 'channel',
  joined,
});
await page.route('**/api/telegram/chatlist-check', (route) => {
  const { slug } = route.request().postDataJSON();
  sent.check.push(slug);
  if (slug === 'SharedSlug12') {
    return fulfil(route, {
      ok: true,
      already: false,
      title: 'Team Hub',
      emoticon: '💼',
      chats: [peer('-901', 'Hub One'), peer('-902', 'Hub Two')],
    });
  }
  if (slug === 'AlreadySlug1') {
    return fulfil(route, {
      ok: true,
      already: true,
      folderId: 3,
      title: '',
      emoticon: null,
      chats: [peer('-903', 'Hub New'), peer('-333', 'Fake Team', true)],
    });
  }
  return fulfil(route, { ok: false, error: 'x', code: 'invite-expired' });
});
await page.route('**/api/telegram/chatlist-join', (route) => {
  const body = route.request().postDataJSON();
  sent.join.push(body);
  if (body.slug === 'SharedSlug12') {
    folders = [
      ...folders,
      {
        id: 5,
        title: 'Team Hub',
        ...blank,
        chatlist: true,
        include: body.chats,
      },
    ];
  }
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/chatlist-leave-suggestions', (route) =>
  fulfil(route, { ok: true, chats: ['-333'] })
);
await page.route('**/api/telegram/chatlist-leave', (route) => {
  const body = route.request().postDataJSON();
  sent.leave.push(body);
  folders = folders.filter((f) => f.id !== body.id);
  return fulfil(route, { ok: true });
});

const editor = page.locator('[data-dialog="folder-editor"]');
const share = page.locator('[data-dialog="folder-share"]');
const addlist = page.locator('[data-dialog="addlist"]');
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const row = (id) => page.locator(`[data-folder-id="${id}"]`);
const openEditor = async (id) => {
  await row(id).locator('[data-action="folder-edit"]').click();
  await editor.waitFor({ timeout: 5000 });
};
const closeShare = async () => {
  await share.locator('.icon-btn').click();
  await gone(share, 'the share window closes');
};

const shareSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator('button[data-view="settings"]').click();
  await row(2).waitFor({ timeout: 10000 });

  // A folder of kinds cannot be shared; the reason is given.
  await openEditor(3);
  await editor.locator('[data-action="folder-share"]').click();
  await share
    .locator('[data-share-problem="kinds"]')
    .waitFor({ timeout: 5000 });
  await closeShare();
  await editor.locator('[data-action="cancel"]').click();
  await gone(editor, 'the editor closes');

  // A folder of chosen groups: a link for some of them.
  await openEditor(2);
  await editor.locator('[data-action="folder-share"]').click();
  await share.locator('[data-share-form]').waitFor({ timeout: 5000 });
  assert(sent.export.length === 0, 'nothing made before the press');
  for (const chat of ['-333', '-444']) {
    assert(
      await share.locator(`[data-share-chat="${chat}"]`).isChecked(),
      `${chat} is offered, ticked`
    );
  }
  await share.locator('[data-field="share-title"]').fill('Friends');
  await share.locator('[data-share-chat="-444"]').uncheck();
  await share.locator('[data-action="share-submit"]').click();
  await share.locator('[data-slug="NewSlug12345"]').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(sent.export) ===
      JSON.stringify([{ id: 2, title: 'Friends', chats: ['-333'] }]),
    `the link asked for: ${JSON.stringify(sent.export)}`
  );
  const made = share.locator('[data-slug="NewSlug12345"]');
  assert(
    (await made.textContent())
      .split(/\s+/)
      .some((word) => word === 'https://t.me/addlist/NewSlug12345'),
    'the link is listed'
  );

  // Copy, edit, delete (asked first).
  await made.locator('[data-action="share-copy"]').click();
  await until(
    async () =>
      (await page.evaluate(() => globalThis.__copied.join())) ===
      'https://t.me/addlist/NewSlug12345',
    'copied'
  );
  await made.locator('[data-action="share-edit"]').click();
  const form = made.locator('[data-share-form]');
  await form.waitFor({ timeout: 5000 });
  assert(
    (await form.locator('[data-field="share-title"]').inputValue()) ===
      'Friends',
    'the name is filled in'
  );
  await form.locator('[data-field="share-title"]').fill('Team');
  await form.locator('[data-share-chat="-444"]').check();
  await form.locator('[data-action="share-submit"]').click();
  await until(async () => sent.edit.length === 1, 'the edit sent');
  assert(
    JSON.stringify(sent.edit[0]) ===
      JSON.stringify({
        id: 2,
        slug: 'NewSlug12345',
        title: 'Team',
        chats: ['-333', '-444'],
      }),
    `edit: ${JSON.stringify(sent.edit[0])}`
  );
  await until(
    async () =>
      (
        (await share.locator('[data-slug]').first().textContent()) ?? ''
      ).includes('Team'),
    'the new name listed'
  );
  const listed = share.locator('[data-slug="NewSlug12345"]');
  await listed.locator('[data-action="share-delete"]').click();
  assert(sent.remove.length === 0, 'the first press deletes nothing');
  await listed.locator('[data-action="share-delete-confirm"]').click();
  await until(async () => sent.remove.length === 1, 'the delete sent');
  assert(sent.remove[0].slug === 'NewSlug12345', 'the link deleted');
  await gone(share.locator('[data-slug]'), 'the link gone');
  await closeShare();
  await editor.locator('[data-action="cancel"]').click();
  await gone(editor, 'the editor closes');
};

const sharedSteps = async () => {
  // The folder is now a shared one: edited with chats only; Leave instead
  // of Delete.
  await until(
    async () =>
      (await row(2).locator('[data-action="folder-leave"]').count()) === 1,
    'Leave folder for a shared folder'
  );
  assert(
    (await row(2).locator('[data-action="folder-delete"]').count()) === 0,
    'no Delete for a shared folder'
  );
  await openEditor(2);
  assert(
    (await editor.locator('[data-kind]').count()) === 0,
    'a shared folder has no kinds'
  );
  assert(
    (await editor.locator('[data-section="exclude"]').count()) === 0,
    'a shared folder excludes nothing'
  );
  await editor.locator('[data-field="folder-title"]').fill('Work 2');
  await editor.locator('[data-action="submit"]').click();
  await gone(editor, 'the edit closes');
  const saved = sent.save.at(-1);
  assert(saved.id === 2 && saved.folder.title === 'Work 2', 'the new name');
  assert(
    saved.folder.chatlist === true &&
      saved.folder.groups === false &&
      saved.folder.exclude.length === 0 &&
      saved.folder.include.join() === '-333,-444',
    `a shared folder sent: ${JSON.stringify(saved.folder)}`
  );

  // Leave: which chats to leave as well.
  await row(2).locator('[data-action="folder-leave"]').click();
  const leave = page.locator('[data-dialog="folder-leave"]');
  await leave.waitFor({ timeout: 5000 });
  await leave.locator('[data-leave-chat="-333"]').waitFor({ timeout: 5000 });
  await until(
    async () => await leave.locator('[data-leave-chat="-333"]').isChecked(),
    'the suggested chat is ticked'
  );
  assert(
    !(await leave.locator('[data-leave-chat="-444"]').isChecked()),
    'the others are not'
  );
  await leave.locator('[data-action="cancel"]').click();
  await gone(leave, 'Cancel closes');
  assert(sent.leave.length === 0, 'Cancel leaves nothing');
  await row(2).locator('[data-action="folder-leave"]').click();
  await leave.locator('[data-leave-chat="-333"]').waitFor({ timeout: 5000 });
  await until(
    async () => await leave.locator('[data-leave-chat="-333"]').isChecked(),
    'ticked again'
  );
  await leave.locator('[data-leave-chat="-444"]').check();
  await leave.locator('[data-action="submit"]').click();
  await gone(leave, 'Leave closes');
  assert(
    JSON.stringify(sent.leave) ===
      JSON.stringify([{ id: 2, chats: ['-333', '-444'] }]),
    `left: ${JSON.stringify(sent.leave)}`
  );
  await gone(row(2), 'the folder gone from the list');
};

const linkSteps = async () => {
  await page.locator('button[data-view="chat"]').click();
  await page.locator(`[data-chat="telegram:${LINK_GROUP}"]`).click();
  const link = (n) =>
    page
      .locator(`[data-message="msg:telegram:${LINK_GROUP}:${n}"] a.msg-link`)
      .first();
  await link(1).waitFor({ timeout: 15000 });

  // A new folder: the preview first, nothing joined; choose, then add.
  await link(1).click();
  await addlist.locator('[data-addlist-title]').waitFor({ timeout: 5000 });
  assert(
    (await addlist.locator('[data-addlist-title]').textContent()) ===
      '💼 Team Hub',
    'the folder title'
  );
  assert(sent.check.join() === 'SharedSlug12', `checked: ${sent.check}`);
  assert(sent.join.length === 0, 'nothing joined before the press');
  assert(
    (await addlist.locator('[data-action="submit"]').textContent()) ===
      'Add folder',
    'Add folder'
  );
  await addlist.locator('[data-addlist-chat="-902"]').uncheck();
  await addlist.locator('[data-action="submit"]').click();
  await gone(addlist, 'closed after Add folder');
  assert(
    JSON.stringify(sent.join) ===
      JSON.stringify([{ slug: 'SharedSlug12', chats: ['-901'] }]),
    `joined: ${JSON.stringify(sent.join)}`
  );
  await until(
    async () => (await page.locator('[data-filter="folder:5"]').count()) === 1,
    'the added folder as a tab'
  );

  // A folder the user has: the new chats show; Cancel joins nothing.
  await link(2).click();
  await addlist
    .locator('[data-addlist-chat="-903"]')
    .waitFor({ timeout: 5000 });
  await until(
    async () => (await addlist.locator('[data-addlist-title]').count()) === 1,
    'the preview'
  );
  const text = await addlist.textContent();
  assert(text.includes('Kinds'), `the folder the user has: ${text}`);
  assert(text.includes('New'), 'the new chat is marked');
  assert(
    await addlist.locator('[data-addlist-chat="-333"]').isDisabled(),
    'a joined chat is locked'
  );
  assert(
    (await addlist.locator('[data-action="submit"]').textContent()) ===
      'Join chats',
    'Join chats'
  );
  await addlist.locator('[data-action="cancel"]').click();
  await gone(addlist, 'Cancel closes');
  assert(sent.join.length === 1, 'Cancel joined nothing');
  await link(2).click();
  await addlist
    .locator('[data-addlist-chat="-903"]')
    .waitFor({ timeout: 5000 });
  await addlist.locator('[data-action="submit"]').click();
  await gone(addlist, 'closed after Join chats');
  assert(
    JSON.stringify(sent.join[1]) ===
      JSON.stringify({ slug: 'AlreadySlug1', chats: ['-903'] }),
    `joined: ${JSON.stringify(sent.join[1])}`
  );

  // An expired link shows its reason as words.
  await link(3).click();
  await addlist.locator('[data-addlist-error="invite-expired"]').waitFor({
    timeout: 5000,
  });
  assert((await addlist.textContent()).includes('expired'), 'the reason');
  assert(
    (await addlist.locator('[data-action="submit"]').isDisabled()) === true,
    'nothing to add for a bad link'
  );
  await addlist.locator('[data-action="cancel"]').click();
  await gone(addlist, 'closed');
};

await finish(async () => {
  await shareSteps();
  await sharedSteps();
  await linkSteps();
});
