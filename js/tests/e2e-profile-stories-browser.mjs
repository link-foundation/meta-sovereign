// Real browser e2e for stories and music on a profile (R-Y185), as
// Telegram Desktop shows them: a person's info column has "Stories" (the
// pinned ones as a grid, the one fixed on top first, album chips that load
// the album, a click opening the story viewer) and "Music" (saved songs
// with a play button that asks for the audio); on one's own profile each
// story can be taken off the profile or fixed on top, the archive opens in
// a dialog where a story can be shown again, and a track can be removed —
// every one of those a write sent on a click only. Telegram's answers
// faked in the page, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:profile-stories

import { assert, fulfil } from './helpers/e2e-chat.mjs';
import {
  PERSON,
  SELF,
  openAbout,
  openProfileApp,
} from './helpers/e2e-profile-chat.mjs';

const app = await openProfileApp('profile-stories');
const { page, until, finish } = app;

const story = (id, extra = {}) => ({
  id,
  date: 1_700_000_000 + id,
  expire: 1_700_086_400,
  caption: `story ${id}`,
  entities: [],
  media: { kind: 'photo' },
  mine: false,
  views: 0,
  reactions: 0,
  reaction: '',
  pinned: true,
  top: false,
  ...extra,
});

const asks = [];
await page.route('**/api/telegram/profile-stories', (route) => {
  const body = route.request().postDataJSON();
  asks.push(body);
  const mine = body.chat === SELF;
  if (body.album) {
    return fulfil(route, {
      ok: true,
      count: 1,
      me: SELF,
      mine,
      stories: [story(21)],
      albums: [],
      next: null,
    });
  }
  return fulfil(route, {
    ok: true,
    count: 3,
    me: SELF,
    mine,
    stories: [story(11), story(12, { top: true }), story(13)],
    albums: [{ id: 4, title: 'Trips' }],
    next: null,
  });
});
const archive = [story(31, { pinned: false }), story(32, { pinned: false })];
await page.route('**/api/telegram/stories-archive', (route) =>
  fulfil(route, { ok: true, count: 2, me: SELF, stories: archive, next: null })
);
const writes = [];
for (const name of ['story-pin', 'story-pin-top', 'music-remove']) {
  await page.route(`**/api/telegram/${name}`, (route) => {
    const body = route.request().postDataJSON();
    writes.push([name, body]);
    return fulfil(
      route,
      name === 'story-pin'
        ? { ok: true, pinned: body.pinned, ids: body.ids }
        : { ok: true, ids: body.ids ?? [], id: body.id }
    );
  });
}
const track = (id, title) => ({
  id,
  title,
  performer: 'Band',
  duration: 61,
  size: 10,
  name: '',
});
await page.route('**/api/telegram/saved-music', (route) =>
  fulfil(route, {
    ok: true,
    count: 2,
    mine: route.request().postDataJSON().chat === SELF,
    tracks: [track('501', 'First song'), track('502', 'Second song')],
    next: null,
  })
);
const heard = [];
await page.route('**/api/telegram/music?*', (route) => {
  heard.push(new URL(route.request().url()).searchParams.get('id'));
  return route.fulfill({
    status: 200,
    contentType: 'audio/wav',
    body: Buffer.alloc(64),
  });
});

const section = page.locator('.person-panel [data-profile-stories]');

