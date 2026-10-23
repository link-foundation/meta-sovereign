// Real browser e2e for adding members and managing administrators (R-Y204),
// as Telegram Desktop has them: "Add members" opens a picker of contacts
// and the people written to most (a search box, a check each); the people
// whose privacy keeps them out are listed with an offer to send them the
// invite link, sent only on the button; Telegram's refusals show as text.
// The edit dialog lists the administrators with their titles and who
// promoted them; "Add administrator" picks a member and opens the Admin
// rights dialog (rights the user lacks are disabled, a custom title of up
// to 16 characters, Save); clicking an administrator allows "Dismiss
// admin"; "Chat history for new members" switches Visible and Hidden; in a
// basic group Hidden asks to convert the group to a supergroup, converts it
// and opens the new chat. Telegram's answers faked in the page, fake chats
// in a memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:admins

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const SUPER = '-1005';
const BASIC = '-77';
const NEW = '-1009001';
const store = createMemoryStore();
for (const [chat, name, type] of [
  [SUPER, 'Super Group', 'supergroup'],
  [BASIC, 'Basic Group', 'group'],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: type,
    sender: '31',
    senderName: 'Someone',
    body: `hello ${name}`,
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    raw: { id: 1 },
  });
}

const { base, page, until, finish } = await openChatApp('admins', { store });
page.on('dialog', (dialog) => {
  throw new Error(`the browser's own dialog: ${dialog.message()}`);
});

const infos = {
  [SUPER]: {
    chat: SUPER,
    kind: 'channel',
    title: 'Super Group',
    members: 20,
    canEdit: true,
    canInvite: true,
    canBan: true,
    canAddAdmins: true,
    creator: false,
    myRights: {
      changeInfo: true,
      banUsers: true,
      inviteUsers: true,
      addAdmins: true,
    },
    canToggleHistory: true,
    historyHidden: false,
  },
  [BASIC]: {
    chat: BASIC,
    kind: 'group',
    title: 'Basic Group',
    members: 3,
    canEdit: true,
    canInvite: true,
    canBan: true,
    canAddAdmins: true,
    creator: true,
    myRights: {},
    canToggleHistory: false,
    historyHidden: false,
  },
};
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(route, infos[chat] ?? infos[SUPER]);
});
await page.route('**/api/telegram/members', (route) =>
  fulfil(route, {
    ok: true,
    total: 3,
    members: [
      { id: '100', name: 'Olga Owner', role: 'creator', rank: null },
      { id: '101', name: 'Adam Admin', role: 'admin', rank: 'mod' },
      { id: '201', name: 'Eve Member', role: 'member', rank: null },
    ].map((m) => ({ username: null, self: false, ...m })),
    canBan: true,
    canInvite: true,
  })
);
await page.route('**/api/telegram/chat-add-candidates', (route) =>
  fulfil(route, {
    ok: true,
    people: [
      { id: '3', name: 'Cid Contact', username: 'cid', contact: true },
      { id: '4', name: 'Dan Private', username: null, contact: true },
      { id: '5', name: 'Fay Recent', username: null, contact: false },
    ],
  })
);
const adds = [];
const links = [];
await page.route('**/api/telegram/members-add', (route) => {
  const body = route.request().postDataJSON();
  adds.push(body);
  if (adds.length === 1) {
    return fulfil(route, { ok: false, error: 'x', code: 'users-too-much' });
  }
  return fulfil(route, {
    ok: true,
    added: body.users.filter((u) => u !== '4'),
    missing: body.users.includes('4') ? [{ id: '4', name: 'Dan Private' }] : [],
    failed: [],
  });
});
await page.route('**/api/telegram/members-invite-link', (route) => {
  links.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, sent: ['4'], failed: [] });
});
let adminReads = 0;
await page.route('**/api/telegram/chat-admins', (route) => {
  adminReads += 1;
  return fulfil(route, {
    ok: true,
    admins: [
      {
        id: '100',
        name: 'Olga Owner',
        role: 'creator',
        rank: 'boss',
        rights: {},
        promotedBy: null,
        promotedByName: null,
        canEdit: false,
        self: false,
      },
      {
        id: '101',
        name: 'Adam Admin',
        role: 'admin',
        rank: 'mod',
        rights: { banUsers: true, deleteMessages: true },
        promotedBy: '100',
        promotedByName: 'Olga Owner',
        canEdit: true,
        self: false,
      },
    ],
  });
});
const sets = [];
await page.route('**/api/telegram/admin-set', (route) => {
  sets.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
const histories = [];
await page.route('**/api/telegram/history-hidden', (route) => {
  histories.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, hidden: true });
});
const upgrades = [];
await page.route('**/api/telegram/group-upgrade', (route) => {
  upgrades.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, chat: NEW, title: 'Basic Group' });
});

const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const hash = () => page.evaluate(() => globalThis.location.hash);
const dialogOf = (name) => page.locator(`[data-dialog="${name}"]`);

