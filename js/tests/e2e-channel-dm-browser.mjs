// Real browser e2e for a channel's direct messages and suggested posts
// (R-Y191), as Telegram's apps have them: the info column of a channel with
// a linked monoforum has a "Direct messages" button that opens it; the
// subscriber writes (the price per message noted, a paid message sent with
// that price, a free one through the usual send) and suggests a post; the
// admin sees the list of the subscribers' threads, opens one, and a reply
// names the thread; a suggested post shows as a card with Approve (asked
// first: "Approve this post for 50 ⭐?") and Decline (with a comment). Writes
// happen only on a click. Telegram's answers faked in the page, a fake
// channel in a memory store, a server on a free port, a headless browser;
// nothing reaches a network or a running app. Not part of `npm test`; run
// it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:channel-dm

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHANNEL = '-1005';
const MONO = '-1009';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${CHANNEL}:1`,
  source: 'telegram',
  chat: CHANNEL,
  chatName: 'Fake Channel',
  chatType: 'channel',
  body: 'hello',
  sender: '31',
  senderName: 'Someone',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const sent = [];
const { base, page, until, finish } = await openChatApp('channel-dm', {
  store,
  send: async (draft) => {
    sent.push(draft);
    return { via: 'fake' };
  },
});

// What the fake Telegram says: who the user is, the price, the threads.
const world = { admin: false, price: 5 };
const post = (id, status, name) => ({
  id,
  out: false,
  from: '42',
  name,
  text: `post ${id}`,
  at: '2031-01-01T10:00:00.000Z',
  suggested: {
    status,
    price: { currency: 'stars', amount: 50 },
    at: '2031-02-01T10:00:00.000Z',
  },
});
const thread = {
  messages: [
    {
      id: 1,
      out: false,
      from: '42',
      name: 'Ann Lee',
      text: 'hello admins',
      at: '2031-01-01T09:00:00.000Z',
      suggested: null,
    },
    post(2, 'pending', 'Ann Lee'),
    post(3, 'pending', 'Ann Lee'),
    {
      id: 4,
      out: true,
      text: '',
      at: '2031-01-01T11:00:00.000Z',
      suggested: null,
      service: { type: 'approval', rejected: true, comment: 'too long' },
    },
  ],
};
const calls = { history: [], send: [], decide: [], threads: [] };

const fixed = {
  history: { written: 0, cached: 0, complete: true },
  'shared-counts': { ok: true, counts: {} },
};
for (const [name, answer] of Object.entries(fixed)) {
  await page.route(`**/api/telegram/${name}`, (route) =>
    fulfil(route, { chat: CHANNEL, ...answer })
  );
}
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, {
    chat: CHANNEL,
    kind: 'channel',
    title: 'Fake Channel',
    broadcast: true,
    monoforum: {
      id: MONO,
      title: 'Fake Channel',
      price: world.price,
      allowed: true,
      admin: world.admin,
    },
  })
);
await page.route('**/api/telegram/channel-dm-threads', (route) => {
  calls.threads.push(route.request().postDataJSON());
  return fulfil(route, {
    ok: true,
    threads: [
      {
        peer: '42',
        name: 'Ann Lee',
        unread: 1,
        top: 4,
        at: '2031-01-01T11:00:00.000Z',
        last: { id: 4, text: 'last words', out: false },
      },
      {
        peer: '43',
        name: 'Bob Ray',
        unread: 0,
        top: 9,
        at: '2031-01-02T11:00:00.000Z',
        last: { id: 9, text: 'thanks', out: true },
      },
    ],
  });
});
await page.route('**/api/telegram/channel-dm-history', (route) => {
  const body = route.request().postDataJSON();
  calls.history.push(body);
  return fulfil(route, {
    ok: true,
    messages: body.peer
      ? thread.messages
      : [
          {
            id: 1,
            out: true,
            text: 'my first',
            at: '2031-01-01T09:00:00.000Z',
            suggested: null,
          },
        ],
    complete: true,
  });
});
await page.route('**/api/telegram/channel-dm-send', (route) => {
  calls.send.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/channel-dm-decide', (route) => {
  const body = route.request().postDataJSON();
  calls.decide.push(body);
  const target = thread.messages.find((m) => m.id === body.id);
  target.suggested.status = body.approve ? 'accepted' : 'rejected';
  return fulfil(route, { ok: true, approved: body.approve });
});

const dialog = page.locator('[data-dialog="channel-dm"]');
const openDm = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHANNEL}"]`).click();
  await page.locator('[data-action="chat-about"]').click();
  await page.locator('[data-action="channel-dm-open"]').click();
  await dialog.waitFor({ timeout: 10000 });
};

