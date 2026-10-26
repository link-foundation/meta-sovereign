// Real browser e2e for the recent calls list (R-Y163), as Telegram
// Desktop's main menu → Calls: the list shows the calls with their arrows
// (red when missed), "Video" and durations; calls with the same person on
// the same day are one row "(3)"; the Missed tab asks Telegram with the
// missed flag; more pages load when asked; a click opens that chat, where
// the call messages read "Incoming call (1:23)", "Cancelled call",
// "Missed video call" and "Outgoing video call". Telegram's answers
// faked in the page, a fake chat in a memory store, a server on a free
// port, a headless browser; nothing reaches a network or a running app.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:calls

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${ANN}:1`,
  source: 'telegram',
  chat: ANN,
  chatName: 'Ann Lee',
  chatType: 'personal_chat',
  sender: ANN,
  senderName: 'Ann Lee',
  body: 'hello',
  timestamp: new Date(Date.now() - 600_000).toISOString(),
  raw: { id: 1 },
});
const inChat = [
  [2, false, 'PhoneCallDiscardReasonHangup', { duration: 83 }],
  [3, true, 'PhoneCallDiscardReasonMissed', {}],
  [4, false, 'PhoneCallDiscardReasonMissed', { video: true }],
  [5, true, 'PhoneCallDiscardReasonHangup', { video: true, duration: 5 }],
];
for (const [id, out, reason, extra] of inChat) {
  await store.put({
    id: `msg:telegram:${ANN}:${id}`,
    source: 'telegram',
    chat: ANN,
    chatName: 'Ann Lee',
    chatType: 'personal_chat',
    sender: out ? 'me' : ANN,
    senderName: out ? 'Me' : 'Ann Lee',
    body: '',
    service: 'MessageActionPhoneCall',
    outgoing: out,
    timestamp: new Date(Date.now() - 500_000 + id * 1000).toISOString(),
    raw: {
      id,
      out,
      action: {
        className: 'MessageActionPhoneCall',
        reason: { className: reason },
        ...extra,
      },
    },
  });
}

const { base, page, until, finish } = await openChatApp('calls', { store });
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);

const now = Date.now();
const call = (id, chat, name, extra = {}) => ({
  chat,
  name,
  id,
  date: now - (30 - id) * 1000,
  out: false,
  video: false,
  missed: false,
  duration: 0,
  ...extra,
});
const first = [
  call(20, ANN, 'Ann Lee', { duration: 42 }),
  call(19, ANN, 'Ann Lee', { duration: 10 }),
  call(18, ANN, 'Ann Lee', { duration: 7 }),
  call(17, '43', 'Bob Ray', { out: true, video: true, duration: 125 }),
  call(16, ANN, 'Ann Lee', { missed: true }),
];
const second = [
  call(5, '44', 'Cy Old', {
    out: true,
    duration: 3661,
    date: now - 10 * 86_400_000,
  }),
];
const asked = [];
await page.route('**/api/telegram/calls', (route) => {
  const body = route.request().postDataJSON();
  asked.push(body);
  if (body.missed) {
    return fulfil(route, {
      ok: true,
      calls: first.filter((c) => c.missed),
      next: null,
    });
  }
  return body.offsetId
    ? fulfil(route, { ok: true, calls: second, next: null })
    : fulfil(route, { ok: true, calls: first, next: 5 });
});

await finish(async () => {
  await page.goto(base);
  await page.locator('button[data-view="calls"]').click();
  const panel = page.locator('main[data-view="calls"]');
  await panel.locator('.call-row').first().waitFor({ timeout: 15000 });

  // Grouped: Ann's three calls are one row; Bob's video call; Ann missed.
  // The page is short, so the next one is read at once (the list fills
  // the panel); the old call is the fourth row.
  const rows = panel.locator('.call-row');
  await until(async () => (await rows.count()) === 4, 'both pages');
  const texts = await rows.allTextContents();
  assert(texts[0].includes('Ann Lee (3)'), `grouped: ${texts[0]}`);
  assert(texts[1].includes('Bob Ray'), texts[1]);
  assert(
    texts[1].includes('Video') && texts[1].includes('2:05'),
    `video and duration: ${texts[1]}`
  );
  assert(!texts[1].includes('(2)'), 'no count on one call');
  assert(
    (await rows.nth(1).locator('[data-direction="out"]').count()) === 1,
    'outgoing arrow'
  );
  assert(
    (await rows.nth(0).locator('[data-direction="in"]').count()) === 1,
    'incoming arrow'
  );
  assert(
    (await rows.nth(2).locator('.call-arrow.is-missed').count()) === 1,
    'missed arrow is red'
  );
  assert(
    (await rows.nth(0).locator('.call-arrow.is-missed').count()) === 0,
    'answered arrow is not red'
  );

  // More pages loaded; the old call shows its date and long duration.
  assert(
    asked.some((body) => body.missed === false && body.offsetId === 5),
    `paged: ${JSON.stringify(asked)}`
  );
  const last = (await rows.allTextContents())[3];
  assert(last.includes('Cy Old') && last.includes('1:01:01'), last);

  // The Missed tab asks with the flag and shows only missed calls.
  await panel.locator('[data-tab="missed"]').click();
  await until(async () => asked.some((b) => b.missed === true), 'missed asked');
  await until(async () => (await rows.count()) === 1, 'one missed call');
  assert((await rows.first().textContent()).includes('Ann Lee'), 'Ann missed');
  await panel.locator('[data-tab="all"]').click();
  await until(async () => (await rows.count()) === 4, 'all again');

  // A click opens that chat, whose call messages read as in Desktop.
  await rows.first().click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  assert((await panel.count()) === 0, 'the panel closes');
  await until(
    async () => (await page.locator('.service-line').count()) === 4,
    'four call lines'
  );
  const lines = (await page.locator('.service-line').allTextContents()).map(
    (s) => s.trim()
  );
  assert(
    JSON.stringify(lines) ===
      JSON.stringify([
        'Incoming call (1:23)',
        'Cancelled call',
        'Missed video call',
        'Outgoing video call (0:05)',
      ]),
    `lines: ${JSON.stringify(lines)}`
  );
});
