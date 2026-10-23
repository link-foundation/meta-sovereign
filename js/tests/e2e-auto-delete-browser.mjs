// Real browser e2e for a chat's auto-delete timer and Saved Messages by
// chat (R-Y143), as Telegram Desktop has them: "Auto-delete messages…" in
// the info column opens Off / 1 day / 1 week / 1 month (and "Other…"),
// Save sends the period and a small timer badge shows by the title; a
// member who may not delete messages is not offered it; a message with a
// timer shows a small icon. In Saved Messages "View as chats" lists the
// chats the messages came from (paged), a click shows what was saved from
// one, Back returns, and deleting asks first. Telegram's answers faked in
// the page, fake chats in a memory store, a server on a free port, a
// headless browser; nothing reaches a network or a running app. Not part
// of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:auto-delete

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-1005';
const MEMBERS = '-1006';
const ME = '6';
const store = createMemoryStore();
const stamp = () => new Date(Date.now() - 60_000).toISOString();
for (const [chat, name, type, extra] of [
  [GROUP, 'Fake Group', 'supergroup', { raw: { id: 1, ttlPeriod: 86400 } }],
  [MEMBERS, 'Other Group', 'supergroup', { raw: { id: 1 } }],
  [ME, 'Saved Messages', 'private', { raw: { id: 1 } }],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: type,
    sender: chat === ME ? 'me' : '31',
    senderName: 'Someone',
    body: 'hello',
    timestamp: stamp(),
    ...extra,
  });
}

const { base, page, until, finish } = await openChatApp('auto-delete', {
  store,
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
const infos = {
  [GROUP]: {
    kind: 'channel',
    title: 'Fake Group',
    canSetTtl: true,
    ttlPeriod: 0,
  },
  [MEMBERS]: { kind: 'channel', title: 'Other Group', canSetTtl: false },
  [ME]: { kind: 'user', title: 'Saved Messages', self: true, canSetTtl: false },
};
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(route, { chat, ...infos[chat] });
});

let ttlReply = { ok: true };
const ttls = [];
await page.route('**/api/telegram/history-ttl', (route) => {
  ttls.push(route.request().postDataJSON());
  return fulfil(route, ttlReply);
});

const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const dialog = page.locator('[data-dialog="history-ttl"]');
const open = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
};

const timerSteps = async () => {
  await page.goto(`${base}/`);

  // A member who may not delete messages is not offered the item.
  await open(MEMBERS);
  await page.locator('[data-action="chat-about"]').click();
  await page.locator('.person-panel').waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  assert(
    (await page.locator('[data-action="history-ttl"]').count()) === 0,
    'hidden without the right'
  );

  // An admin gets it; nothing is sent until Save.
  await open(GROUP);
  await page
    .locator('.person-panel [data-action="history-ttl"]')
    .click({ timeout: 10000 });
  await dialog.locator('[data-ttl="0"]').waitFor({ timeout: 5000 });
  assert(await dialog.locator('[data-ttl="0"]').isChecked(), 'Off is current');
  assert(
    await dialog.locator('[data-action="ttl-save"]').isDisabled(),
    'Save waits for a change'
  );
  assert((await page.locator('[data-ttl-badge]').count()) === 0, 'no badge');
  await page.keyboard.press('Escape');
  await gone(dialog, 'Escape closes');
  assert(ttls.length === 0, 'nothing sent');

  // "Other…" adds the longer periods.
  await page.locator('.person-panel [data-action="history-ttl"]').click();
  assert((await dialog.locator('[data-ttl="7776000"]').count()) === 0, 'short');
  await dialog.locator('[data-action="ttl-other"]').click();
  await dialog.locator('[data-ttl="7776000"]').waitFor();

  // Telegram's refusal shows as text and the dialog stays.
  ttlReply = { ok: false, error: 'x', code: 'not-admin' };
  await dialog.locator('[data-ttl="604800"]').check();
  await dialog.locator('[data-action="ttl-save"]').click();
  await dialog.locator('[data-ttl-error="not-admin"]').waitFor();
  assert((await dialog.textContent()).includes('admins'), 'error text');

  // One week: sent, the badge shows by the title.
  ttlReply = { ok: true };
  await dialog.locator('[data-action="ttl-save"]').click();
  await gone(dialog, 'closed after Save');
  assert(
    JSON.stringify(ttls.at(-1)) ===
      JSON.stringify({ chat: GROUP, period: 604800 }),
    `sent: ${JSON.stringify(ttls)}`
  );
  await page
    .locator('.chat-header [data-ttl-badge="604800"]')
    .waitFor({ timeout: 5000 });
  assert(
    (
      await page.locator('.chat-header [data-ttl-badge]').textContent()
    ).includes('1w'),
    'the badge says 1w'
  );

  // The dialog shows the current period.
  await page.locator('.person-panel [data-action="history-ttl"]').click();
  assert(
    await dialog.locator('[data-ttl="604800"]').isChecked(),
    'one week is current'
  );
  await page.keyboard.press('Escape');
  await gone(dialog, 'closed');

  // A message with a timer shows its icon.
  await page
    .locator('.bubble-time:not(.bubble-time-spacer) [data-message-ttl="86400"]')
    .waitFor({ timeout: 5000 });
};

