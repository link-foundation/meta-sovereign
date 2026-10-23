// Real browser e2e for Telegram Business quick replies and the greeting and
// away messages (R-Y179), as Telegram Desktop has them: "/" in a person's
// chat lists the user's shortcuts with the first message, narrowing as one
// types, and sends one only on the pick (Enter or a click); Settings →
// Telegram Business lists Quick replies (new shortcut, its messages added,
// edited and deleted, renamed, moved, deleted), the greeting and the away
// message (recipients, days, schedule, only offline), each written only on
// Save, with Telegram's refusal (Premium) in words. Telegram's answers
// faked in the page, a fake chat in a memory store, a server on a free
// port, a headless browser; nothing reaches a network or a running app.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:quick-replies

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '5';
const store = createMemoryStore();
await store.put({
  ...{ id: `msg:telegram:${CHAT}:1`, source: 'telegram', chat: CHAT },
  ...{ chatName: 'Some Friend', senderName: 'Some Friend' },
  ...{ chatType: 'private', sender: CHAT, body: 'hi', raw: { id: 1 } },
  timestamp: new Date(Date.now() - 60_000).toISOString(),
});

const sent = [];
const { base, page, until, finish } = await openChatApp('quick-replies', {
  store,
  send: async (draft) => {
    sent.push(draft);
    return { via: 'fake' };
  },
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, { chat: CHAT, kind: 'user', title: 'Some Friend' })
);
await page.route('**/api/telegram/bot-commands', (route) =>
  fulfil(route, { ok: true, commands: [], menu: { kind: 'default' } })
);
await page.route('**/api/telegram/profile', (route) =>
  fulfil(route, {
    ok: true,
    id: '7',
    firstName: 'Ann',
    lastName: 'Lee',
    about: '',
    username: 'annlee',
    phone: '',
    hasPhoto: false,
    aboutMax: 70,
  })
);

// A tiny Telegram: shortcuts with messages, and what was written.
let nextId = 10;
const shortcuts = [
  { id: 1, name: 'hello', messages: [{ id: 101, text: 'Hello there!' }] },
  {
    id: 2,
    name: 'thanks',
    messages: [
      { id: 201, text: 'Thank you' },
      { id: 202, text: 'Really' },
    ],
  },
];
const writes = [];
const calls = [];
const body = (route) => route.request().postDataJSON();
const answer = (path, make) =>
  page.route(`**/api/telegram/${path}`, (route) => {
    const b = route.request().postData() ? body(route) : {};
    calls.push([path, b]);
    return fulfil(route, make(b));
  });
const byId = (id) => shortcuts.find((s) => s.id === Number(id));
const done = (path, run) =>
  answer(path, (b) => {
    writes.push([path, b]);
    return run(b) ?? { ok: true };
  });

answer('quick-replies', () => ({
  ok: true,
  replies: shortcuts.map((s) => ({
    id: s.id,
    name: s.name,
    count: s.messages.length,
    preview: s.messages[0]?.text ?? '',
  })),
}));
answer('quick-reply-messages', (b) => ({
  ok: true,
  messages: byId(b.shortcutId).messages.map((m) => ({ ...m, media: null })),
}));
done('quick-reply-create', (b) => {
  nextId += 1;
  shortcuts.push({
    id: nextId,
    name: b.name,
    messages: [{ id: nextId * 10, text: b.text }],
  });
});
done('quick-reply-add', (b) => {
  nextId += 1;
  byId(b.shortcutId).messages.push({ id: nextId * 10, text: b.text });
});
done('quick-reply-edit', (b) => {
  byId(b.shortcutId).messages.find((m) => m.id === b.id).text = b.text;
});
done('quick-reply-delete-messages', (b) => {
  const s = byId(b.shortcutId);
  s.messages = s.messages.filter((m) => !b.ids.includes(m.id));
});
done('quick-reply-rename', (b) => {
  byId(b.shortcutId).name = b.name;
});
done('quick-reply-delete', (b) => {
  shortcuts.splice(shortcuts.indexOf(byId(b.shortcutId)), 1);
});
done('quick-reply-reorder', (b) => {
  const order = [...b.order];
  shortcuts.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
});
done('quick-reply-send', (b) =>
  b.shortcutId === 2 ? { ok: false, error: 'x', code: 'premium' } : undefined
);

