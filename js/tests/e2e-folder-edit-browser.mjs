// Real browser e2e for creating and editing chat folders (R-Y164), as
// Telegram Desktop's Settings → Folders and the folder tab's menu: a
// folder made in Settings with kinds and a picked chat (the exact request
// the page sends is recorded) shows as a tab at once; a Telegram limit
// error shows in words; the tab's right-click menu edits the name, reorders
// and deletes (behind the page's own dialog, never a browser one); a
// recommended folder is added. Telegram's answers faked in the page, fake
// chats in a memory store, a server on a free port, a headless browser;
// nothing reaches a network or a running app. Not part of `npm test`; run
// it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:folder-edit

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
const at = Date.now();
const CHATS = [
  ['111', 'Fake Alice', 'user', 60_000],
  ['222', 'Fake Bob', 'user', 120_000],
  ['-333', 'Fake Team', 'group', 180_000],
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

const { base, page, until, finish } = await openChatApp('folder-edit', {
  store,
});

// Telegram's folders, faked: what the page asks and sends.
let folders = [];
let refusal = null;
const sent = { save: [], delete: [], order: [] };
const suggested = [
  {
    folder: {
      title: 'Groups',
      groups: true,
      excludeMuted: true,
      include: [],
      exclude: [],
      pinned: [],
    },
    description: 'Only groups that are not muted',
  },
];
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/folders', (route) =>
  fulfil(route, { ok: true, folders: [...folders, { id: 0, all: true }] })
);
await page.route('**/api/telegram/folders-suggested', (route) =>
  fulfil(route, { ok: true, suggested })
);
await page.route('**/api/telegram/folder-save', (route) => {
  const body = route.request().postDataJSON();
  sent.save.push(body);
  if (refusal) {
    return fulfil(route, { ok: false, code: refusal });
  }
  const id = body.id ?? Math.max(1, ...folders.map((f) => f.id)) + 1;
  folders = body.id
    ? folders.map((f) => (f.id === id ? { id, ...body.folder } : f))
    : [...folders, { id, ...body.folder }];
  return fulfil(route, { ok: true, id });
});
await page.route('**/api/telegram/folder-delete', (route) => {
  const body = route.request().postDataJSON();
  sent.delete.push(body);
  folders = folders.filter((f) => f.id !== body.id);
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/folders-reorder', (route) => {
  const body = route.request().postDataJSON();
  sent.order.push(body);
  const named = body.order.filter((id) => id !== 0);
  folders = named.map((id) => folders.find((f) => f.id === id));
  return fulfil(route, { ok: true });
});

const tabs = () =>
  page
    .locator('.chat-filters .chat-filter')
    .evaluateAll((list) =>
      list.map((b) => [b.dataset.filter, b.querySelector('span')?.textContent])
    );
const listed = () =>
  page
    .locator('.chat-list [data-chat]')
    .evaluateAll((list) => list.map((row) => row.dataset.chat));
const editor = page.locator('[data-dialog="folder-editor"]');
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const toSettings = () => page.locator('button[data-view="settings"]').click();
const toChats = () => page.locator('button[data-view="chat"]').click();

const createInSettings = async () => {
  await toSettings();
  await page.locator('[data-action="folder-create"]').click();
  await editor.waitFor({ timeout: 5000 });
  // A folder with no name or nothing in it is refused in the page.
  await editor.locator('[data-action="submit"]').click();
  assert(
    /name/i.test(
      (await editor.locator('.chat-form-error').textContent()) ?? ''
    ),
    'a name is asked for'
  );
  assert(sent.save.length === 0, 'nothing sent without a name');
  const name = editor.locator('[data-field="folder-title"]');
  await name.fill('Work');
  assert(
    (await name.getAttribute('maxlength')) === '12',
    'the name box stops at 12'
  );
  await editor.locator('[data-action="submit"]').click();
  assert(
    /kind of chat/i.test(
      (await editor.locator('.chat-form-error').textContent()) ?? ''
    ),
    'something to include is asked for'
  );
  await editor.locator('[data-icon="💼"]').click();
  const include = editor.locator('[data-section="include"]');
  await include.locator('[data-kind="groups"]').check();
  await include.locator('[data-action="folder-choose-include"]').click();
  await include.locator('[data-field="search"]').fill('alice');
  assert(
    (await include.locator('[data-include-chat]').count()) === 1,
    'the picker searches the chat list'
  );
  await include.locator('[data-include-chat="111"]').check();
  await editor
    .locator('[data-section="exclude"] [data-kind="excludeMuted"]')
    .check();
};