const savedDialog = (peer, name, id, preview) => ({
  peer,
  kind: 'user',
  name,
  id,
  date: Date.now() - id * 60_000,
  preview,
  media: null,
  pinned: false,
});
const asks = [];
const deleted = [];
const savedSteps = async () => {
  await page.route('**/api/telegram/saved-dialogs', (route) => {
    const body = route.request().postDataJSON();
    asks.push(body);
    return fulfil(
      route,
      body.offsetPeer
        ? {
            ok: true,
            dialogs: [savedDialog('44', 'Cara Fox', 3, 'third')],
            complete: true,
            next: null,
          }
        : {
            ok: true,
            dialogs: [
              savedDialog('42', 'Ann Lee', 1, 'first saved'),
              savedDialog('43', 'Bob Ray', 2, 'second saved'),
            ],
            complete: false,
            next: { offsetDate: 100, offsetId: 2, offsetPeer: '43' },
          }
    );
  });
  const histories = [];
  await page.route('**/api/telegram/saved-history', (route) => {
    const body = route.request().postDataJSON();
    histories.push(body);
    return fulfil(route, {
      ok: true,
      complete: true,
      messages: [
        {
          id: `msg:telegram:${ME}:21`,
          source: 'telegram',
          chat: ME,
          sender: 'me',
          body: `from ${body.peer}`,
          timestamp: stamp(),
          raw: { id: 21 },
        },
      ],
    });
  });
  let deleteReply = { ok: true };
  await page.route('**/api/telegram/saved-delete', (route) => {
    deleted.push(route.request().postDataJSON());
    return fulfil(route, deleteReply);
  });

  await open(ME);
  await page.locator('[data-action="saved-view"]').click({ timeout: 10000 });
  await page.locator('[data-saved-peer="42"]').waitFor({ timeout: 5000 });
  const text = await page.locator('[data-saved="chats"]').textContent();
  assert(
    text.includes('Ann Lee') &&
      text.includes('Bob Ray') &&
      text.includes('second saved'),
    `the list: ${text}`
  );
  // The header toggle says how to go back.
  assert(
    (await page.locator('[data-action="saved-view"]').getAttribute('title')) ===
      'View as messages',
    'toggle title'
  );

  // Paging by the cursor Telegram gave.
  await page.locator('[data-action="saved-more"]').click();
  await page.locator('[data-saved-peer="44"]').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(asks[1]) ===
      JSON.stringify({ offsetDate: 100, offsetId: 2, offsetPeer: '43' }),
    `paged: ${JSON.stringify(asks)}`
  );
  assert(
    (await page.locator('[data-action="saved-more"]').count()) === 0,
    'no more after the last page'
  );

  // A sub-chat shows what was saved from it; Back returns to the list.
  await page.locator('[data-saved-peer="42"]').click();
  await page
    .locator('[data-saved="messages"] [data-message]')
    .waitFor({ timeout: 5000 });
  assert(
    (await page.locator('[data-saved="messages"]').textContent()).includes(
      'from 42'
    ),
    'its messages'
  );
  assert(histories[0].peer === '42' && histories[0].chat === ME, 'asked');
  await page.locator('[data-action="saved-back"]').click();
  await page.locator('[data-saved-peer="43"]').waitFor({ timeout: 5000 });

  // Deleting asks first; Cancel deletes nothing.
  const confirm = page.locator('[data-dialog="saved-delete"]');
  await page.locator('[data-saved-peer="43"]').click();
  await page.locator('[data-saved="messages"]').waitFor();
  await page
    .locator('[data-saved="messages"] [data-action="saved-delete"]')
    .click();
  await confirm.waitFor();
  await confirm.locator('[data-action="cancel"]').click();
  await gone(confirm, 'Cancel closes');
  assert(deleted.length === 0, 'nothing deleted');
  deleteReply = { ok: false, error: 'x', code: 'no-access' };
  await page
    .locator('[data-saved="messages"] [data-action="saved-delete"]')
    .click();
  await confirm.locator('[data-action="saved-delete-confirm"]').click();
  await confirm.locator('[data-saved-error="no-access"]').waitFor();
  deleteReply = { ok: true };
  await confirm.locator('[data-action="saved-delete-confirm"]').click();
  await page.locator('[data-saved="chats"]').waitFor({ timeout: 5000 });
  assert(deleted.at(-1).peer === '43', `deleted: ${JSON.stringify(deleted)}`);

  // Back to messages: the chat as it was.
  await page.locator('[data-action="saved-view"]').click();
  await page.locator('textarea').waitFor({ timeout: 5000 });
  assert((await page.locator('[data-saved]').count()) === 0, 'messages again');
};

await finish(async () => {
  await timerSteps();
  await savedSteps();
});
