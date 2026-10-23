// Real browser e2e for a group's invite links and join requests (R-Y152),
// as Telegram Desktop's "Manage" screens: in the info column an admin who
// may invite sees "Invite links" (the primary link, the other links with
// how many joined, create, revoke, who joined through one, delete the
// revoked) and "Member requests"; under the header a slim bar says "N
// requested to join" and opens the requests, each Approved or Dismissed.
// Telegram's answers faked in the page, a fake chat in a memory store, a
// server on a free port, a headless browser; nothing reaches a network or
// a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:invite-links

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-1005';
const PRIMARY = 'https://t.me/+PrimaryLink1';
const FRIENDS = 'https://t.me/+FriendsLink01';
const NEWER = 'https://t.me/+NewerLink001';
const store = createMemoryStore();
await store.put({
  source: 'telegram',
  chat: GROUP,
  chatName: 'Fake Group',
  chatType: 'supergroup',
  body: 'hello',
  id: `msg:telegram:${GROUP}:1`,
  sender: '31',
  senderName: 'Someone',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const { base, page, until, finish } = await openChatApp('invite-links', {
  store,
});

const fixed = {
  history: { written: 0, cached: 0, complete: true },
  'shared-counts': { ok: true, counts: {} },
  'chat-info*': {
    kind: 'channel',
    title: 'Fake Group',
    canInvite: true,
    inviteLink: PRIMARY,
    requestsPending: 2,
    recentRequesters: [
      { id: '5', name: 'Ann Lee' },
      { id: '6', name: 'Bob Ray' },
    ],
  },
};
for (const [name, answer] of Object.entries(fixed)) {
  await page.route(`**/api/telegram/${name}`, (route) =>
    fulfil(route, { chat: GROUP, ...answer })
  );
}
await page.route('**/api/telegram/avatar*', (route) =>
  route.fulfill({ status: 404, body: '' })
);

// The fake account's links and requests.
const invite = (link, extra = {}) => ({
  link,
  title: '',
  revoked: false,
  permanent: false,
  requestNeeded: false,
  date: Date.now() - 86_400_000,
  expireDate: 0,
  usageLimit: 0,
  usage: 0,
  requested: 0,
  ...extra,
});
const links = [
  invite(PRIMARY, { permanent: true }),
  invite(FRIENDS, {
    title: 'Friends',
    usage: 2,
    usageLimit: 10,
    expireDate: Date.now() + 86_400_000,
  }),
];
let requests = [
  {
    id: '5',
    accessHash: '55',
    name: 'Ann Lee',
    date: Date.now() - 3_600_000,
    about: 'Please let me in',
    requested: true,
  },
  {
    id: '6',
    accessHash: '66',
    name: 'Bob Ray',
    date: Date.now() - 7_200_000,
    requested: true,
  },
];
const posted = {};
const record = (name) => (route) => {
  const body = route.request().postDataJSON();
  (posted[name] ??= []).push(body);
  return body;
};

await page.route('**/api/telegram/invite-links', (route) => {
  const body = record('links')(route);
  const mine = links.filter((l) => l.revoked === Boolean(body.revoked));
  return fulfil(route, {
    ok: true,
    primary: body.revoked ? null : PRIMARY,
    links: mine.filter((l) => !l.permanent),
    count: mine.length,
    next: null,
  });
});
await page.route('**/api/telegram/invite-create', (route) => {
  const body = record('create')(route);
  const made = invite(NEWER, {
    title: body.title ?? '',
    usageLimit: body.usageLimit ?? 0,
    expireDate: (body.expireDate ?? 0) * 1000,
  });
  links.push(made);
  return fulfil(route, { ok: true, invite: made });
});
await page.route('**/api/telegram/invite-edit', (route) => {
  const body = record('edit')(route);
  const found = links.find((l) => l.link === body.link);
  if (body.revoked) {
    found.revoked = true;
  }
  return fulfil(route, { ok: true, invite: found });
});
await page.route('**/api/telegram/invite-delete-revoked', (route) => {
  record('deleteRevoked')(route);
  for (let i = links.length - 1; i >= 0; i -= 1) {
    if (links[i].revoked) {
      links.splice(i, 1);
    }
  }
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/invite-importers', (route) => {
  const body = record('importers')(route);
  const rows = body.requested
    ? requests
    : [
        {
          id: '9',
          name: 'Cy Joined',
          date: Date.now() - 1000,
          requested: false,
        },
      ];
  return fulfil(route, {
    ok: true,
    importers: rows,
    count: rows.length,
    next: null,
  });
});
await page.route('**/api/telegram/join-request-hide', (route) => {
  const body = record('hide')(route);
  requests = requests.filter((r) => r.id !== body.user);
  return fulfil(route, { ok: true });
});

const dialog = (name) => page.locator(`[data-dialog="${name}"]`);
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);

const linkSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  await page.locator('[data-action="chat-about"]').click();
  await page
    .locator('.person-panel [data-action="invite-links"]')
    .click({ timeout: 10000 });
  const box = dialog('invite-links');
  await box.locator('[data-primary]').waitFor({ timeout: 5000 });
  assert(
    (await box.locator('[data-primary]').textContent()).includes(PRIMARY),
    'the primary link shows'
  );
  assert(
    (await box.locator('[data-action="copy-primary"]').count()) === 1 &&
      (await box.locator('[data-action="replace"]').count()) === 1,
    'Copy and Revoke & replace'
  );
  const friends = box.locator(`[data-invite="${FRIENDS}"]`);
  await friends.waitFor();
  const text = await friends.textContent();
  assert(text.includes('Friends'), `the title: ${text}`);
  assert(text.includes('2 of 10 used'), `the usage: ${text}`);
  assert(text.includes('Expires'), `the expiry: ${text}`);

  // Create: the right body.
  await box.locator('[data-action="new-link"]').click();
  await box.locator('[data-field="title"]').fill('Newcomers');
  await box.locator('[data-expire="3600"]').check();
  await box.locator('[data-limit="10"]').check();
  const before = Math.floor(Date.now() / 1000);
  await box.locator('[data-action="save-link"]').click();
  await box.locator(`[data-invite="${NEWER}"]`).waitFor({ timeout: 5000 });
  const [made] = posted.create;
  assert(
    made.chat === GROUP &&
      made.title === 'Newcomers' &&
      made.usageLimit === 10 &&
      made.expireDate >= before + 3600 &&
      made.expireDate <= before + 3700 &&
      made.requestNeeded === undefined,
    `create body: ${JSON.stringify(made)}`
  );

  // Revoke: the link moves to the revoked list.
  await box
    .locator(`[data-invite="${NEWER}"] [data-action="revoke-link"]`)
    .click();
  await box.locator(`[data-invite="${NEWER}"][data-revoked="1"]`).waitFor();
  assert(
    JSON.stringify(posted.edit.at(-1)) ===
      JSON.stringify({ chat: GROUP, link: NEWER, revoked: true }),
    `revoke body: ${JSON.stringify(posted.edit)}`
  );
  assert(
    (await box
      .locator(`[data-invite="${FRIENDS}"]:not([data-revoked])`)
      .count()) === 1,
    'the others stay'
  );

  // Who joined through a link.
  await friends.locator('[data-action="open-link"]').click();
  await box.locator('[data-joined]').waitFor({ timeout: 5000 });
  assert(
    (await box.locator('[data-joined]').textContent()).includes('Cy Joined'),
    'the importer shows'
  );
  assert(
    posted.importers.at(-1).link === FRIENDS,
    `importers asked: ${JSON.stringify(posted.importers)}`
  );
  await box.locator('[data-action="back"]').click();

  // Delete all revoked.
  await box.locator('[data-action="delete-revoked"]').click();
  await gone(
    box.locator(`[data-invite="${NEWER}"]`),
    'the revoked link is deleted'
  );
  assert(posted.deleteRevoked.length === 1, 'delete-revoked posted once');
  await page.keyboard.press('Escape');
  await gone(box, 'Escape closes');
};