const openInfo = async (chat) => {
  await page.evaluate((id) => {
    globalThis.location.hash = `chat=telegram:${id}`;
  }, chat);
  await page.locator('.chat-wall').waitFor({ timeout: 10000 });
  if ((await page.locator('.person-panel').count()) === 0) {
    await page.locator('[data-action="chat-about"]').click();
  }
  await page.locator('.person-panel [data-action="add-members"]').waitFor({
    timeout: 10000,
  });
};

const addMembersSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${SUPER}"]`).waitFor();
  await openInfo(SUPER);
  const dialog = dialogOf('add-members');
  await page.locator('.person-panel [data-action="add-members"]').click();
  await dialog.locator('[data-contact="3"]').waitFor({ timeout: 5000 });
  assert(
    (await dialog.locator('[data-contact]').count()) === 3,
    'contacts and recent people'
  );
  await dialog.locator('[data-field="search"]').fill('fay');
  await until(
    async () => (await dialog.locator('[data-contact]').count()) === 1,
    'the search narrows'
  );
  await dialog.locator('[data-field="search"]').fill('');

  // Nobody picked is refused in the page; Telegram's refusal is text.
  await dialog.locator('[data-action="submit"]').click();
  assert(
    (await dialog.textContent()).includes('Pick at least one'),
    'nobody picked'
  );
  assert(adds.length === 0, 'nothing sent for nobody');
  await dialog.locator('[data-contact="3"]').check();
  await dialog.locator('[data-contact="4"]').check();
  await dialog.locator('[data-action="submit"]').click();
  await until(
    async () => (await dialog.textContent()).includes('member limit'),
    'the refusal as text'
  );
  assert(
    JSON.stringify(adds[0]) ===
      JSON.stringify({ chat: SUPER, users: ['3', '4'] }),
    `first ask: ${JSON.stringify(adds[0])}`
  );

  // Retried: the person whose privacy refuses gets the invite-link offer.
  await dialog.locator('[data-action="submit"]').click();
  const offer = dialogOf('invite-offer');
  await offer.waitFor({ timeout: 5000 });
  assert((await offer.textContent()).includes('Dan Private'), 'names them');
  assert(links.length === 0, 'no link sent before the button');
  await offer.locator('[data-action="cancel"]').click();
  await gone(offer, 'Cancel closes the offer');
  assert(links.length === 0, 'no link sent on Cancel');

  // Again, and this time the link is sent.
  await page.locator('.person-panel [data-action="add-members"]').click();
  await dialog.locator('[data-contact="4"]').check();
  await dialog.locator('[data-action="submit"]').click();
  await offer.waitFor({ timeout: 5000 });
  await offer.locator('[data-action="submit"]').click();
  await until(async () => links.length === 1, 'the link is sent');
  assert(
    JSON.stringify(links[0]) === JSON.stringify({ chat: SUPER, users: ['4'] }),
    `link ask: ${JSON.stringify(links[0])}`
  );
  await until(
    async () => (await offer.textContent()).includes('invite link was sent'),
    'told it was sent'
  );
  await offer.locator('[data-action="submit"]').click();
  await gone(offer, 'closed');

  // Everyone added: the dialog closes by itself.
  await page.locator('.person-panel [data-action="add-members"]').click();
  await dialog.locator('[data-contact="5"]').check();
  await dialog.locator('[data-action="submit"]').click();
  await gone(dialog, 'closed once added');
  assert(adds.at(-1).users[0] === '5', 'the last ask');
};

const adminSteps = async () => {
  await page.locator('.person-panel [data-action="edit-chat"]').click();
  const edit = dialogOf('edit-chat');
  const list = edit.locator('[data-admins]');
  await list.locator('[data-admin="101"]').waitFor({ timeout: 5000 });
  const adam = list.locator('[data-admin="101"]');
  assert(
    (await adam.textContent()).includes('admin · mod') &&
      (await adam.textContent()).includes('Promoted by Olga Owner'),
    'title and who promoted'
  );
  assert(
    (await list.locator('[data-admin="100"]').textContent()).includes(
      'owner · boss'
    ),
    'the owner'
  );
  assert(
    await list.locator('[data-admin="100"] button').isDisabled(),
    'the owner cannot be opened'
  );

  // Add administrator: pick Eve, rights we lack are disabled.
  await list.locator('[data-action="add-admin"]').click();
  const pick = dialogOf('admin-pick');
  await pick.locator('[data-pick-admin="201"]').waitFor({ timeout: 5000 });
  assert(
    (await pick.locator('[data-pick-admin]').count()) === 1,
    'admins are not offered'
  );
  await pick.locator('[data-pick-admin="201"]').click();
  const rights = dialogOf('admin-rights');
  await rights.waitFor({ timeout: 5000 });
  assert(
    await rights.locator('[data-right="pinMessages"]').isDisabled(),
    'a right we lack is disabled'
  );
  assert(
    (await rights.locator('[data-right="postMessages"]').count()) === 0,
    'channel-only rights are not offered in a supergroup'
  );
  assert(
    (await rights.locator('[data-field="rank"]').getAttribute('maxlength')) ===
      '16',
    'the title is 16 characters at most'
  );
  await rights.locator('[data-right="banUsers"]').check();
  await rights.locator('[data-right="inviteUsers"]').check();
  await rights.locator('[data-field="rank"]').fill('helper');
  assert(
    (await rights.locator('[data-action="admin-dismiss"]').count()) === 0,
    'no Dismiss for a new admin'
  );
  await rights.locator('[data-action="submit"]').click();
  await gone(rights, 'closed after Save');
  const first = sets[0];
  assert(
    first.chat === SUPER &&
      first.user === '201' &&
      first.rank === 'helper' &&
      first.rights.banUsers === true &&
      first.rights.inviteUsers === true &&
      first.rights.changeInfo === false,
    `promoted: ${JSON.stringify(first)}`
  );
  assert(edit && (await edit.count()) === 1, 'the edit dialog stays');
  await until(async () => adminReads >= 2, 'the list is read again');

  // Dismiss an administrator.
  await list.locator('[data-admin="101"] button').click();
  await rights.waitFor({ timeout: 5000 });
  assert(
    await rights.locator('[data-right="banUsers"]').isChecked(),
    'their rights are filled in'
  );
  assert(
    (await rights.locator('[data-field="rank"]').inputValue()) === 'mod',
    'their title is filled in'
  );
  await rights.locator('[data-action="admin-dismiss"]').click();
  await gone(rights, 'closed after Dismiss');
  const dismissed = sets.at(-1);
  assert(
    dismissed.user === '101' && dismissed.dismiss === true,
    `dismissed: ${JSON.stringify(dismissed)}`
  );
};

