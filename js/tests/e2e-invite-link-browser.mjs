// Real browser e2e for chat invite links (R-Y123), as Telegram Desktop
// handles them: an invite link in a message opens a dialog instead of the
// browser (the chat's initial, title, kind, members, Join or Request to
// join, Cancel); a chat the user is already in is opened; Telegram's errors
// show as text; nothing is joined until Join is pressed. In a chat the user
// administers, the info column shows the primary link with Copy and "Revoke
// link", asked in the page (never by the browser) before a new link is made.
// Telegram's answers faked in the page, a fake chat in a memory store, a
// server on a free port, a headless browser; nothing reaches a network or a
// running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:invite-link

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-1005';
const LINKS = {
  1: 'https://t.me/+PlainHash123',
  2: 'https://t.me/joinchat/RequestHash1',
  3: 'tg://join?invite=ExpiredHash99',
  4: 'https://t.me/+AlreadyHash12',
};
const store = createMemoryStore();
const start = Date.now() - 10 * 60_000;
for (const [n, link] of Object.entries(LINKS)) {
  await store.put({
    id: `msg:telegram:${GROUP}:${n}`,
    source: 'telegram',
    chat: GROUP,
    chatName: 'Fake Group',
    chatType: 'supergroup',
    sender: '31',
    senderName: 'Someone',
    timestamp: new Date(start + Number(n) * 60_000).toISOString(),
    // tg:// is no web address: Telegram marks it up as a text link.
    body: link.startsWith('tg:') ? 'join us here' : `join us ${link}`,
    raw: {
      id: Number(n),
      ...(link.startsWith('tg:')
        ? {
            entities: [
              {
                className: 'MessageEntityTextUrl',
                offset: 8,
                length: 4,
                url: link,
              },
            ],
          }
        : {}),
    },
  });
}

const { base, page, until, finish } = await openChatApp('invite-link', {
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

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, {
    chat: GROUP,
    kind: 'group',
    title: 'Fake Group',
    members: 12,
    canInvite: true,
    inviteLink: 'https://t.me/+OldPrimary1234',
  })
);
const checks = [];
const joins = [];
const revokes = [];
await page.route('**/api/telegram/invite-check', (route) => {
  const { hash } = route.request().postDataJSON();
  checks.push(hash);
  if (hash === 'PlainHash123') {
    return fulfil(route, {
      ok: true,
      already: false,
      invite: {
        title: 'Test Channel',
        about: '',
        members: 1234,
        channel: true,
        broadcast: true,
        megagroup: false,
        requestNeeded: false,
      },
    });
  }
  if (hash === 'RequestHash1') {
    return fulfil(route, {
      ok: true,
      already: false,
      invite: {
        title: 'Private Club',
        about: 'Be nice',
        members: 7,
        channel: false,
        broadcast: false,
        megagroup: true,
        requestNeeded: true,
      },
    });
  }
  if (hash === 'AlreadyHash12') {
    return fulfil(route, { ok: true, already: true, chat: '-1007' });
  }
  return fulfil(route, { ok: false, error: 'x', code: 'invite-expired' });
});
await page.route('**/api/telegram/invite-join', (route) => {
  const { hash } = route.request().postDataJSON();
  joins.push(hash);
  return hash === 'RequestHash1'
    ? fulfil(route, { ok: false, error: 'x', code: 'invite-request-sent' })
    : fulfil(route, { ok: true, chat: '-1009' });
});
await page.route('**/api/telegram/invite-revoke', (route) => {
  revokes.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, link: 'https://t.me/+NewPrimary56789' });
});

const dialog = page.locator('[data-dialog="invite"]');
const link = (n) =>
  page
    .locator(`[data-message="msg:telegram:${GROUP}:${n}"] a.msg-link`)
    .first();
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const popups = [];
page.context().on('page', (p) => popups.push(p.url()));

