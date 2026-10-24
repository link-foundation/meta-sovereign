// Real browser e2e for the contact extras (R-Y217), as the mobile clients
// have them: a contact's profile column holds a private note (edited in a
// dialog, sent only by Save), "Set photo" / "Suggest photo" with the picked
// image (uploaded first, sent by the dialog's button) and "Reset to
// original", and "Suggest birthday" when the contact has none. The Contacts
// window offers "Share my contact" (the link, its expiry, Copy and a QR
// code). A t.me/contact or t.me/+phone link in a message opens the person
// (or says the number is not on Telegram). In the Replies chat a message's
// menu has "Block user" with its options. Privacy and Security has the
// synced contacts' count and "Delete synced contacts" behind a
// confirmation. Telegram's answers faked in the page, a fake chat in a
// memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:contact-extras

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '5';
const REPLIES = '1271266957';
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - 60_000 + n * 1000).toISOString();
const put = (chat, name, n, body) =>
  store.put({
    ...{ id: `msg:telegram:${chat}:${n}`, source: 'telegram', chat },
    ...{ chatName: name, senderName: name, chatType: 'private' },
    ...{ sender: chat, body, raw: { id: n }, timestamp: at(n) },
  });
await put(ANN, 'Ann Lee', 1, 'hello');
await put(REPLIES, 'Replies', 7, 'a reply from someone');
await put(REPLIES, 'Replies', 8, 'see https://t.me/contact/tok_1 now');
await put(REPLIES, 'Replies', 9, 'or https://t.me/+15550000000 there');

const { base, page, until, finish } = await openChatApp('contact-extras', {
  store,
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(route, {
    chat,
    kind: 'user',
    title: chat === ANN ? 'Ann Lee' : 'Replies',
    online: false,
    contact: chat === ANN,
    note: chat === ANN ? 'met at the fair' : undefined,
  });
});
await page.route('**/api/telegram/chat-contacts', (route) =>
  fulfil(route, {
    ok: true,
    contacts: [
      { id: '5', name: 'Ann Lee', username: 'ann', online: false },
      { id: '6', name: 'Bob Ray', username: null, online: true },
    ],
  })
);
const quiet = {
  profile: {
    ok: true,
    ...{ id: '7', firstName: 'Me', lastName: '', about: '', username: 'me' },
    ...{ phone: '', hasPhoto: false, aboutMax: 70 },
  },
  privacy: { ok: true, keys: [] },
  'privacy-ttl': { ok: true, period: 0 },
  'web-sessions': { ok: true, sessions: [] },
  blocked: { ok: true, count: 0, items: [], next: null },
  sessions: { ok: true, ttlDays: 180, sessions: [] },
  'archive-settings': {
    ok: true,
    settings: { archiveAndMute: false, keepUnmuted: false },
  },
  security: {
    ok: true,
    password: { has: false, hint: '', hasRecovery: false },
    accountTtlDays: 180,
    content: { enabled: false, canChange: false },
  },
  passkeys: { ok: true, passkeys: [] },
};
for (const [name, body] of Object.entries(quiet)) {
  await page.route(`**/api/telegram/${name}`, (route) => fulfil(route, body));
}
await page.route('**/api/telegram/upload*', (route) =>
  fulfil(route, { ok: true, token: 'a'.repeat(32), name: 'p.png', size: 4 })
);

// Every write the page made, by route; each answer can be set per test.
const calls = [];
const answers = {
  'contact-note': (b) => ({ ok: true, note: b.note.trim() }),
  'contact-token': () => ({
    ok: true,
    url: 'https://t.me/contact/tok_1',
    expires: 1893456000,
  }),
  'contact-token-open': () => ({
    ok: true,
    found: true,
    chat: ANN,
    name: 'Ann Lee',
  }),
  'contact-photo': (b) => ({ ok: true, mode: b.mode }),
  'phone-resolve': () => ({ ok: true, found: false }),
  'saved-contacts': () => ({ ok: true, count: 3 }),
};
for (const name of [
  ...Object.keys(answers),
  'birthday-suggest',
  'block-from-replies',
  'saved-contacts-reset',
]) {
  await page.route(`**/api/telegram/${name}`, (route) => {
    const body = route.request().postDataJSON() ?? {};
    calls.push([name, body]);
    return fulfil(route, answers[name]?.(body) ?? { ok: true });
  });
}
const made = (name) => calls.filter(([n]) => n === name);
const over = (name) => page.locator(`[data-dialog="${name}"]`);
const submit = (name) => over(name).locator('[data-action="submit"]').click();
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);

