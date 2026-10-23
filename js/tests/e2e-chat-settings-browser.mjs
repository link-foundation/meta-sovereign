// Real browser e2e for a group's and a channel's settings (R-Y165), as
// Telegram Desktop's Manage group / channel: the creator of a channel turns
// on Sign messages (then Show authors' profiles appears) and Restrict
// saving, links a discussion group and unlinks it; an admin of a public
// supergroup turns on Join to send and Approve new members, and Hide members
// answers an error shown in words; a non-admin sees no settings; in a chat
// that restricts saving the message menu has no Forward or Copy. Telegram's
// answers faked in the page (each request recorded), fake chats in a memory
// store, a server on a free port, a headless browser; nothing reaches a
// network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:chat-settings

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHANNEL = '-1001001';
const SUPER = '-1001002';
const PLAIN = '-1001003';
const LOCKED = '-1001004';
const store = createMemoryStore();
for (const [chat, name, type] of [
  [CHANNEL, 'Fake Channel', 'channel'],
  [SUPER, 'Fake Supergroup', 'supergroup'],
  [PLAIN, 'Fake Plain', 'supergroup'],
  [LOCKED, 'Fake Locked', 'supergroup'],
]) {
  await store.put({
    source: 'telegram',
    chat,
    chatName: name,
    chatType: type,
    body: 'hello',
    id: `msg:telegram:${chat}:1`,
    sender: '31',
    senderName: 'Someone',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    raw: { id: 1 },
  });
}

const { base, page, until, finish } = await openChatApp('chat-settings', {
  store,
});

const values = (extra = {}) => ({
  signatures: false,
  signatureProfiles: false,
  joinToSend: false,
  joinRequest: false,
  hideMembers: false,
  antiSpam: false,
  noForwards: false,
  ...extra,
});
const infos = {
  [CHANNEL]: {
    kind: 'channel',
    title: 'Fake Channel',
    broadcast: true,
    settings: {
      shown: ['signatures', 'discussion', 'noForwards'],
      values: values(),
      linked: null,
    },
  },
  [SUPER]: {
    kind: 'channel',
    title: 'Fake Supergroup',
    username: 'fakegroup',
    settings: {
      shown: ['joinToSend', 'joinRequest', 'hideMembers', 'antiSpam'],
      values: values(),
      linked: null,
    },
  },
  [PLAIN]: {
    kind: 'channel',
    title: 'Fake Plain',
    settings: { shown: [], values: values(), linked: null },
  },
  [LOCKED]: {
    kind: 'channel',
    title: 'Fake Locked',
    settings: { shown: [], values: values({ noForwards: true }), linked: null },
  },
};
for (const name of ['history', 'shared-counts']) {
  await page.route(`**/api/telegram/${name}`, (route) =>
    fulfil(
      route,
      name === 'history'
        ? { written: 0, cached: 0, complete: true }
        : { ok: true, counts: {} }
    )
  );
}
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(route, { chat, ...infos[chat] });
});

const sets = [];
let setReply = () => ({ ok: true });
await page.route('**/api/telegram/chat-setting', (route) => {
  const body = route.request().postDataJSON();
  sets.push(body);
  return fulfil(route, setReply(body));
});
const links = [];
await page.route('**/api/telegram/discussion-groups', (route) =>
  fulfil(route, { ok: true, groups: [{ id: '-1009', title: 'Fake Talk' }] })
);
await page.route('**/api/telegram/discussion-set', (route) => {
  links.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});

const dialog = page.locator('[data-dialog="chat-settings"]');
const openPanel = async (chat) => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await page.locator('[data-action="chat-about"]').click();
  await page.locator('.person-panel').waitFor({ timeout: 10_000 });
};
const openSettings = async (chat) => {
  await openPanel(chat);
  await page.locator('.person-panel [data-action="chat-settings"]').click();
  await dialog.waitFor({ timeout: 5000 });
};
const flip = async (name) => {
  const before = sets.length;
  await dialog.locator(`[data-setting="${name}"]`).click();
  await until(() => sets.length > before, `${name} is sent`);
  return sets.at(-1);
};

await finish(async () => {
  // A channel's creator.
  await openSettings(CHANNEL);
  assert(
    (await dialog.locator('[data-setting="signatureProfiles"]').count()) === 0,
    'no profiles switch while signing is off'
  );
  let sent = await flip('signatures');
  assert(
    sent.chat === CHANNEL && sent.setting === 'signatures' && sent.value,
    `signatures: ${JSON.stringify(sent)}`
  );
  await dialog.locator('[data-setting="signatureProfiles"]').waitFor();
  sent = await flip('noForwards');
  assert(
    sent.setting === 'noForwards' && sent.value === true,
    'restrict saving'
  );
  await until(
    () => dialog.locator('[data-setting="noForwards"]').isChecked(),
    'the switch stays on'
  );

  // The discussion group: link, then unlink.
  await dialog.locator('[data-action="discussion-choose"]').click();
  await dialog.locator('[data-group="-1009"]').click();
  await until(() => links.length === 1, 'the group is linked');
  assert(
    links[0].chat === CHANNEL && links[0].group === '-1009',
    JSON.stringify(links[0])
  );
  await until(
    async () =>
      (await dialog.locator('[data-discussion-now]').textContent()).includes(
        'Fake Talk'
      ),
    'the linked group shows'
  );
  await dialog.locator('[data-action="discussion-unlink"]').click();
  await until(() => links.length === 2, 'the group is unlinked');
  assert(links[1].group === null, JSON.stringify(links[1]));
  await dialog.locator('[data-action="discussion-unlink"]').waitFor({
    state: 'detached',
  });

  // A public supergroup's admin.
  sets.length = 0;
  await openSettings(SUPER);
  assert(
    (await dialog.locator('[data-setting="signatures"]').count()) === 0 &&
      (await dialog.locator('[data-setting="noForwards"]').count()) === 0,
    'only the supergroup switches'
  );
  assert((await flip('joinToSend')).setting === 'joinToSend', 'join to send');
  assert((await flip('joinRequest')).setting === 'joinRequest', 'approve');
  setReply = () => ({ ok: false, code: 'too-few' });
  await flip('hideMembers');
  const alert = dialog.locator('[data-settings-error="too-few"]');
  await alert.waitFor();
  assert(
    (await alert.textContent()).includes('100 members'),
    'the error is in words'
  );
  assert(
    !(await dialog.locator('[data-setting="hideMembers"]').isChecked()),
    'a refused switch stays off'
  );
  setReply = () => ({ ok: true });
  assert((await flip('antiSpam')).setting === 'antiSpam', 'anti-spam');

  // A member sees none.
  await openPanel(PLAIN);
  await page.waitForTimeout(500);
  assert(
    (await page.locator('[data-action="chat-settings"]').count()) === 0,
    'no settings for a non-admin'
  );

  // Saving is restricted: the menu loses Forward and Copy.
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${LOCKED}"]`).click();
  await page
    .locator(`[data-message="msg:telegram:${LOCKED}:1"]`)
    .first()
    .click({ button: 'right' });
  await page.locator('.msg-context-menu').waitFor({ timeout: 5000 });
  const items = await page.$$eval('.msg-context-menu [role="menuitem"]', (n) =>
    n.map((one) => one.getAttribute('data-action'))
  );
  assert(items.includes('reply'), `the menu has Reply: ${items}`);
  assert(
    !items.includes('forward') && !items.includes('copy'),
    `no Forward or Copy: ${items}`
  );
});
