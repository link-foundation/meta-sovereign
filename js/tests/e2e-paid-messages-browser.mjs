// Real browser e2e for paid messages (R-Y184), as Telegram Desktop has
// them. In a chat that charges Stars per message the box says "N ⭐ per
// message"; every send there (text, a long text in parts, a forward) first
// asks a question with the price x messages and the balance, and goes out
// with `allowPaidStars` set to exactly that total — Cancel sends nothing,
// "Don't ask again for this chat" is kept for that price, too little
// balance disables the button. Privacy → Messages sets what non-contacts
// pay (only on Save); a person's profile shows what they paid and lets
// them write free or pay again (each behind a confirmation); a group admin
// sets the price in the group settings and a channel owner switches
// auto-translation. A free chat is never asked. Telegram's answers faked in
// the page, fake chats in a memory store, a fake sender that records, a
// server on a free port, a headless browser; nothing reaches a network or
// a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:paid-messages

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const SRC = '-1001111';
const FREE = '43';
const PAID = '42';
const POOR = '44';
const GROUP = '-1002222';
const CHANNEL = '-1003333';
const PRICES = { [PAID]: 3, [POOR]: 500 };

const store = createMemoryStore();
const put = (chat, name, type, id, ago) =>
  store.put({
    id: `msg:telegram:${chat}:${id}`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: type,
    sender: chat,
    senderName: name,
    body: `message number ${id}`,
    timestamp: new Date(Date.now() - ago).toISOString(),
    raw: { id },
  });
await put(SRC, 'Source Group', 'supergroup', 1, 900_000);
await put(SRC, 'Source Group', 'supergroup', 2, 800_000);
await put(CHANNEL, 'Fake Channel', 'channel', 1, 700_000);
await put(GROUP, 'Fake Group', 'supergroup', 1, 600_000);
await put(POOR, 'Rich Friend', 'private', 1, 500_000);
await put(PAID, 'Paid Friend', 'private', 1, 400_000);
await put(FREE, 'Free Friend', 'private', 1, 300_000);

const sent = [];
const { base, page, until, finish } = await openChatApp('paid-messages', {
  store,
  send: async (draft) => {
    sent.push(draft);
    return { via: 'fake' };
  },
});