// Links in messages: the dialog, joining, its errors.
const joinSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  await link(1).waitFor({ timeout: 15000 });

  // A plain channel link: the dialog, not the browser; nothing joined.
  await link(1).click();
  await dialog.locator('[data-action="join"]').waitFor({ timeout: 5000 });
  const text = await dialog.textContent();
  assert(text.includes('Test Channel'), `the title: ${text}`);
  assert(text.includes('Channel') && text.includes('1,234'), `kind: ${text}`);
  assert(
    (await dialog.locator('.invite-initial').textContent()) === 'T',
    'the initial'
  );
  assert(checks.join() === 'PlainHash123', `checked: ${checks}`);
  assert(joins.length === 0, 'not joined before Join');
  assert(popups.length === 0, 'the browser did not open it');
  await dialog.locator('[data-action="join"]').click();
  await gone(dialog, 'closed after Join');
  assert(joins.join() === 'PlainHash123', `joined: ${joins}`);
  assert(
    (await page.evaluate(() => globalThis.location.hash)) ===
      '#chat=telegram:-1009',
    'the joined chat opens'
  );

  // Cancel and Escape join nothing.
  await page.evaluate(() => {
    globalThis.location.hash = 'chat=telegram:-1005';
  });
  await link(1).waitFor({ timeout: 10000 });
  await link(1).click();
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-action="cancel"]').click();
  await gone(dialog, 'Cancel closes');
  await link(1).click();
  await dialog.waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await gone(dialog, 'Escape closes');
  assert(joins.length === 1, 'Cancel and Escape joined nothing');

  // Admins accept: the button asks to join; the request is reported.
  await link(2).click();
  await dialog.waitFor({ timeout: 5000 });
  assert(
    (await dialog.locator('[data-action="join"]').textContent()) ===
      'Request to join',
    'Request to join'
  );
  assert((await dialog.textContent()).includes('Group'), 'a group');
  await dialog.locator('[data-action="join"]').click();
  await dialog.locator('[data-invite-error="invite-request-sent"]').waitFor();
  assert(
    (await dialog.locator('[data-action="join"]').count()) === 0,
    'no Join after the request'
  );
  await dialog.locator('[data-action="cancel"]').click();
  await gone(dialog, 'closed');

  // An expired link (tg://join) shows its error as text.
  await link(3).click();
  await dialog.locator('[data-invite-error="invite-expired"]').waitFor();
  assert((await dialog.textContent()).includes('expired'), 'the error is text');
  await dialog.locator('[data-action="cancel"]').click();
  await gone(dialog, 'closed');

  // A chat the user is in is opened, with no dialog.
  await link(4).click();
  await until(
    async () =>
      (await page.evaluate(() => globalThis.location.hash)) ===
      '#chat=telegram:-1007',
    'the chat the user is in opens'
  );
  assert((await dialog.count()) === 0, 'no dialog for an own chat');
  await page.evaluate(() => {
    globalThis.location.hash = 'chat=telegram:-1005';
  });
  await link(1).waitFor({ timeout: 10000 });
};

// The info column's link.
const infoSteps = async () => {
  // The info column: the primary link, Copy, Revoke asked in the page.
  await page.locator('[data-action="chat-about"]').click();
  const box = page.locator('.person-panel [data-invite-link]');
  await box.waitFor({ timeout: 5000 });
  assert(
    (await box.locator('.invite-link-text').textContent()) ===
      'https://t.me/+OldPrimary1234',
    'the primary link'
  );
  await box.locator('[data-action="copy"]').click();
  await until(
    async () =>
      (await page.evaluate(() => globalThis.__copied.join())) ===
      'https://t.me/+OldPrimary1234',
    'copied'
  );
  const revoking = page.locator('[data-dialog="invite-revoke"]');
  await box.locator('[data-action="revoke"]').click();
  await revoking.waitFor({ timeout: 5000 });
  await revoking.locator('[data-action="cancel"]').click();
  await gone(revoking, 'Cancel closes');
  assert(revokes.length === 0, 'nothing revoked on Cancel');
  await box.locator('[data-action="revoke"]').click();
  await revoking.locator('[data-action="revoke-confirm"]').click();
  await gone(revoking, 'closed after Revoke');
  assert(
    revokes.length === 1 && revokes[0].chat === GROUP,
    `revoked: ${JSON.stringify(revokes)}`
  );
  assert(
    (await box.locator('.invite-link-text').textContent()) ===
      'https://t.me/+NewPrimary56789',
    'the new link shows'
  );
};

await finish(async () => {
  await joinSteps();
  await infoSteps();
});
