// Compare painted loading/empty positions in real page and pane layouts.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';
import { assertControlSpacing } from './helpers/e2e-controls.mjs';

const store = createMemoryStore();
const { base, page, until, finish } = await openChatApp('loading', { store });
let holdDirectory = true;
let holdDialog = true;
let holdCalls = true;
const pending = { directory: [], dialog: [], calls: [] };
const release = (kind) => pending[kind].splice(0).forEach((resume) => resume());
await page.route(/\/links\?except=msg:/, async (route) => {
  if (holdDirectory) {
    await new Promise((resolve) => pending.directory.push(resolve));
  }
  return route.continue();
});
await page.route('**/api/telegram/dialog-state', async (route) => {
  if (holdDialog) {
    await new Promise((resolve) => pending.dialog.push(resolve));
  }
  const read = {
    id: 'read:telegram:55',
    source: 'telegram',
    chat: '55',
    unreadCount: 0,
    unreadTopId: 1,
    inboxMaxId: 1,
  };
  await store.put(read);
  return fulfil(route, { ok: true, read });
});
await page.route('**/api/telegram/calls', async (route) => {
  if (holdCalls) {
    await new Promise((resolve) => pending.calls.push(resolve));
  }
  return fulfil(route, { ok: true, calls: [], next: null });
});
const center = async (selector) =>
  page.locator(selector).evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
const same = (a, b, name) =>
  assert(
    Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 3,
    `${name}: ${JSON.stringify(a)} / ${JSON.stringify(b)}`
  );
const operator = 'main[data-view="operator"]';

await finish(async () => {
  await page.goto(`${base}/#/operator`);
  await page.locator('[data-operator-loading] .spinner').waitFor();
  const initial = await center('[data-operator-loading] .spinner');
  const area = await center('.operator-workspace');
  assert(
    initial.y > area.y - 70 && initial.y < area.y + 70,
    'initial loader fills the workspace, below the toolbar'
  );
  holdDirectory = false;
  release('directory');
  await page.locator('.operator-empty').waitFor();
  same(
    initial,
    await center('.operator-empty'),
    'loading and empty state share the same center'
  );
  assert(
    (await page.locator(`${operator} .busy`).count()) === 0,
    'no top-left inline loader for a whole page'
  );
  await store.put({
    id: 'msg:telegram:55:1',
    source: 'telegram',
    chat: '55',
    chatName: 'Person',
    chatType: 'personal_chat',
    sender: '55',
    body: 'Unread',
    timestamp: new Date().toISOString(),
    raw: { id: 1 },
  });
  await store.put({
    id: 'read:telegram:55',
    source: 'telegram',
    chat: '55',
    unreadCount: 1,
    unreadTopId: 1,
    inboxMaxId: 0,
  });
  await page.locator('[data-operator-checking] .spinner').waitFor();
  same(
    initial,
    await center('[data-operator-checking] .spinner'),
    'candidate verification stays centered'
  );
  holdDialog = false;
  release('dialog');
  await page.locator('.operator-empty').waitFor();
  same(
    initial,
    await center('.operator-empty'),
    'verified zero returns to the same empty-state center'
  );
  await page.locator('button[data-view="calls"]').click();
  await page.locator('.calls-state .spinner').waitFor();
  const calls = await center('.calls-state .spinner');
  holdCalls = false;
  release('calls');
  await page.locator('.calls-scroll.calls-state').waitFor();
  same(
    calls,
    await center('.calls-scroll.calls-state'),
    'Calls loading and empty-state center'
  );
  await assertControlSpacing(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    globalThis.location.hash = '/operator';
  });
  await page.locator('.operator-empty').waitFor();
  const empty = await center('.operator-empty');
  const toolbar = await page.locator('.operator-toolbar').boundingBox();
  const bottom = await page.locator('.bottom-nav').boundingBox();
  assert(
    empty.y > toolbar.y + toolbar.height && empty.y < bottom.y,
    'phone state fits between toolbar and navigation'
  );
  await assertControlSpacing(page);
  await until(
    async () => (await page.locator('[data-operator-chat]').count()) === 0,
    'no zero-unread card'
  );
  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }
});
