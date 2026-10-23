// Real browser e2e for which reactions a group allows (R-Y160), as Telegram
// Desktop's "Reactions" in Manage group: an admin sees "Reactions" in the
// info column, changes it to Some with two emoji (the fake records the
// request), the message menu then offers only those; with None the strip is
// gone; a non-admin sees no setting. Telegram's answers faked in the page,
// a fake chat in a memory store, a server on a free port, a headless
// browser; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:chat-reactions

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-1005';
const MESSAGE = `msg:telegram:${GROUP}:1`;
const store = createMemoryStore();
await store.put({
  source: 'telegram',
  chat: GROUP,
  chatName: 'Fake Group',
  chatType: 'group',
  body: 'hello',
  id: MESSAGE,
  sender: '31',
  senderName: 'Someone',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const { base, page, until, finish } = await openChatApp('chat-reactions', {
  store,
});

let admin = true;
const info = () => ({
  chat: GROUP,
  kind: 'group',
  title: 'Fake Group',
  reactions: { mode: 'all' },
  canSetReactions: admin,
});
const fixed = {
  history: { written: 0, cached: 0, complete: true },
  'shared-counts': { ok: true, counts: {} },
};
for (const [name, answer] of Object.entries(fixed)) {
  await page.route(`**/api/telegram/${name}`, (route) =>
    fulfil(route, { chat: GROUP, ...answer })
  );
}
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, info())
);
await page.route('**/api/telegram/available-reactions', (route) =>
  fulfil(route, {
    ok: true,
    reactions: ['👍', '👎', '❤️', '🔥', '🙏', '👏'].map((emoji) => ({
      emoji,
      title: emoji,
      premium: false,
    })),
  })
);
const sets = [];
await page.route('**/api/telegram/chat-reactions-set', (route) => {
  sets.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});

const dialog = page.locator('[data-dialog="chat-reactions"]');
const openPanel = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  await page.locator('[data-action="chat-about"]').click();
};
const strip = async () => {
  await page
    .locator(`[data-message="${MESSAGE}"]`)
    .first()
    .click({ button: 'right' });
  await page.locator('.msg-context-menu').waitFor({ timeout: 5000 });
  const emojis = await page.$$eval('.msg-context-reactions button', (buttons) =>
    buttons.map((b) => b.textContent)
  );
  await page.keyboard.press('Escape');
  await until(
    async () => (await page.locator('.msg-context-menu').count()) === 0,
    'the menu closes'
  );
  return emojis;
};

await finish(async () => {
  await openPanel();
  assert((await strip()).length === 6, 'all: the usual reactions');
  const open = page.locator('.person-panel [data-action="chat-reactions"]');
  await open.waitFor({ timeout: 10_000 });

  // Some, with two emoji.
  await open.click();
  await dialog.locator('[data-reactions-mode="all"]').waitFor();
  assert(
    await dialog.locator('[data-reactions-mode="all"]').isChecked(),
    'all is the current mode'
  );
  assert(
    await dialog.locator('[data-action="reactions-save"]').isDisabled(),
    'Save waits for a change'
  );
  await dialog.locator('[data-reactions-mode="some"]').check();
  assert(
    await dialog.locator('[data-action="reactions-save"]').isDisabled(),
    'Some needs at least one emoji'
  );
  await dialog.locator('[data-reaction="🙏"]').check();
  await dialog.locator('[data-reaction="🔥"]').check();
  await dialog.locator('[data-action="reactions-save"]').click();
  await until(async () => (await dialog.count()) === 0, 'closed after Save');
  assert(
    JSON.stringify(sets) ===
      JSON.stringify([{ chat: GROUP, mode: 'some', reactions: ['🙏', '🔥'] }]),
    `sent: ${JSON.stringify(sets)}`
  );
  const some = await strip();
  assert(
    JSON.stringify(some) === JSON.stringify(['🙏', '🔥']),
    `only those are offered: ${JSON.stringify(some)}`
  );

  // None: the strip is gone.
  await open.click();
  await dialog.locator('[data-reactions-mode="none"]').check();
  await dialog.locator('[data-action="reactions-save"]').click();
  await until(async () => (await dialog.count()) === 0, 'closed after None');
  assert(sets.at(-1).mode === 'none' && !('reactions' in sets.at(-1)), 'none');
  assert((await strip()).length === 0, 'with None the picker is gone');

  // A non-admin sees no setting.
  admin = false;
  await openPanel();
  await page.locator('.person-panel').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(500);
  assert(
    (await page.locator('[data-action="chat-reactions"]').count()) === 0,
    'no Reactions for a non-admin'
  );
});
