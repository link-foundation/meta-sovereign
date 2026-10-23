// Real browser e2e for sharing a place and a contact (R-Y142), as Telegram
// Desktop offers them: the paperclip's menu has Location and Contact;
// Location sends a typed place (validated ranges, a map preview), the
// browser's position only after "Use my location" (a refusal said in
// words, then a faked position with its accuracy), and a live place for
// a chosen time; Contact sends one picked from the searchable list or a
// typed card; our live location's menu has "Stop sharing location"; a
// contact card from someone else offers "Add to contacts". Telegram's
// answers faked in the page, a faked navigator.geolocation, fake chats in
// a memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:share-location

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '555';
const store = createMemoryStore();
const nowS = Math.floor(Date.now() / 1000);
const stored = (n, extra) => ({
  id: `msg:telegram:${CHAT}:${n}`,
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Dave',
  chatType: 'user',
  timestamp: new Date(Date.now() - 60_000 * (10 - n)).toISOString(),
  ...extra,
});
await store.put(
  stored(1, {
    sender: CHAT,
    senderName: 'Fake Dave',
    body: 'hi',
    raw: { id: 1 },
  })
);
await store.put(
  stored(2, {
    sender: 'me',
    senderName: 'Me',
    body: '',
    raw: {
      id: 2,
      out: true,
      date: nowS - 120,
      editDate: nowS - 60,
      media: {
        className: 'MessageMediaGeoLive',
        geo: { lat: 10.5, long: 20.25 },
        period: 3600,
      },
    },
  })
);
await store.put(
  stored(3, {
    sender: CHAT,
    senderName: 'Fake Dave',
    body: '',
    raw: {
      id: 3,
      date: nowS - 30,
      media: {
        className: 'MessageMediaContact',
        phoneNumber: '+4915112345',
        firstName: 'Eve',
        lastName: 'Adams',
        userId: 777,
      },
    },
  })
);

const {
  engine,
  base: origin,
  page,
  until,
  finish,
} = await openChatApp('share-location', { store });

// A faked browser position: the test says what the next ask answers.
await page.addInitScript(() => {
  window.__geo = { mode: 'denied', asked: 0 };
  Object.defineProperty(window.navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition(ok, fail) {
        window.__geo.asked += 1;
        if (window.__geo.mode === 'denied') {
          fail({ code: 1 });
        } else {
          ok({
            coords: { latitude: 48.8584, longitude: 2.2945, accuracy: 42.4 },
          });
        }
      },
    },
  });
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
await page.route('**/api/telegram/map*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/scheduled', (route) =>
  fulfil(route, { ok: true, messages: [] })
);
const locations = [];
const contacts = [];
const stops = [];
const adds = [];
await page.route('**/api/telegram/send-location', (route) => {
  locations.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, chat: CHAT });
});
await page.route('**/api/telegram/send-contact', (route) => {
  contacts.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, chat: CHAT });
});
await page.route('**/api/telegram/stop-live-location', (route) => {
  stops.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/peer-contact', (route) => {
  adds.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, contact: true });
});
await page.route('**/api/telegram/chat-contacts', (route) =>
  fulfil(route, {
    ok: true,
    contacts: [
      { id: '5', name: 'Ann Lee', username: 'annl' },
      { id: '6', name: 'Bob Stone', username: null },
    ],
  })
);

const menu = async (action) => {
  await page.locator('[data-action="attach"]').click();
  await page.locator(`[data-action="attach-${action}"]`).click();
};
const dialog = page.locator('.share-dialog');
const field = (name) => dialog.locator(`[data-field="${name}"]`);