const otherSteps = async () => {
  await openAbout(app, PERSON);
  await section.waitFor({ timeout: 10_000 });
  const cells = section.locator('[data-story-cell]');
  assert((await cells.count()) === 3, 'three pinned stories');
  const order = await cells.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute('data-story-cell'))
  );
  assert(order.join() === '12,11,13', `the one on top first: ${order}`);
  assert(
    (await section.locator('[data-story-top]').count()) === 1,
    'the pin mark on the top one'
  );
  assert(
    (await section.locator('[data-action="story-unpin"]').count()) === 0 &&
      (await section.locator('[data-action="stories-archive"]').count()) === 0,
    "no editing on another's profile"
  );
  // Albums.
  assert((await section.locator('[data-album]').count()) === 2, 'chips');
  await section.locator('[data-album="4"]').click();
  await until(
    async () => (await cells.count()) === 1,
    "the album's stories load"
  );
  assert(
    asks.some((a) => a.album === 4 && a.chat === PERSON),
    `the album was asked: ${JSON.stringify(asks)}`
  );
  await section.locator('[data-album="all"]').click();
  await until(async () => (await cells.count()) === 3, 'all stories again');
  // The viewer.
  await section
    .locator('[data-story-cell="11"] [data-action="profile-story-open"]')
    .click();
  const viewer = page.locator(`[data-story-viewer="${PERSON}"]`);
  await viewer.waitFor({ timeout: 5000 });
  await until(
    async () => (await viewer.getAttribute('data-story')) === '11',
    'the viewer opens on the clicked story'
  );
  await page.keyboard.press('Escape');
  await until(async () => (await viewer.count()) === 0, 'Escape closes it');
  // Music.
  const list = page.locator('.person-panel [data-music-list]');
  await list.waitFor({ timeout: 5000 });
  assert((await list.locator('[data-music]').count()) === 2, 'two songs');
  assert(
    (await list.textContent()).includes('First song — Band'),
    'title and performer'
  );
  assert(
    (await list.locator('[data-action="music-remove"]').count()) === 0,
    "no removing from another's profile"
  );
  assert(heard.length === 0, 'nothing was loaded before a click');
  await list.locator('[data-music="501"] [data-action="music-play"]').click();
  await until(() => heard.includes('501'), 'the audio is asked for on play');
  assert(writes.length === 0, `no write on another's profile: ${writes}`);
};

const ownSteps = async () => {
  await openAbout(app, SELF);
  await section.waitFor({ timeout: 10_000 });
  const cells = section.locator('[data-story-cell]');
  await cells.first().waitFor();
  assert(writes.length === 0, 'no write before a click');
  // Take a story off the profile.
  await section
    .locator('[data-story-cell="13"] [data-action="story-unpin"]')
    .click();
  await until(async () => (await cells.count()) === 2, 'the story left');
  assert(
    JSON.stringify(writes.at(-1)) ===
      JSON.stringify(['story-pin', { chat: SELF, ids: [13], pinned: false }]),
    `unpin: ${JSON.stringify(writes)}`
  );
  // Fix another on top (the first, 12, is already there).
  await section
    .locator('[data-story-cell="11"] [data-action="story-top"]')
    .click();
  await until(
    async () => (await section.locator('[data-story-top]').count()) === 2,
    'two on top'
  );
  const top = writes.at(-1);
  assert(
    top[0] === 'story-pin-top' && top[1].ids.join() === '12,11',
    `pin to top: ${JSON.stringify(top)}`
  );
  // The archive.
  await section.locator('[data-action="stories-archive"]').click();
  const dialog = page.locator('[data-dialog="stories-archive"]');
  await dialog.locator('[data-story-cell="31"]').waitFor({ timeout: 5000 });
  assert(
    (await dialog.locator('[data-story-cell]').count()) === 2,
    'two archived stories'
  );
  await dialog
    .locator('[data-story-cell="31"] [data-action="story-pin"]')
    .click();
  await until(
    () =>
      JSON.stringify(writes.at(-1)) ===
      JSON.stringify(['story-pin', { chat: SELF, ids: [31], pinned: true }]),
    'the archived story is shown on the profile'
  );
  await page.keyboard.press('Escape');
  await until(async () => (await dialog.count()) === 0, 'the archive closes');
  // Music of one's own: removing a track.
  const list = page.locator('.person-panel [data-music-list]');
  await list.locator('[data-music="502"] [data-action="music-remove"]').click();
  await until(
    async () => (await list.locator('[data-music]').count()) === 1,
    'the track left'
  );
  assert(
    JSON.stringify(writes.at(-1)) ===
      JSON.stringify(['music-remove', { id: '502' }]),
    `remove: ${JSON.stringify(writes.at(-1))}`
  );
};

await finish(async () => {
  await otherSteps();
  await ownSteps();
});