let saveAnswer = { ok: true };
answer('business-messages', () => ({
  ok: true,
  greeting: null,
  away: {
    shortcutId: 1,
    offlineOnly: false,
    schedule: { kind: 'always' },
    recipients: {
      existingChats: true,
      newChats: false,
      contacts: false,
      nonContacts: false,
      excludeSelected: true,
      users: ['5'],
    },
  },
  shortcuts: shortcuts.map((s) => ({ id: s.id, name: s.name })),
  people: [{ id: '5', name: 'Some Friend' }],
}));
done('business-greeting-save', () => saveAnswer);
done('business-away-save', () => saveAnswer);

const list = page.locator('.bot-commands');
const box = page.locator('.chat-composer textarea');
const options = () => list.locator('[role="option"]');
const names = () =>
  options().evaluateAll((o) => o.map((x) => x.dataset.command));
const count = (path) => writes.filter(([p]) => p === path).length;

const composerSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await box.waitFor({ timeout: 15000 });
  await box.click();
  await box.pressSequentially('/');
  await options().first().waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(await names()) === '["hello","thanks"]',
    `all: ${JSON.stringify(await names())}`
  );
  const first = options().first();
  assert((await first.getAttribute('data-quick')) === 'true', 'quick item');
  assert((await first.textContent()).includes('Hello there!'), 'preview');
  assert(count('quick-reply-send') === 0, 'nothing sent by typing');

  // It narrows; Escape closes; nothing was sent by any of it.
  await box.pressSequentially('th');
  await until(async () => (await options().count()) === 1, 'narrowed');
  await box.press('Escape');
  await until(async () => (await list.count()) === 0, 'closed');
  assert(count('quick-reply-send') === 0, 'Escape sends nothing');
  await box.fill('');

  // Enter sends the shortcut, only then.
  await box.pressSequentially('/he');
  await options().first().waitFor({ timeout: 5000 });
  assert(count('quick-reply-send') === 0, 'still nothing sent');
  await box.press('Enter');
  await until(() => count('quick-reply-send') === 1, 'Enter sends it');
  const [, sentBody] = writes.find(([p]) => p === 'quick-reply-send');
  assert(
    sentBody.chat === CHAT && sentBody.shortcutId === 1,
    `body: ${JSON.stringify(sentBody)}`
  );
  await until(async () => (await box.inputValue()) === '', 'box emptied');
  assert(sent.length === 0, 'not sent as ordinary text');

  // A click sends too; Telegram's refusal shows in words.
  await box.pressSequentially('/');
  await options().nth(1).waitFor({ timeout: 5000 });
  await options().nth(1).click();
  await until(() => count('quick-reply-send') === 2, 'a click sends');
  await list.locator('[data-quick-error="premium"]').waitFor({ timeout: 5000 });
  assert(
    (await list.textContent()).includes('Telegram Premium'),
    'Premium in words'
  );
  assert((await box.inputValue()) === '/', 'text kept after a refusal');
  await box.fill('');
};

const businessDialog = page.locator('[data-dialog="business"]');
const quick = page.locator('[data-dialog="quick-replies"]');
const click = (scope, action) =>
  scope.locator(`[data-action="${action}"]`).first().click();
const rowNames = () =>
  quick
    .locator('.quick-row')
    .evaluateAll((rows) => rows.map((r) => r.dataset.shortcut));

const openBusiness = async () => {
  await page.locator('[data-action="my-profile"]').click();
  await click(page, 'open-business');
  await businessDialog.waitFor({ timeout: 5000 });
};