// What the fake Telegram is asked, and answers.
const asked = [];
const forwards = [];
const settingSaves = [];
const exceptions = [];
const priceSaves = [];
const setting = [];
const balance = 100;
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
    settings: {
      shown: ['paidMessages'],
      values: {},
      paidStars: 2,
      linked: null,
    },
  },
  [CHANNEL]: {
    kind: 'channel',
    title: 'Fake Channel',
    broadcast: true,
    settings: {
      shown: ['autotranslation'],
      values: { autotranslation: false },
      linked: null,
    },
  },
};
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(route, { chat, kind: 'user', title: 'Chat', ...infos[chat] });
});
await page.route('**/api/telegram/stars-status', (route) =>
  fulfil(route, { ok: true, balance })
);
await page.route('**/api/telegram/paid-price', (route) => {
  const { chat } = route.request().postDataJSON();
  asked.push(chat);
  return fulfil(route, { ok: true, stars: PRICES[chat] ?? 0 });
});
await page.route('**/api/telegram/forward', (route) => {
  forwards.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, forwarded: 1 });
});
await page.route('**/api/telegram/paid-revenue', (route) =>
  fulfil(route, {
    ok: true,
    stars: route.request().postDataJSON().user === PAID ? 310 : 0,
  })
);
await page.route('**/api/telegram/paid-exception', (route) => {
  exceptions.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/paid-settings', (route) =>
  fulfil(route, { ok: true, stars: 0 })
);
await page.route('**/api/telegram/paid-settings-save', (route) => {
  const body = route.request().postDataJSON();
  settingSaves.push(body);
  return fulfil(route, { ok: true, stars: body.stars });
});
await page.route('**/api/telegram/paid-price-save', (route) => {
  const body = route.request().postDataJSON();
  priceSaves.push(body);
  return fulfil(route, { ok: true, stars: body.stars });
});
await page.route('**/api/telegram/chat-setting', (route) => {
  setting.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
// The privacy dialog's other parts, quiet here.
await page.route('**/api/telegram/profile', (route) =>
  fulfil(route, {
    ok: true,
    id: '7',
    firstName: 'Ann',
    lastName: 'Lee',
    about: '',
    username: 'annlee',
    phone: '+15551234567',
    hasPhoto: false,
    aboutMax: 70,
  })
);
await page.route('**/api/telegram/privacy', (route) =>
  fulfil(route, { ok: true, keys: [] })
);
await page.route('**/api/telegram/privacy-ttl', (route) =>
  fulfil(route, { ok: true, period: 0 })
);
await page.route('**/api/telegram/sessions', (route) =>
  fulfil(route, { ok: true, ttlDays: 180, sessions: [] })
);
await page.route('**/api/telegram/archive-settings', (route) =>
  fulfil(route, {
    ok: true,
    settings: {
      archiveAndMute: false,
      keepUnmuted: false,
      keepFolders: false,
      hideReadMarks: false,
      requirePremium: false,
    },
  })
);
await page.route('**/api/telegram/web-sessions', (route) =>
  fulfil(route, { ok: true, sessions: [] })
);
await page.route('**/api/telegram/blocked', (route) =>
  fulfil(route, { ok: true, count: 0, items: [], next: null })
);

const box = page.locator('.chat-composer textarea');
const ask = page.locator('[data-dialog="paid-send"]');
const label = page.locator('[data-paid-per-message]');
const open = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await box.waitFor({ timeout: 15_000 });
};
const type = async (text) => {
  await box.fill(text);
  await box.press('Enter');
};
const confirm = () => ask.locator('[data-action="submit"]').click();

const freeChat = async () => {
  // A free chat: no price on the box, no question, no Stars on the send.
  await open(FREE);
  await page.waitForTimeout(300);
  assert((await label.count()) === 0, 'no price label in a free chat');
  await type('free hello');
  await until(() => sent.length === 1, 'the free message is sent');
  assert(
    !('allowPaidStars' in sent[0]),
    `free send: ${JSON.stringify(sent[0])}`
  );
  assert((await ask.count()) === 0, 'a free chat is not asked');
};

const paidLabel = async () => {
  // A paid chat says what a message costs.
  await open(PAID);
  await label.waitFor({ timeout: 10_000 });
  assert(
    (await label.getAttribute('data-paid-per-message')) === '3',
    'the price'
  );
  assert((await label.textContent()).includes('3 ⭐ per message'), 'the words');
};

const cancelled = async () => {
  // Send asks first; nothing goes before the answer; Cancel sends nothing.
  await type('hello');
  await ask.waitFor({ timeout: 5000 });
  await until(
    async () => (await ask.textContent()).includes('100 ⭐'),
    'the balance shows'
  );
  const body = await ask.textContent();
  assert(body.includes('3 ⭐') && body.includes('1 message'), `body: ${body}`);
  assert(sent.length === 1, 'nothing is sent while the question is open');
  await ask.locator('[data-action="cancel"]').click();
  await ask.waitFor({ state: 'detached' });
  await page
    .getByText('the price was not confirmed')
    .waitFor({ timeout: 5000 });
  assert(sent.length === 1, 'cancelling sends nothing');
};

const confirmed = async () => {
  // Confirming sends with exactly price x messages.
  await type('again');
  await ask.waitFor({ timeout: 5000 });
  await confirm();
  await until(() => sent.length === 2, 'the confirmed message is sent');
  assert(
    sent[1].text === 'again' && sent[1].allowPaidStars === 3,
    JSON.stringify(sent[1])
  );
};

const longText = async () => {
  // A long text goes out in two parts: 2 x 3 Stars confirmed.
  await type('a'.repeat(5000));
  await ask.waitFor({ timeout: 5000 });
  assert(
    (await ask.locator('[data-paid-total]').getAttribute('data-paid-total')) ===
      '6',
    'two parts cost 6'
  );
  await confirm();
  await until(() => sent.length === 3, 'the long text is sent');
  assert(sent[2].allowPaidStars === 6, `long: ${sent[2].allowPaidStars}`);
};

const forwarded = async () => {
  // A forward into the paid chat asks too, and carries the total.
  await open(SRC);
  const bubble = page.locator(
    '[data-row="msg:telegram:-1001111:2"] .bubble-body'
  );
  await bubble.scrollIntoViewIfNeeded();
  const at = await bubble.boundingBox();
  await page.mouse.click(at.x + 10, at.y + at.height / 2, { button: 'right' });
  await page.locator('[role=menu] [data-action="forward"]').click();
  await page
    .locator('.forward-picker-list li', { hasText: 'Paid Friend' })
    .first()
    .click();
  await page.locator('.forward-bar').waitFor({ timeout: 10_000 });
  await page.locator('button.send').click();
  await ask.waitFor({ timeout: 5000 });
  assert(forwards.length === 0, 'the forward waits for the answer');
  await confirm();
  await until(() => forwards.length === 1, 'the forward is made');
  assert(
    forwards[0].toChat === PAID && forwards[0].allowPaidStars === 3,
    JSON.stringify(forwards[0])
  );
};

const remembered = async () => {
  // "Don't ask again": kept for this chat and price.
  await open(PAID);
  await type('third');
  await ask.waitFor({ timeout: 5000 });
  await ask.locator('[data-field="paid-remember"]').check();
  await confirm();
  await until(() => sent.length === 4, 'the third is sent');
  await type('fourth');
  await until(() => sent.length === 5, 'the fourth is sent without a question');
  assert((await ask.count()) === 0, 'no question after "don\'t ask again"');
  assert(
    sent[3].allowPaidStars === 3 && sent[4].allowPaidStars === 3,
    'still 3'
  );
  const kept = await page.evaluate(() =>
    globalThis.localStorage.getItem('metaSovereignPaidAsk')
  );
  assert(kept === '{"42":3}', `kept: ${kept}`);
};

const tooDear = async () => {
  // Too little balance: the button is off and says why.
  await open(POOR);
  await label.waitFor({ timeout: 10_000 });
  await type('too dear');
  await ask.waitFor({ timeout: 5000 });
  await until(
    () => ask.locator('[data-action="submit"]').isDisabled(),
    'the button is off'
  );
  assert((await ask.textContent()).includes('Not enough Stars'), 'says why');
  await ask.locator('[data-action="cancel"]').click();
  await ask.waitFor({ state: 'detached' });
  assert(sent.length === 5, 'nothing was sent for 500 Stars');
};

const profile = async () => {
  // A person's profile: what they paid, free or pay again, each confirmed.
  await open(PAID);
  await page.locator('[data-action="chat-about"]').click();
  const earned = page.locator('.paid-earnings[data-paid-earned="310"]');
  await earned.waitFor({ timeout: 10_000 });
  await earned.locator('[data-action="paid-pay"]').click();
  assert(exceptions.length === 0, 'nothing is changed before the confirmation');
  await earned.locator('[data-paid-ask="pay"]').waitFor();
  await earned.locator('[data-action="paid-confirm"]').click();
  await until(() => exceptions.length === 1, 'pay again is sent');
  assert(
    exceptions[0].user === PAID && exceptions[0].allow === false,
    JSON.stringify(exceptions[0])
  );
  await earned.locator('[data-paid-done="pay"]').waitFor();
  await earned.locator('[data-action="paid-free"]').click();
  await earned.locator('[data-field="paid-refund"]').check();
  await earned.locator('[data-action="paid-confirm"]').click();
  await until(() => exceptions.length === 2, 'free is sent');
  assert(
    exceptions[1].allow === true && exceptions[1].refund === true,
    JSON.stringify(exceptions[1])
  );
};

const privacy = async () => {
  // Privacy → Messages → Charge for messages: only Save writes.
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${FREE}"]`).waitFor();
  await page.locator('[data-action="my-profile"]').click();
  await page.locator('[data-action="open-privacy"]').click();
  const privacy = page.locator('[data-dialog="privacy"]');
  const enable = privacy.locator('[data-field="paid-enabled"]');
  await enable.waitFor({ timeout: 10_000 });
  assert(!(await enable.isChecked()), 'off at first');
  await enable.check();
  await privacy.locator('[data-field="paid-price"]').fill('25');
  assert(settingSaves.length === 0, 'nothing is saved before Save');
  await privacy.locator('[data-action="paid-save"]').click();
  await until(() => settingSaves.length === 1, 'the price is saved');
  assert(settingSaves[0].stars === 25, JSON.stringify(settingSaves[0]));
  await enable.uncheck();
  await privacy.locator('[data-action="paid-save"]').click();
  await until(() => settingSaves.length === 2, 'turned off');
  assert(settingSaves[1].stars === 0, JSON.stringify(settingSaves[1]));
};

const groupSettings = async () => {
  // A group admin's price, and a channel owner's auto-translation.
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  await page.locator('[data-action="chat-about"]').click();
  await page.locator('.person-panel [data-action="chat-settings"]').click();
  const settings = page.locator('[data-dialog="chat-settings"]');
  const price = settings.locator('[data-setting="paidMessages"]');
  await price.waitFor({ timeout: 5000 });
  assert((await price.inputValue()) === '2', 'the group price now');
  await price.fill('5');
  assert(priceSaves.length === 0, 'nothing is saved before Save');
  await settings.locator('[data-action="paid-price-save"]').click();
  await until(() => priceSaves.length === 1, 'the group price is saved');
  assert(
    priceSaves[0].chat === GROUP && priceSaves[0].stars === 5,
    JSON.stringify(priceSaves[0])
  );
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHANNEL}"]`).click();
  await page.locator('[data-action="chat-about"]').click();
  await page.locator('.person-panel [data-action="chat-settings"]').click();
  const toggle = settings.locator('[data-setting="autotranslation"]');
  await toggle.waitFor({ timeout: 5000 });
  assert(setting.length === 0, 'nothing is sent before the click');
  await toggle.click();
  await until(() => setting.length === 1, 'auto-translation is sent');
  assert(
    setting[0].chat === CHANNEL &&
      setting[0].setting === 'autotranslation' &&
      setting[0].value === true,
    JSON.stringify(setting[0])
  );
};

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${FREE}"]`).waitFor();
  await freeChat();
  await paidLabel();
  await cancelled();
  await confirmed();
  await longText();
  await forwarded();
  await remembered();
  await tooDear();
  await profile();
  await privacy();
  await groupSettings();
});