const typedPlace = async () => {
  await page.goto(`${origin}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });

  // The menu has the new entries.
  await page.locator('[data-action="attach"]').click();
  for (const name of ['file', 'location', 'contact']) {
    assert(
      (await page.locator(`[data-action="attach-${name}"]`).count()) === 1,
      `the menu has ${name}`
    );
  }
  await page.keyboard.press('Escape');

  // Location: nothing is asked of the browser until "Use my location".
  await menu('location');
  await dialog.waitFor({ timeout: 5000 });
  const send = page.locator('[data-action="location-send"]');
  assert(await send.isDisabled(), 'Send off while empty');
  assert((await page.evaluate(() => window.__geo.asked)) === 0, 'not asked');

  // A typed place: ranges are validated, the preview shows.
  await field('lat').fill('95');
  await field('lon').fill('10');
  assert(await send.isDisabled(), 'latitude out of range');
  assert(
    (await dialog.locator('[data-share="invalid"]').count()) === 1,
    'said so'
  );
  await field('lat').fill('52.52');
  await field('lon').fill('13,405');
  assert(!(await send.isDisabled()), 'Send on for a good place');
  await dialog.locator('[data-share="preview"] img').waitFor({ timeout: 5000 });
  await send.click();
  await until(() => locations.length === 1, 'typed place sent');
  assert(
    locations[0].chat === CHAT &&
      locations[0].lat === 52.52 &&
      locations[0].lon === 13.405 &&
      locations[0].accuracy === undefined &&
      locations[0].live === undefined &&
      typeof locations[0].clientId === 'string',
    `typed: ${JSON.stringify(locations[0])}`
  );
  await until(async () => (await dialog.count()) === 0, 'closed after send');
};

const myPlace = async () => {
  const send = page.locator('[data-action="location-send"]');
  // "Use my location": a refusal in words, then the position.
  await menu('location');
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-action="location-use"]').click();
  await dialog.locator('[data-share="problem"]').waitFor({ timeout: 5000 });
  assert((await page.evaluate(() => window.__geo.asked)) === 1, 'asked once');
  assert(await send.isDisabled(), 'nothing to send after a refusal');
  await page.evaluate(() => {
    window.__geo.mode = 'ok';
  });
  await dialog.locator('[data-action="location-use"]').click();
  await until(
    async () => (await field('lat').inputValue()) === '48.858400',
    'filled'
  );
  assert((await field('lon').inputValue()) === '2.294500', 'longitude filled');
  await dialog.locator('[data-share="accuracy"]').waitFor({ timeout: 5000 });
  // A live location for one hour.
  await field('live').selectOption('3600');
  await send.click();
  await until(() => locations.length === 2, 'my place sent');
  assert(
    locations[1].lat === 48.8584 &&
      locations[1].lon === 2.2945 &&
      locations[1].accuracy === 42 &&
      locations[1].live === 3600,
    `mine: ${JSON.stringify(locations[1])}`
  );
  await until(async () => (await dialog.count()) === 0, 'closed again');
};

const contactSteps = async () => {
  // Contact: search the list, pick, send.
  await menu('contact');
  await dialog.waitFor({ timeout: 5000 });
  const rows = dialog.locator('[data-contact]');
  await until(async () => (await rows.count()) === 2, 'two contacts listed');
  await field('contact-search').fill('stone');
  await until(async () => (await rows.count()) === 1, 'search narrows');
  await field('contact-search').fill('ann');
  await rows.first().click();
  await page.locator('[data-action="contact-send"]').click();
  await until(() => contacts.length === 1, 'contact sent');
  assert(
    contacts[0].chat === CHAT &&
      contacts[0].contact === '5' &&
      contacts[0].phone === undefined,
    `picked: ${JSON.stringify(contacts[0])}`
  );
  await until(async () => (await dialog.count()) === 0, 'closed after pick');

  // A typed contact.
  await menu('contact');
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-tab="typed"]').click();
  const sendContact = page.locator('[data-action="contact-send"]');
  assert(await sendContact.isDisabled(), 'off while empty');
  await field('first').fill('Zed');
  await field('phone').fill('nope');
  assert(await sendContact.isDisabled(), 'off for a bad phone');
  await field('phone').fill('+1 555 010 9999');
  await sendContact.click();
  await until(() => contacts.length === 2, 'typed contact sent');
  assert(
    contacts[1].firstName === 'Zed' &&
      contacts[1].phone === '+1 555 010 9999' &&
      contacts[1].contact === undefined,
    `typed contact: ${JSON.stringify(contacts[1])}`
  );
  await until(async () => (await dialog.count()) === 0, 'closed after typed');
};

const messageSteps = async () => {
  // Our live location: its card, and "Stop sharing location" in its menu.
  const live = page.locator(`[data-message="msg:telegram:${CHAT}:2"]`);
  await live.waitFor({ timeout: 10000 });
  assert(/live/i.test(await live.innerText()), 'live place card shown');
  assert(/until/i.test(await live.innerText()), 'its end is shown');
  await live.click({ button: 'right' });
  await page.locator('[data-action="stopLive"]').first().click();
  await until(() => stops.length === 1, 'stop sent');
  assert(
    stops[0].chat === CHAT && stops[0].id === 2,
    `stop: ${JSON.stringify(stops[0])}`
  );

  // A contact card from someone else: "Add to contacts".
  const card = page.locator(`[data-message="msg:telegram:${CHAT}:3"]`);
  assert((await card.innerText()).includes('Eve Adams'), 'contact name shown');
  await card.locator('[data-action="contact-add"]').click();
  await until(() => adds.length === 1, 'contact added');
  assert(
    adds[0].chat === '777' &&
      adds[0].firstName === 'Eve' &&
      adds[0].lastName === 'Adams',
    `add: ${JSON.stringify(adds[0])}`
  );
};

await finish(async () => {
  await typedPlace();
  await myPlace();
  await contactSteps();
  await messageSteps();
  assert(engine.length > 0, 'engine named');
});