const settingsSteps = async () => {
  await page.goto(`${base}/`);
  await until(async () => (await listed()).length === 3, 'the chats');
  await createInSettings();

  // A limit error shows in words and keeps the editor open.
  refusal = 'too-many-folders';
  await editor.locator('[data-action="submit"]').click();
  await until(
    async () =>
      /most folders/i.test(
        (await editor.locator('.chat-form-error').textContent()) ?? ''
      ),
    'the folder limit in words'
  );
  refusal = 'include-too-much';
  await editor.locator('[data-action="submit"]').click();
  await until(
    async () =>
      /Too many chats/i.test(
        (await editor.locator('.chat-form-error').textContent()) ?? ''
      ),
    'the chat limit in words'
  );
  refusal = null;
  await editor.locator('[data-action="submit"]').click();
  await gone(editor, 'the editor closes once saved');
  assert(sent.save.length === 3, `three tries: ${sent.save.length}`);
  const expected = {
    folder: {
      title: 'Work',
      emoticon: '💼',
      contacts: false,
      nonContacts: false,
      groups: true,
      broadcasts: false,
      bots: false,
      excludeMuted: true,
      excludeRead: false,
      excludeArchived: false,
      include: ['111'],
      exclude: [],
      pinned: [],
    },
  };
  assert(
    JSON.stringify(sent.save[2]) === JSON.stringify(expected),
    `the folder sent: ${JSON.stringify(sent.save[2])}`
  );
  await until(
    async () => (await page.locator('[data-folder-id="2"]').count()) === 1,
    'the folder in the list'
  );

  // A recommended folder is added with its rules.
  await page.locator('[data-action="folder-add-suggested"]').click();
  await until(
    async () => (await page.locator('[data-folder-id="3"]').count()) === 1,
    'the recommended folder added'
  );
  const added = sent.save[3].folder;
  assert(
    added.title === 'Groups' && added.groups && added.excludeMuted,
    `recommended sent: ${JSON.stringify(added)}`
  );
  assert(
    (await page.locator('[data-suggested]').count()) === 0,
    'an added one is no longer recommended'
  );
};

const tabSteps = async () => {
  await toChats();
  await until(
    async () => (await tabs()).some(([key]) => key === 'folder:2'),
    'the new folder as a tab'
  );
  assert(
    JSON.stringify((await tabs()).map(([, label]) => label)) ===
      JSON.stringify(['Work', 'Groups', 'All']),
    `tabs: ${JSON.stringify(await tabs())}`
  );
  await page.locator('[data-filter="folder:2"]').click();
  await until(
    async () => (await listed()).join() === 'telegram:111,telegram:-333',
    'the folder takes its groups and the picked chat'
  );

  // Edit the name from the tab's menu.
  await page.locator('[data-filter="folder:2"]').click({ button: 'right' });
  await page.locator('[data-action="folder-menu-edit"]').click();
  await editor.waitFor({ timeout: 5000 });
  const name = editor.locator('[data-field="folder-title"]');
  assert((await name.inputValue()) === 'Work', 'the name is filled in');
  assert(
    await editor
      .locator('[data-section="include"] [data-kind="groups"]')
      .isChecked(),
    'the kinds are filled in'
  );
  await name.fill('Office');
  await editor.locator('[data-action="submit"]').click();
  await gone(editor, 'edit closes');
  assert(sent.save.at(-1).id === 2, 'the edit names the folder');
  assert(sent.save.at(-1).folder.title === 'Office', 'the new name sent');
  await until(
    async () =>
      (await tabs()).some(
        ([k, label]) => k === 'folder:2' && label === 'Office'
      ),
    'the tab renamed at once'
  );
};

const orderAndDelete = async () => {
  // Reorder from the tab's menu: Groups before Office.
  await page.locator('[data-filter="folder:3"]').click({ button: 'right' });
  await page.locator('[data-action="folder-menu-reorder"]').click();
  const frame = page.locator('[data-dialog="folders-reorder"]');
  await frame.waitFor({ timeout: 5000 });
  assert(
    await frame
      .locator('[data-folder-id="2"] [data-action="folder-up"]')
      .isDisabled(),
    'the first cannot go up'
  );
  await frame.locator('[data-folder-id="3"] [data-action="folder-up"]').click();
  await until(async () => sent.order.length === 1, 'the order sent');
  assert(
    JSON.stringify(sent.order[0]) === JSON.stringify({ order: [3, 0, 2] }) ||
      JSON.stringify(sent.order[0]) === JSON.stringify({ order: [3, 2] }) ||
      JSON.stringify(sent.order[0]) === JSON.stringify({ order: [3, 2, 0] }),
    `order: ${JSON.stringify(sent.order[0])}`
  );
  await until(
    async () =>
      (await tabs())
        .map(([k]) => k)
        .filter((k) => k !== 'all')
        .join() === 'folder:3,folder:2',
    'the tabs follow the order'
  );
  await page.keyboard.press('Escape');
  await gone(frame, 'reorder closes');

  // Delete from the tab's menu, behind the page's own dialog.
  await page.locator('[data-filter="folder:3"]').click({ button: 'right' });
  await page.locator('[data-action="folder-menu-delete"]').click();
  const ask = page.locator('[data-dialog="folder-delete"]');
  await ask.waitFor({ timeout: 5000 });
  assert(/Groups/.test((await ask.textContent()) ?? ''), 'it names the folder');
  await ask.locator('[data-action="cancel"]').click();
  await gone(ask, 'cancel closes');
  assert(sent.delete.length === 0, 'cancel deletes nothing');
  await page.locator('[data-filter="folder:3"]').click({ button: 'right' });
  await page.locator('[data-action="folder-menu-delete"]').click();
  await ask.locator('[data-action="submit"]').click();
  await gone(ask, 'delete closes');
  assert(
    JSON.stringify(sent.delete) === JSON.stringify([{ id: 3 }]),
    `deleted: ${JSON.stringify(sent.delete)}`
  );
  await until(
    async () => !(await tabs()).some(([key]) => key === 'folder:3'),
    'the tab gone at once'
  );
};

await finish(async () => {
  await settingsSteps();
  await tabSteps();
  await orderAndDelete();
});
