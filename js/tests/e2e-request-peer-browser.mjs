// Real browser e2e for a bot's request-peer buttons and recent locations
// (R-Y208), as Telegram Desktop has them: a button of a bot's keyboard that
// asks for a chat or a person opens a picker of only what fits (the
// server's answer), allows up to the button's number of choices, and
// "Share" answers the bot; a service line says what was shared; the
// Location dialog lists the chat's recent places as quick picks that fill
// the point. Telegram's answers faked in the page, a fake chat in a memory
// store, a server on a free port, a headless browser; nothing reaches a
// network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:request-peer

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '777';
const linkOf = (n) => `msg:telegram:${CHAT}:${n}`;
const start = Date.now() - 10 * 60_000;
const message = (n, fields) => ({
  id: linkOf(n),
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Peer Bot',
  chatType: 'personal_chat',
  sender: CHAT,
  senderName: 'Fake Peer Bot',
  timestamp: new Date(start + n * 60_000).toISOString(),
  body: '',
  ...fields,
  raw: { id: n, ...fields.raw },
});
const button = (text, buttonId, peerType, maxQuantity) => ({
  className: 'KeyboardButtonRequestPeer',
  text,
  buttonId,
  peerType,
  maxQuantity,
});
const store = createMemoryStore();
await store.put(
  message(1, {
    body: 'Share something with me',
    raw: {
      replyMarkup: {
        className: 'ReplyKeyboardMarkup',
        rows: [
          {
            className: 'KeyboardButtonRow',
            buttons: [
              button(
                'Pick a person',
                11,
                { className: 'RequestPeerTypeUser', bot: false },
                1
              ),
              button(
                'Pick groups',
                12,
                {
                  className: 'RequestPeerTypeChat',
                  creator: true,
                  userAdminRights: {
                    className: 'ChatAdminRights',
                    banUsers: true,
                  },
                },
                2
              ),
            ],
          },
        ],
      },
    },
  })
);
await store.put(
  message(2, {
    service: 'MessageActionRequestedPeerSentMe',
    raw: {
      action: {
        className: 'MessageActionRequestedPeerSentMe',
        buttonId: 11,
        peers: [{ className: 'RequestedPeerChannel', title: 'Team Room' }],
      },
    },
  })
);

const { base, page, until, finish } = await openChatApp('request-peer', {
  store,
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: true, complete: true, newest: false })
);
await page.route('**/api/telegram/scheduled', (route) =>
  fulfil(route, { ok: true, messages: [] })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, {
    chat: CHAT,
    kind: 'user',
    title: 'Fake Peer Bot',
    username: 'peerbot',
    bot: true,
  })
);
const asked = [];
await page.route('**/api/telegram/request-peer-candidates', (route) => {
  const { type } = route.request().postDataJSON();
  asked.push(type);
  return fulfil(route, {
    ok: true,
    candidates:
      type.kind === 'user'
        ? [
            { id: '31', name: 'Ann Fake', username: 'annf' },
            { id: '32', name: 'Bob Fake', username: null },
          ]
        : [
            { id: '-41', name: 'Alpha Group', username: null },
            { id: '-42', name: 'Beta Group', username: 'beta' },
            { id: '-43', name: 'Gamma Group', username: null },
          ],
  });
});
const sent = [];
await page.route('**/api/telegram/request-peer-send', (route) => {
  sent.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/recent-locations', (route) =>
  fulfil(route, {
    ok: true,
    places: [
      { id: 5, lat: 52.52, lon: 13.405, date: 100, title: 'Berlin Cafe' },
      { id: 4, lat: 48.8584, lon: 2.2945, date: 90, title: null },
    ],
  })
);
const places = [];
await page.route('**/api/telegram/send-location', (route) => {
  places.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, chat: CHAT });
});

const dialog = page.locator('[data-dialog="request-peer"]');
const pick = (id) => dialog.locator(`[data-peer="${id}"]`);

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await page.locator('.reply-keyboard').waitFor({ timeout: 15000 });

  // One person: the picker lists what the server allowed; one choice.
  await page
    .locator('.reply-keyboard [data-bot-button="peer"]', {
      hasText: 'Pick a person',
    })
    .click();
  await pick('31').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(asked[0]) === '{"kind":"user","bot":false}',
    `type: ${JSON.stringify(asked[0])}`
  );
  assert((await dialog.locator('[data-peer]').count()) === 2, 'two people');
  await dialog.locator('[data-field="search"]').fill('bob');
  assert((await dialog.locator('[data-peer]').count()) === 1, 'search');
  await dialog.locator('[data-field="search"]').fill('');
  await pick('31').check();
  await pick('32').check();
  assert(!(await pick('31').isChecked()), 'one choice only');
  await dialog.locator('button[type="submit"], .primary').first().click();
  await until(() => sent.length === 1, 'answered');
  assert(
    JSON.stringify(sent[0]) ===
      `{"chat":"${CHAT}","msgId":1,"buttonId":11,"peers":["32"]}`,
    `sent: ${JSON.stringify(sent[0])}`
  );
  await until(async () => (await dialog.count()) === 0, 'closed');

  // Groups: up to two; a third is not taken.
  await page
    .locator('.reply-keyboard [data-bot-button="peer"]', {
      hasText: 'Pick groups',
    })
    .click();
  await pick('-41').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(asked[1]) ===
      '{"kind":"chat","creator":true,"userAdminRights":["banUsers"]}',
    `type: ${JSON.stringify(asked[1])}`
  );
  await pick('-41').check();
  await pick('-42').check();
  await pick('-43')
    .check({ force: true })
    .catch(() => null);
  assert(!(await pick('-43').isChecked()), 'at most two');
  await dialog.locator('.primary').first().click();
  await until(() => sent.length === 2, 'answered again');
  assert(
    JSON.stringify(sent[1].peers) === '["-41","-42"]',
    `peers: ${JSON.stringify(sent[1].peers)}`
  );
  await until(async () => (await dialog.count()) === 0, 'closed again');

  // The service line of what was shared.
  const line = page.locator(`.service-line[data-message="${linkOf(2)}"]`);
  await line.waitFor({ timeout: 5000 });
  const said = (await line.textContent()).trim();
  assert(said === 'Fake Peer Bot shared Team Room with you', `line: ${said}`);

  // Recent locations: quick picks in the Location dialog.
  await page.locator('[data-action="attach"]').click();
  await page.locator('[data-action="attach-location"]').click();
  const share = page.locator('.share-dialog');
  await share.waitFor({ timeout: 5000 });
  const picks = share.locator('[data-action="location-recent"]');
  await picks.first().waitFor({ timeout: 5000 });
  assert((await picks.count()) === 2, 'two recent places');
  assert((await picks.first().textContent()).includes('Berlin Cafe'), 'name');
  assert((await picks.nth(1).textContent()).includes('48.85840'), 'point');
  await picks.first().click();
  assert(
    (await share.locator('[data-field="lat"]').inputValue()) === '52.52',
    'latitude filled'
  );
  await page.locator('[data-action="location-send"]').click();
  await until(() => places.length === 1, 'recent place sent');
  assert(
    places[0].lat === 52.52 && places[0].lon === 13.405,
    `place: ${JSON.stringify(places[0])}`
  );
});
