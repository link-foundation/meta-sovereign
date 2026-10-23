// Real browser e2e for a group's permissions, slow mode and recent actions
// (R-Y133), as Telegram Desktop's admin screens: in the info column an
// admin of a supergroup gets "Permissions" (toggles for what members may
// do, the slow mode, Save sending only what changed) and "Recent actions"
// (who did what and when, "Show more"); Escape and a click outside close
// them; Telegram's errors show as text. Telegram's answers faked in the
// page, a fake chat in a memory store, a server on a free port, a headless
// browser; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:admin

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-1005';
const store = createMemoryStore();
const message = {
  source: 'telegram',
  chat: GROUP,
  chatName: 'Fake Group',
  chatType: 'supergroup',
  body: 'hello',
};
await store.put({
  ...message,
  id: `msg:telegram:${GROUP}:1`,
  sender: '31',
  senderName: 'Someone',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const { base, page, until, finish } = await openChatApp('admin', { store });

// The info column's reads, and the supergroup an admin sees.
const fixed = {
  history: { written: 0, cached: 0, complete: true },
  'shared-counts': { ok: true, counts: {} },
  'chat-info*': { kind: 'channel', title: 'Fake Group', canBan: true },
};
for (const [name, answer] of Object.entries(fixed)) {
  await page.route(`**/api/telegram/${name}`, (route) =>
    fulfil(route, { chat: GROUP, ...answer })
  );
}

const rights = {
  sendMessages: true,
  sendMedia: true,
  embedLinks: true,
  inviteUsers: true,
  pinMessages: true,
  changeInfo: false,
  manageTopics: false,
};
let canEdit = true;
let setReply = { ok: true };
const slowReply = { ok: true };
const sets = [];
const slows = [];
const logAsks = [];
await page.route('**/api/telegram/chat-permissions', (route) =>
  fulfil(route, { ok: true, rights, slowMode: 30, canEdit })
);
await page.route('**/api/telegram/chat-permissions-set', (route) => {
  sets.push(route.request().postDataJSON());
  return fulfil(route, setReply);
});
await page.route('**/api/telegram/slow-mode', (route) => {
  slows.push(route.request().postDataJSON());
  return fulfil(route, slowReply);
});
const event = (id, kind, extra = {}) => ({
  id: String(id),
  date: Date.now() - id * 1000,
  user: '1',
  userName: 'Ann',
  kind,
  ...extra,
});
await page.route('**/api/telegram/admin-log', (route) => {
  const body = route.request().postDataJSON();
  logAsks.push(body);
  return fulfil(
    route,
    body.maxId
      ? { ok: true, events: [event(1, 'join')], next: null }
      : {
          ok: true,
          events: [
            event(3, 'title', { text: 'Brand New Name' }),
            event(2, 'slowmode', { text: '30' }),
          ],
          next: '2',
        }
  );
});

const permissions = page.locator('[data-dialog="admin-permissions"]');
const log = page.locator('[data-dialog="admin-log"]');
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const checked = (right) =>
  permissions.locator(`[data-right="${right}"]`).isChecked();

const permissionSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  await page.locator('[data-action="chat-about"]').click();
  await page
    .locator('.person-panel [data-action="permissions"]')
    .click({ timeout: 10000 });
  await permissions
    .locator('[data-right="sendMessages"]')
    .waitFor({ timeout: 5000 });
  assert(await checked('sendMessages'), 'allowed shows checked');
  assert(!(await checked('changeInfo')), 'forbidden shows unchecked');
  assert(
    await permissions.locator('[data-slow-mode="30"]').isChecked(),
    'the slow mode read'
  );
  assert(
    await permissions.locator('[data-action="save-permissions"]').isDisabled(),
    'Save waits for a change'
  );

  // Escape and a click outside close; nothing was sent.
  await page.keyboard.press('Escape');
  await gone(permissions, 'Escape closes');
  await page.locator('.person-panel [data-action="permissions"]').click();
  await permissions.waitFor({ timeout: 5000 });
  await page.mouse.click(600, 790);
  await gone(permissions, 'a click outside closes');
  assert(sets.length === 0 && slows.length === 0, 'nothing sent');

  // Only what changed is sent.
  await page.locator('.person-panel [data-action="permissions"]').click();
  await permissions.locator('[data-right="pinMessages"]').uncheck();
  await permissions.locator('[data-slow-mode="300"]').check();
  await permissions.locator('[data-action="save-permissions"]').click();
  await gone(permissions, 'closed after Save');
  assert(
    JSON.stringify(sets) ===
      JSON.stringify([{ chat: GROUP, rights: { pinMessages: false } }]),
    `rights sent: ${JSON.stringify(sets)}`
  );
  assert(
    JSON.stringify(slows) === JSON.stringify([{ chat: GROUP, seconds: 300 }]),
    `slow mode sent: ${JSON.stringify(slows)}`
  );

  // Telegram's refusal shows as text and the dialog stays.
  setReply = { ok: false, error: 'x', code: 'not-admin' };
  await page.locator('.person-panel [data-action="permissions"]').click();
  await permissions.locator('[data-right="embedLinks"]').uncheck();
  await permissions.locator('[data-action="save-permissions"]').click();
  await permissions.locator('[data-admin-error="not-admin"]').waitFor();
  assert((await permissions.textContent()).includes('admin'), 'error text');
  await page.keyboard.press('Escape');
  await gone(permissions, 'closed');

  // Without the right to ban, the toggles are only read.
  canEdit = false;
  await page.locator('.person-panel [data-action="permissions"]').click();
  await permissions.locator('[data-right="sendMessages"]').waitFor();
  assert(
    await permissions.locator('[data-right="sendMessages"]').isDisabled(),
    'locked'
  );
  assert(
    (await permissions.locator('[data-action="save-permissions"]').count()) ===
      0,
    'no Save'
  );
  await page.keyboard.press('Escape');
  await gone(permissions, 'closed');
};

const logSteps = async () => {
  await page.locator('.person-panel [data-action="admin-log"]').click();
  await log.locator('[data-event="title"]').waitFor({ timeout: 5000 });
  const text = await log.textContent();
  assert(
    text.includes('Ann') && text.includes('Brand New Name'),
    `log: ${text}`
  );
  assert(text.includes('30 seconds'), `the plural: ${text}`);
  await log.locator('[data-action="log-more"]').click();
  await log.locator('[data-event="join"]').waitFor({ timeout: 5000 });
  assert(
    logAsks[1].maxId === '2',
    `paged by maxId: ${JSON.stringify(logAsks)}`
  );
  assert(
    (await log.locator('[data-action="log-more"]').count()) === 0,
    'no more after the last page'
  );
  await page.keyboard.press('Escape');
  await gone(log, 'Escape closes the log');
};

await finish(async () => {
  await permissionSteps();
  await logSteps();
});
