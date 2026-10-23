// Real browser e2e for map previews of places (R-Y131), as Telegram Desktop
// draws them: a place shows a map picture from the server with a pin over
// its middle; a venue's title and address, or "Live location", go under
// it; a click opens the place in a map site in a new tab; when the picture
// fails, the plain card stays. The map route is faked in the page with a
// tiny PNG, a fake chat in a memory store, a server on a free port, a
// headless browser; nothing reaches a network or a running app. Not part
// of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:map

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-1005';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);
const MEDIA = {
  1: {
    className: 'MessageMediaGeo',
    geo: { lat: 55.75, long: 37.62, accessHash: '777' },
  },
  2: {
    className: 'MessageMediaVenue',
    geo: { lat: 48.85, long: 2.35, accessHash: '-5' },
    title: 'Cafe Central',
    address: '1 Rue Example',
  },
  3: {
    className: 'MessageMediaGeoLive',
    geo: { lat: 40.71, long: -74.0, accessHash: '9' },
  },
  // The map of this one fails.
  4: { className: 'MessageMediaGeo', geo: { lat: 10.5, long: 20.5 } },
};
const store = createMemoryStore();
const start = Date.now() - 10 * 60_000;
const placeMessage = (n, media) => ({
  raw: { id: n, media },
  id: `msg:telegram:${GROUP}:${n}`,
  timestamp: new Date(start + n * 60_000).toISOString(),
  body: '',
  source: 'telegram',
  chat: GROUP,
  chatType: 'supergroup',
  chatName: 'Fake Place Group',
  sender: '31',
  senderName: 'Traveller',
});
await Promise.all(
  Object.entries(MEDIA).map(([n, media]) =>
    store.put(placeMessage(Number(n), media))
  )
);

const { base, page, until, finish } = await openChatApp('map', { store });

const quiet = { '/history': { written: 0, cached: 0, complete: true } };
quiet['/shared-counts'] = { ok: true, counts: {} };
for (const [route, answer] of Object.entries(quiet)) {
  await page.route(`**/api/telegram${route}`, (r) => fulfil(r, answer));
}
const asked = [];
await page.route('**/api/telegram/map*', (route) => {
  const url = new URL(route.request().url());
  asked.push(url.searchParams);
  return url.searchParams.get('lat') === '10.5'
    ? fulfil(route, { error: 'no map' }, 404)
    : route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
});
// The map site is never reached.
const popups = [];
await page
  .context()
  .route('https://www.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>map</p>' })
  );
page.context().on('page', (p) => popups.push(p));

const message = (n) =>
  page.locator(`[data-message="msg:telegram:${GROUP}:${n}"]`);

const mapSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  await message(1).locator('[data-place-map] img').waitFor({ timeout: 15000 });

  // The picture, from the route, with the place's numbers; a pin over it.
  const first = asked.find((q) => q.get('lat') === '55.75');
  assert(first, `the map was asked: ${asked.length}`);
  assert(first.get('lon') === '37.62' && first.get('hash') === '777', 'point');
  assert(first.get('w') === '300' && first.get('h') === '150', 'size');
  assert(first.get('zoom') === '15', 'zoom');
  assert(['1', '2', '3'].includes(first.get('scale')), 'scale');
  await until(
    () =>
      message(1)
        .locator('[data-place-map] img')
        .evaluate((img) => img.naturalWidth > 0),
    'the picture loaded'
  );
  const pin = message(1).locator('[data-place-map] svg.place-pin');
  assert((await pin.count()) === 1, 'a pin');
  const [map, mark] = await Promise.all([
    message(1).locator('.place-map').boundingBox(),
    pin.boundingBox(),
  ]);
  assert(
    Math.abs(mark.x + mark.width / 2 - (map.x + map.width / 2)) < 2 &&
      mark.y + mark.height <= map.y + map.height / 2 + 2 &&
      mark.y + mark.height >= map.y + map.height / 2 - 2,
    "the pin's tip is in the middle of the map"
  );

  // A venue: title and address under the map.
  await message(2).locator('[data-place-map]').waitFor({ timeout: 5000 });
  const venue = await message(2).locator('.place-lines').textContent();
  assert(
    venue.includes('Cafe Central') && venue.includes('1 Rue Example'),
    `venue: ${venue}`
  );
  // A live location says so.
  await message(3).locator('[data-place-map]').waitFor({ timeout: 5000 });
  assert(
    (await message(3).locator('.place-lines').textContent()).includes(
      'Live location'
    ),
    'live label'
  );

  // A failed picture leaves the plain card, still a link.
  await message(4).locator('a.bubble-card.place').waitFor({ timeout: 10000 });
  assert(
    (await message(4).locator('[data-place-map]').count()) === 0,
    'no map'
  );
  assert(
    (
      await message(4).locator('a.bubble-card.place').getAttribute('href')
    ).includes('mlat=10.5'),
    'the card links to the map site'
  );
};

const clickSteps = async () => {
  const link = message(2).locator('[data-place-map]');
  assert((await link.getAttribute('target')) === '_blank', 'new tab');
  assert((await link.getAttribute('rel')).includes('noopener'), 'noopener');
  assert(
    (await link.getAttribute('href')) ===
      'https://www.openstreetmap.org/?mlat=48.85&mlon=2.35#map=16/48.85/2.35',
    'the map site address'
  );
  await link.click();
  await until(async () => popups.length === 1, 'a new tab opened');
  await popups[0].waitForLoadState().catch(() => {});
  assert(
    popups[0].url().startsWith('https://www.openstreetmap.org/?mlat=48.85'),
    `opened: ${popups[0].url()}`
  );
};

await finish(async () => {
  await mapSteps();
  await clickSteps();
});