const openAbout = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  const about = page.locator('.person-panel');
  if ((await about.count()) === 0) {
    await page.locator('[data-action="chat-about"]').click();
  }
  await about.waitFor({ timeout: 10000 });
};

const noteSteps = async () => {
  await openAbout(ANN);
  const extras = page.locator('.person-panel [data-contact-extras]');
  await extras.waitFor({ timeout: 10000 });
  const text = extras.locator('[data-field="contact-note-text"]');
  assert((await text.textContent()) === 'met at the fair', 'the note shown');
  await extras.locator('[data-action="contact-note-edit"]').click();
  const box = over('contact-note');
  await box.locator('[data-field="note"]').fill('  new note  ');
  await page.keyboard.press('Escape');
  await gone(box, 'Escape closes the note dialog');
  assert(made('contact-note').length === 0, 'Escape sends nothing');
  await extras.locator('[data-action="contact-note-edit"]').click();
  await box.locator('[data-field="note"]').fill('  new note  ');
  await submit('contact-note');
  await gone(box, 'the dialog closes after Save');
  assert(
    JSON.stringify(made('contact-note')[0][1]) ===
      JSON.stringify({ chat: ANN, note: '  new note  ' }),
    `the note sent: ${JSON.stringify(made('contact-note'))}`
  );
  await until(
    async () => (await text.textContent()) === 'new note',
    'the new note shown'
  );
};

const photoSteps = async () => {
  const extras = page.locator('.person-panel [data-contact-extras]');
  const file = extras.locator('[data-field="contact-photo-file"]');
  await file.setInputFiles({
    name: 'p.png',
    mimeType: 'image/png',
    buffer: Buffer.from([137, 80, 78, 71]),
  });
  const box = over('contact-photo-set');
  await box.waitFor({ timeout: 5000 });
  assert(made('contact-photo').length === 0, 'nothing sent before the click');
  await submit('contact-photo-set');
  await until(() => made('contact-photo').length === 1, 'the photo call');
  const body = made('contact-photo')[0][1];
  assert(
    body.chat === ANN && body.mode === 'save' && body.token.length === 32,
    `photo body: ${JSON.stringify(body)}`
  );
  await extras.locator('[data-photo-note]').waitFor({ timeout: 5000 });
  await extras.locator('[data-action="contact-photo-reset"]').click();
  await until(() => made('contact-photo').length === 2, 'the reset call');
  assert(made('contact-photo')[1][1].mode === 'reset', 'the reset mode');
  await gone(
    extras.locator('[data-action="contact-photo-reset"]'),
    'Reset to original goes once reset'
  );
};

const birthdaySteps = async () => {
  const extras = page.locator('.person-panel [data-contact-extras]');
  await extras.locator('[data-action="suggest-birthday"]').click();
  const box = over('suggest-birthday');
  assert(
    await box.locator('[data-action="submit"]').isDisabled(),
    'no send without a date'
  );
  await box.locator('[data-field="birthday-day"]').selectOption('9');
  await box.locator('[data-field="birthday-month"]').selectOption('4');
  await submit('suggest-birthday');
  await until(() => made('birthday-suggest').length === 1, 'the suggestion');
  assert(
    JSON.stringify(made('birthday-suggest')[0][1]) ===
      JSON.stringify({ chat: ANN, day: 9, month: 4 }),
    `birthday: ${JSON.stringify(made('birthday-suggest')[0][1])}`
  );
  await extras.locator('[data-birthday-note]').waitFor({ timeout: 5000 });
};

const shareSteps = async () => {
  await page.locator('[data-action="new-chat"]').click();
  await page.locator('[data-action="open-contacts"]').click();
  await page.locator('[data-action="contacts-share"]').click();
  const box = over('share-contact');
  await box.locator('[data-field="url"]').waitFor({ timeout: 5000 });
  assert(
    (await box.locator('[data-field="url"]').textContent()) ===
      'https://t.me/contact/tok_1',
    'the link shown'
  );
  await box.locator('[data-qr] svg').waitFor({ timeout: 5000 });
  assert(made('contact-token').length === 1, 'the link asked once');
  await page.keyboard.press('Escape');
  await gone(box, 'Escape closes the share dialog');
  await page.keyboard.press('Escape');
  await gone(over('contacts'), 'then the contacts window');
};