const requestSteps = async () => {
  const bar = page.locator('[data-requests-bar]');
  await bar.waitFor({ timeout: 5000 });
  assert(
    (await bar.textContent()).includes('2 people requested to join'),
    `the bar: ${await bar.textContent()}`
  );
  await bar.click();
  const box = dialog('join-requests');
  await box.locator('[data-person="5"]').waitFor({ timeout: 5000 });
  const ann = await box.locator('[data-person="5"]').textContent();
  assert(
    ann.includes('Ann Lee') && ann.includes('Please let me in'),
    `name and about: ${ann}`
  );
  assert(posted.importers.at(-1).requested === true, 'asked for requests');

  await box.locator('[data-person="5"] [data-action="approve"]').click();
  await gone(box.locator('[data-person="5"]'), 'the approved row goes');
  await box.locator('[data-person="6"] [data-action="dismiss"]').click();
  await gone(box.locator('[data-person="6"]'), 'the dismissed row goes');
  assert(
    JSON.stringify(posted.hide) ===
      JSON.stringify([
        { chat: GROUP, user: '5', approved: true, accessHash: '55' },
        { chat: GROUP, user: '6', approved: false, accessHash: '66' },
      ]),
    `hide bodies: ${JSON.stringify(posted.hide)}`
  );
  await page.keyboard.press('Escape');
  await gone(box, 'closed');
  await gone(bar, 'the bar goes with the last request');
};

await finish(async () => {
  await linkSteps();
  await requestSteps();
});