const subscriberReads = async () => {
  // The subscriber: the button opens the monoforum, their own thread.
  await openDm();
  await until(() => calls.history.length > 0, 'the thread is read');
  assert(
    calls.history[0].chat === MONO,
    `history: ${JSON.stringify(calls.history[0])}`
  );
  assert(calls.history[0].peer === undefined, 'no peer for a subscriber');
  assert(calls.threads.length === 0, 'no thread list for a subscriber');
  assert(
    (await dialog.locator('[data-dm-message="1"]').textContent()).includes(
      'my first'
    ),
    'their message'
  );
  const note = await dialog.locator('[data-dm-note]').textContent();
  assert(
    note.includes('5 ⭐') && note.includes('per message'),
    `note: ${note}`
  );
  assert(calls.send.length === 0 && sent.length === 0, 'nothing written yet');
};

const subscriberWrites = async () => {
  // A paid message goes through the account's route with its price.
  await dialog.locator('[data-dm-input]').fill('a paid hello');
  await dialog.locator('[data-action="dm-send"]').click();
  // Nothing is paid before the price is confirmed (R-Y184's question).
  const ask = page.locator('[data-dialog="paid-send"]');
  await ask.waitFor({ timeout: 5000 });
  assert(calls.send.length === 0, 'nothing sent before the confirmation');
  await ask.locator('[data-action="cancel"]').click();
  await ask.waitFor({ state: 'detached', timeout: 5000 });
  assert(calls.send.length === 0, 'a cancelled paid message is not sent');
  await dialog.locator('[data-action="dm-send"]').click();
  await ask.waitFor({ timeout: 5000 });
  await ask.locator('[data-action="submit"]').click();
  await until(() => calls.send.length === 1, 'the paid message is sent');
  assert(
    calls.send[0].chat === MONO &&
      calls.send[0].text === 'a paid hello' &&
      calls.send[0].stars === 5 &&
      calls.send[0].peer === undefined &&
      calls.send[0].suggestedPost === undefined,
    `paid send: ${JSON.stringify(calls.send[0])}`
  );

  // Suggest a post: the attach menu, a price and a date; sent on the click.
  await dialog.locator('[data-action="dm-attach"]').click();
  await dialog.locator('[data-action="dm-suggest"]').click();
  await dialog.locator('[data-dm-input]').fill('my post');
  await dialog.locator('[data-dm-suggest-price]').fill('50');
  const next = new Date(Date.now() + 400 * 24 * 3600 * 1000);
  const typed = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}T10:30`;
  await dialog.locator('[data-dm-suggest-date]').fill(typed);
  assert(calls.send.length === 1, 'the form alone writes nothing');
  await dialog.locator('[data-action="dm-suggest-send"]').click();
  await ask.waitFor({ timeout: 5000 });
  await ask.locator('[data-action="submit"]').click();
  await until(() => calls.send.length === 2, 'the suggestion is sent');
  const suggestion = calls.send[1];
  assert(
    suggestion.text === 'my post' &&
      suggestion.suggestedPost.stars === 50 &&
      suggestion.suggestedPost.scheduleDate ===
        Math.floor(Date.parse(typed) / 1000) &&
      suggestion.stars === 5,
    `suggestion: ${JSON.stringify(suggestion)}`
  );
};

const freeMessages = async () => {
  // Free messages go through the usual send path.
  world.price = 0;
  await openDm();
  assert(
    (await dialog.locator('[data-dm-note]').count()) === 0,
    'no note when free'
  );
  await dialog.locator('[data-dm-input]').fill('a free hello');
  await dialog.locator('[data-action="dm-send"]').click();
  await until(
    () => sent.length === 1,
    'the free message goes through /api/send'
  );
  assert(
    sent[0].chat === MONO && sent[0].text === 'a free hello',
    `send: ${JSON.stringify(sent[0])}`
  );
  assert(calls.send.length === 2, 'the account route was not used');
};

const adminThreads = async () => {
  // The admin: the list of threads, laid out as topics.
  world.admin = true;
  await openDm();
  await until(() => calls.threads.length === 1, 'the threads are listed');
  assert(calls.threads[0].chat === MONO, 'threads of the monoforum');
  await dialog.locator('[data-dm-peer="43"]').waitFor({ timeout: 10000 });
  const rows = await dialog
    .locator('[data-dm-peer]')
    .evaluateAll((list) => list.map((b) => [b.dataset.dmPeer, b.textContent]));
  assert(
    rows.length === 2 && rows[0][0] === '42' && rows[1][0] === '43',
    `rows: ${rows}`
  );
  assert(
    rows[0][1].includes('Ann Lee') && rows[0][1].includes('last words'),
    rows[0][1]
  );

  // A thread: its history asked with the subscriber, cards and service text.
  await dialog.locator('[data-dm-peer="42"]').click();
  await dialog.locator('[data-dm-message="2"]').waitFor({ timeout: 10000 });
  assert(
    calls.history.at(-1).peer === '42' && calls.history.at(-1).chat === MONO,
    'asked with the peer'
  );
  const card = dialog.locator('[data-dm-message="2"] [data-dm-card]');
  assert(
    (await card.getAttribute('data-dm-card')) === 'pending',
    'pending card'
  );
  assert(
    (await card.locator('[data-dm-price]').textContent()) === '50 ⭐',
    'the price'
  );
  const service = await dialog.locator('[data-dm-service="4"]').textContent();
  assert(service.includes('too long'), `service: ${service}`);
};

const adminReplies = async () => {
  // A reply carries the thread as the monoforum reply target.
  await dialog.locator('[data-dm-input]').fill('thanks, Ann');
  await dialog.locator('[data-action="dm-send"]').click();
  await until(() => calls.send.length === 3, 'the reply is sent');
  const reply = calls.send[2];
  assert(
    reply.chat === MONO && reply.peer === '42' && reply.text === 'thanks, Ann',
    `reply: ${JSON.stringify(reply)}`
  );
};

const adminDecides = async () => {
  // Approve asks first, with the price; nothing is written before the click.
  const one = dialog.locator('[data-dm-message="2"]');
  await one.locator('[data-action="dm-approve"]').click();
  const ask = (await one.locator('[data-dm-ask]').textContent()).trim();
  assert(ask.startsWith('Approve this post for 50 ⭐?'), `ask: ${ask}`);
  assert(calls.decide.length === 0, 'asked, not yet approved');
  await one.locator('[data-action="dm-ask-cancel"]').click();
  assert(calls.decide.length === 0, 'cancelled');
  await one.locator('[data-action="dm-approve"]').click();
  await one.locator('[data-action="dm-approve-confirm"]').click();
  await until(() => calls.decide.length === 1, 'approved');
  assert(
    calls.decide[0].chat === MONO &&
      calls.decide[0].id === 2 &&
      calls.decide[0].approve === true,
    `approve: ${JSON.stringify(calls.decide[0])}`
  );
  await until(
    async () =>
      (await one.locator('[data-dm-status]').getAttribute('data-dm-status')) ===
      'accepted',
    'the card is accepted'
  );
  assert(
    (await one.locator('[data-action="dm-approve"]').count()) === 0,
    'no buttons once decided'
  );

  // Decline takes a comment.
  const other = dialog.locator('[data-dm-message="3"]');
  await other.locator('[data-action="dm-decline"]').click();
  await other.locator('[data-dm-comment]').fill('not this week');
  await other.locator('[data-action="dm-decline-confirm"]').click();
  await until(() => calls.decide.length === 2, 'declined');
  assert(
    calls.decide[1].id === 3 &&
      calls.decide[1].approve === false &&
      calls.decide[1].comment === 'not this week',
    `decline: ${JSON.stringify(calls.decide[1])}`
  );
  await until(
    async () =>
      (await other
        .locator('[data-dm-status]')
        .getAttribute('data-dm-status')) === 'rejected',
    'the card is declined'
  );
};

await finish(async () => {
  await subscriberReads();
  await subscriberWrites();
  await freeMessages();
  await adminThreads();
  await adminReplies();
  await adminDecides();
});