const repliesSteps = async () => {
  await page.locator(`[data-chat="telegram:${REPLIES}"]`).click();
  const row = (n) =>
    page.locator(`.chat-scroll [data-message="msg:telegram:${REPLIES}:${n}"]`);
  await row(7).waitFor({ timeout: 10000 });
  await row(7)
    .locator('.bubble-body, .bubble')
    .first()
    .click({ button: 'right', force: true });
  await page.locator('.msg-context-menu').waitFor({ timeout: 5000 });
  await page.locator('.msg-context-menu [data-action="blockSender"]').click();
  const box = over('block-from-replies');
  await box.waitFor({ timeout: 5000 });
  await box.locator('[data-field="reportSpam"]').check();
  await submit('block-from-replies');
  await until(() => made('block-from-replies').length === 1, 'the block call');
  assert(
    JSON.stringify(made('block-from-replies')[0][1]) ===
      JSON.stringify({ msgId: 7, reportSpam: true }),
    `block body: ${JSON.stringify(made('block-from-replies')[0][1])}`
  );
  await gone(box, 'the dialog closes after Block');
  // No Block user in other chats.
  await page.locator(`[data-chat="telegram:${ANN}"]`).click();
  await page
    .locator(`.chat-scroll [data-message="msg:telegram:${ANN}:1"]`)
    .locator('.bubble-body, .bubble')
    .first()
    .click({ button: 'right', force: true });
  await page.locator('.msg-context-menu').waitFor({ timeout: 5000 });
  assert(
    (await page
      .locator('.msg-context-menu [data-action="blockSender"]')
      .count()) === 0,
    'no Block user outside Replies'
  );
  await page.keyboard.press('Escape');
};

const linkSteps = async () => {
  await page.locator(`[data-chat="telegram:${REPLIES}"]`).click();
  const link = (n, part) =>
    page.locator(
      `.chat-scroll [data-message="msg:telegram:${REPLIES}:${n}"] a[href*="${part}"]`
    );
  await link(9, '+15550000000').click();
  const note = over('contact-link');
  await note.waitFor({ timeout: 5000 });
  assert(
    (await note.textContent()).includes('No one on Telegram'),
    'an unknown number said in words'
  );
  assert(
    JSON.stringify(made('phone-resolve')[0][1]) ===
      JSON.stringify({ phone: '15550000000' }),
    'the digits resolved'
  );
  await page.keyboard.press('Escape');
  await gone(note, 'Escape closes the notice');
  await link(8, 'contact/tok_1').click();
  await until(() => made('contact-token-open').length === 1, 'the token');
  assert(made('contact-token-open')[0][1].token === 'tok_1', 'the token sent');
  await page
    .locator('.person-panel [data-contact-extras]')
    .waitFor({ timeout: 10000 });
};

const syncedSteps = async () => {
  await page.locator('[data-action="my-profile"]').click();
  await page.locator('[data-action="open-privacy"]').click();
  const dialog = over('privacy');
  const count = dialog.locator('[data-synced-count]');
  await count.waitFor({ timeout: 5000 });
  assert((await count.textContent()).includes('3'), 'the count shown');
  await dialog.locator('[data-action="synced-clear"]').click();
  await page.keyboard.press('Escape');
  await gone(page.locator('[data-synced-confirm]'), 'Escape closes the ask');
  assert(made('saved-contacts-reset').length === 0, 'Escape deletes nothing');
  assert((await dialog.count()) === 1, 'the privacy dialog stays');
  await dialog.locator('[data-action="synced-clear"]').click();
  await page.locator('[data-action="synced-confirm"]').click();
  await until(() => made('saved-contacts-reset').length === 1, 'the reset');
  await dialog.locator('[data-synced-note="done"]').waitFor({ timeout: 5000 });
  await until(
    async () => (await count.getAttribute('data-synced-count')) === '0',
    'the count drops to 0'
  );
};

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${ANN}"]`).waitFor();
  await noteSteps();
  await photoSteps();
  await birthdaySteps();
  await shareSteps();
  await repliesSteps();
  await linkSteps();
  await syncedSteps();
});