const quickSteps = async () => {
  await openBusiness();
  await businessDialog.locator('[data-section="quick-replies"]').click();
  await quick.locator('.quick-row').first().waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(await rowNames()) === '["hello","thanks"]',
    'two shortcuts'
  );

  // Move the first one down.
  await quick.locator('[data-action="quick-down"]').first().click();
  await until(async () => (await rowNames())[0] === 'thanks', 'reordered');
  assert(
    JSON.stringify(writes.find(([p]) => p === 'quick-reply-reorder')[1]) ===
      '{"order":[2,1]}',
    'order sent'
  );

  // A new shortcut by name and first message.
  await click(quick, 'quick-new');
  await quick.locator('[data-field="shortcut-name"]').fill('bad name!');
  await quick.locator('[data-field="message-text"]').fill('See you');
  await click(quick, 'quick-create');
  await quick.locator('[data-quick-error="bad-name"]').waitFor();
  assert(count('quick-reply-create') === 0, 'a bad name is not sent');
  await quick.locator('[data-field="shortcut-name"]').fill('bye');
  await click(quick, 'quick-create');
  await until(async () => (await rowNames()).includes('bye'), 'created');
  assert(
    JSON.stringify(writes.find(([p]) => p === 'quick-reply-create')[1]) ===
      '{"name":"bye","text":"See you"}',
    'create body'
  );

  // Open it: add, edit and delete messages, rename, delete.
  await quick.locator('[data-shortcut="bye"] .quick-open').click();
  await quick.locator('.quick-message').first().waitFor({ timeout: 5000 });
  await quick.locator('[data-field="new-message"]').fill('Take care');
  await click(quick, 'message-add');
  await until(
    async () => (await quick.locator('.quick-message').count()) === 2,
    'message added'
  );
  await click(quick, 'message-edit');
  await quick.locator('[data-field="edit-text"]').fill('Goodbye');
  await click(quick, 'message-save');
  await until(
    async () =>
      (await quick.locator('.quick-text').first().textContent()) === 'Goodbye',
    'message edited'
  );
  await click(quick, 'message-delete');
  await until(
    async () => (await quick.locator('.quick-message').count()) === 1,
    'message deleted'
  );
  await quick.locator('[data-field="rename"]').fill('farewell');
  await click(quick, 'quick-rename');
  await until(() => count('quick-reply-rename') === 1, 'renamed');
  await click(quick, 'quick-delete');
  assert(count('quick-reply-delete') === 0, 'asks before deleting');
  await click(quick, 'quick-delete-yes');
  await until(() => count('quick-reply-delete') === 1, 'deleted');
  await until(
    async () => !(await rowNames()).includes('farewell'),
    'gone from the list'
  );
  await click(quick, 'close');
  await quick.waitFor({ state: 'detached' });
};

const form = page.locator('[data-dialog="business-greeting"]');
const away = page.locator('[data-dialog="business-away"]');

const greetingSteps = async () => {
  await businessDialog.locator('[data-section="greeting"]').click();
  await form.waitFor({ timeout: 5000 });
  assert(
    (await form.locator('[data-field="enabled"]').isChecked()) === false,
    'off at first'
  );
  await form.locator('[data-field="enabled"]').check();
  await form
    .locator('[data-field="shortcut"]')
    .selectOption({ label: '/hello' });
  await form.locator('[data-field="newChats"]').check();
  await form.locator('[data-field="no-activity-days"]').selectOption('14');
  await click(form, 'business-choose-people');
  await form.locator('[data-person="5"]').check();
  assert(count('business-greeting-save') === 0, 'nothing written before Save');

  // Telegram's refusal shows in words, and the form stays.
  saveAnswer = { ok: false, error: 'x', code: 'premium' };
  await form.locator('button[type="submit"]').click();
  await form.locator('[role="alert"]').waitFor({ timeout: 5000 });
  assert((await form.textContent()).includes('Telegram Premium'), 'words');
  saveAnswer = { ok: true };
  await form.locator('button[type="submit"]').click();
  await form.waitFor({ state: 'detached' });
  const saved = writes.filter(([p]) => p === 'business-greeting-save').pop()[1];
  assert(
    saved.enabled &&
      saved.shortcutId === 1 &&
      saved.noActivityDays === 14 &&
      saved.recipients.newChats === true &&
      saved.recipients.excludeSelected === true &&
      saved.recipients.users.join() === '5',
    `greeting body: ${JSON.stringify(saved)}`
  );
};

const awaySteps = async () => {
  await businessDialog.locator('[data-section="away"]').click();
  await away.waitFor({ timeout: 5000 });
  assert(
    await away.locator('[data-field="enabled"]').isChecked(),
    'on as Telegram has it'
  );
  await away.locator('[data-schedule="custom"]').check();
  await away.locator('[data-field="start"]').fill('2030-01-01T09:00');
  await away.locator('[data-field="end"]').fill('2030-01-01T08:00');
  await away.locator('[data-field="offline-only"]').check();
  await away.locator('button[type="submit"]').click();
  await away.locator('[role="alert"]').waitFor({ timeout: 5000 });
  assert(count('business-away-save') === 0, 'a bad range is not sent');
  await away.locator('[data-field="end"]').fill('2030-01-02T08:00');
  await away.locator('button[type="submit"]').click();
  await away.waitFor({ state: 'detached' });
  const saved = writes.filter(([p]) => p === 'business-away-save').pop()[1];
  assert(
    saved.enabled &&
      saved.offlineOnly === true &&
      saved.schedule.kind === 'custom' &&
      saved.schedule.end - saved.schedule.start === 23 * 3600 + 0 &&
      saved.shortcutId === 1,
    `away body: ${JSON.stringify(saved)}`
  );
};

await finish(async () => {
  await composerSteps();
  await quickSteps();
  await greetingSteps();
  await awaySteps();
  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }
});