const historySteps = async () => {
  const edit = dialogOf('edit-chat');
  assert(
    await edit.locator('[data-history="visible"]').isChecked(),
    'Visible is the start'
  );
  await edit.locator('[data-history="hidden"]').click();
  await until(async () => histories.length === 1, 'the toggle is sent');
  assert(
    JSON.stringify(histories[0]) ===
      JSON.stringify({ chat: SUPER, hidden: true }),
    `history: ${JSON.stringify(histories[0])}`
  );
  await until(
    () => edit.locator('[data-history="hidden"]').isChecked(),
    'Hidden shows'
  );
  await page.keyboard.press('Escape');
  await gone(edit, 'the edit dialog closes');
};

const upgradeSteps = async () => {
  await openInfo(BASIC);
  await page.locator('.person-panel [data-action="edit-chat"]').click();
  const edit = dialogOf('edit-chat');
  await edit.locator('[data-admin="101"]').waitFor({ timeout: 5000 });

  // A basic group's admin has no custom rights: the upgrade is offered.
  await edit.locator('[data-admin="101"] button').click();
  const rights = dialogOf('admin-rights');
  await rights.waitFor({ timeout: 5000 });
  assert(
    (await rights.locator('[data-right]').count()) === 0,
    'no rights checkboxes in a basic group'
  );
  await rights.locator('[data-action="admin-dismiss"]').waitFor();
  await rights.locator('[data-action="cancel"]').click();
  await gone(rights, 'closed');

  // Hidden history needs a supergroup: confirm, convert, open the new chat.
  const upgrade = dialogOf('upgrade-group');
  await edit.locator('[data-history="hidden"]').click();
  await upgrade.waitFor({ timeout: 5000 });
  assert(
    (await upgrade.textContent()).includes('convert the group to a supergroup'),
    'asks to convert'
  );
  assert(upgrades.length === 0, 'nothing converted before the button');
  await upgrade.locator('[data-action="cancel"]').click();
  await gone(upgrade, 'Cancel closes');
  assert(
    upgrades.length === 0 && histories.length === 1,
    'Cancel changed nothing'
  );
  await edit.locator('[data-history="hidden"]').click();
  await upgrade.locator('[data-action="submit"]').click();
  await until(async () => (await hash()) === `#chat=telegram:${NEW}`, 'opens');
  assert(
    JSON.stringify(upgrades) === JSON.stringify([{ chat: BASIC }]),
    `upgrades: ${JSON.stringify(upgrades)}`
  );
  assert(
    JSON.stringify(histories[1]) ===
      JSON.stringify({ chat: NEW, hidden: true }),
    `history after the upgrade: ${JSON.stringify(histories[1])}`
  );
  await gone(edit, 'the edit dialog closes');
};

// An admin who may not edit the info still reaches Administrators.
const adminsOnlySteps = async () => {
  infos[SUPER] = { ...infos[SUPER], canEdit: false };
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${SUPER}"]`).waitFor();
  await openInfo(SUPER);
  assert(
    (await page.locator('[data-action="edit-chat"]').count()) === 0,
    'no Edit without the info right'
  );
  await page.locator('[data-action="chat-admins"]').click();
  const frame = dialogOf('chat-admins');
  await frame.locator('[data-admins]').waitFor({ timeout: 5000 });
  await until(
    async () => (await frame.textContent()).includes('Adam Admin'),
    'the administrators listed'
  );
  await page.keyboard.press('Escape');
  await gone(frame, 'Escape closes it');
};

await finish(async () => {
  await addMembersSteps();
  await adminSteps();
  await historySteps();
  await upgradeSteps();
  await adminsOnlySteps();
});
