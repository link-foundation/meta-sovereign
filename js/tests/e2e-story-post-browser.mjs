// Real browser e2e for posting a story (R-Y156), as Telegram Desktop has
// it: the user's avatar first in the strip with a "+" badge while they
// have no story; a click opens a file picker; a limit answer is told in
// words with no composer; a picked picture opens the composer (9:16
// frame, caption, whom it is for); posting uploads it and asks for the
// story with the chosen fields; the strip then shows "My story" and the
// story opens. Telegram's answers faked in the page, fake chats in a
// memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:story-post

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const ME = '7';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${ANN}:1`,
  source: 'telegram',
  chat: ANN,
  chatName: 'Ann Lee',
  chatType: 'private',
  sender: ANN,
  senderName: 'Ann Lee',
  body: 'hello',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

// A 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const NOW = Math.floor(Date.now() / 1000);
const ann = {
  peer: ANN,
  name: 'Ann Lee',
  self: false,
  count: 1,
  lastId: 11,
  maxReadId: 0,
  unread: true,
};
const mine = {
  peer: ME,
  name: 'Me',
  self: true,
  count: 1,
  lastId: 31,
  maxReadId: 0,
  unread: false,
};
const myStory = {
  id: 31,
  date: NOW - 5,
  caption: 'from the test',
  entities: [],
  media: { kind: 'photo' },
  mine: true,
};

const { base, page, until, finish } = await openChatApp('story-post', {
  store,
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignStoriesEnabled', 'on');
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
const state = { posted: false, can: { ok: true, remains: 5 } };
await page.route('**/api/telegram/stories', (route) =>
  fulfil(route, {
    ok: true,
    peers: route.request().postDataJSON()?.hidden
      ? []
      : state.posted
        ? [mine, ann]
        : [ann],
    state: 'S',
    more: false,
  })
);
await page.route('**/api/telegram/stories-peer', (route) =>
  fulfil(route, { ok: true, peer: mine, stories: [myStory] })
);
await page.route('**/api/telegram/stories-read', (route) =>
  fulfil(route, { ok: true })
);
await page.route(/\/api\/telegram\/story\?/, (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);
await page.route('**/api/telegram/story-can-post', (route) =>
  fulfil(route, {
    premium: false,
    captionMax: 200,
    me: { id: ME, name: 'Me' },
    ...state.can,
  })
);
await page.route('**/api/telegram/chat-contacts', (route) =>
  fulfil(route, {
    ok: true,
    contacts: [{ id: '5', name: 'Cy Doe', username: null }],
  })
);
const uploads = [];
await page.route('**/api/telegram/upload**', (route) => {
  uploads.push(route.request().url());
  return fulfil(route, {
    ok: true,
    token: 'a'.repeat(32),
    name: 'story.png',
    size: PNG.length,
  });
});
const posts = [];
await page.route('**/api/telegram/story-post', (route) => {
  posts.push(route.request().postDataJSON());
  state.posted = true;
  return fulfil(route, { ok: true });
});

const add = page.locator('[data-story-add]');
const composer = page.locator('[data-story-composer]');
const notice = page.locator('[data-story-notice]');
const file = { name: 'story.png', mimeType: 'image/png', buffer: PNG };

const badge = async () => {
  await page.goto(`${base}/`);
  await until(async () => (await add.count()) === 1, 'a "+" entry');
  assert(
    (await add.locator('.story-add-badge').count()) === 1,
    'the "+" badge'
  );
  assert(
    (await add.getAttribute('aria-label')) === 'Add story',
    'its label says Add story'
  );
  // Own avatar first, before Ann (its id once the account is known).
  const firstPeer = () =>
    page
      .locator('.stories-list > button')
      .first()
      .getAttribute('data-story-peer');
  await until(async () => (await firstPeer()) === ME, 'own avatar first');
};

const limit = async () => {
  // The limit is asked for when a file is picked, and again for a click
  // when it is already known: words, never a composer.
  state.can = { ok: false, code: 'too-many' };
  await page.locator('[data-story-file]').setInputFiles(file);
  await until(async () => (await notice.count()) === 1, 'a limit notice');
  const words = await notice.textContent();
  assert(words.includes('limit of stories'), `limit words: ${words}`);
  assert((await composer.count()) === 0, 'no composer under the limit');
  await page.locator('[data-action="story-notice-ok"]').click();
  await until(async () => (await notice.count()) === 0, 'notice closed');
  await add.click();
  await until(async () => (await notice.count()) === 1, 'the notice on click');
  assert((await composer.count()) === 0, 'still no composer');
  await page.locator('[data-action="story-notice-ok"]').click();
  assert(uploads.length === 0 && posts.length === 0, 'nothing sent');
};

const compose = async () => {
  state.can = { ok: true, remains: 5 };
  // The cached limit still stands until a file is picked and asked again.
  await page.locator('[data-story-file]').setInputFiles(file);
  await until(async () => (await composer.count()) === 1, 'the composer');
  assert(
    (await composer.getAttribute('data-story-composer')) === 'photo',
    'a photo'
  );
  const frame = await composer.locator('.story-compose-frame').boundingBox();
  assert(
    Math.abs(frame.width / frame.height - 9 / 16) < 0.02,
    `a 9:16 frame: ${frame.width}x${frame.height}`
  );
  assert(
    (await composer.locator('[data-choice="everyone"]').isChecked()) === true,
    'everyone by default'
  );
  assert(
    (await composer.locator('[data-group="period"]').count()) === 0,
    'no period without Premium'
  );
  await composer.locator('[data-choice="contacts"]').check();
  await composer.locator('[data-field="caption"]').fill('hello world');
  await composer.locator('[data-field="screenshots"]').uncheck();
  await composer.locator('[data-field="pinned"]').check();
  await composer.locator('[data-action="story-compose-post"]').click();
  await until(() => posts.length === 1, 'the story posted');
  assert(uploads.length === 1, 'the file uploaded once');
  const body = posts[0];
  const want = {
    token: 'a'.repeat(32),
    kind: 'photo',
    caption: 'hello world',
    privacy: 'contacts',
    users: [],
    screenshots: false,
    pinned: true,
  };
  assert(
    JSON.stringify(body) === JSON.stringify(want),
    `post body: ${JSON.stringify(body)}`
  );
  await until(async () => (await composer.count()) === 0, 'composer closed');
};

const shows = async () => {
  await until(
    async () => (await page.locator(`[data-story-peer="${ME}"]`).count()) === 1,
    'own story in the strip'
  );
  await until(async () => (await add.count()) === 0, 'the "+" is gone');
  const name = await page
    .locator(`[data-story-peer="${ME}"] .story-peer-name`)
    .textContent();
  assert(name === 'My story', `strip says: ${name}`);
  await page.locator(`[data-story-peer="${ME}"]`).click();
  const view = page.locator('[data-story-viewer]');
  await until(async () => (await view.count()) === 1, 'the viewer opens');
  await until(
    async () => (await view.getAttribute('data-story')) === '31',
    'story 31'
  );
  // The menu of one's own stories has "Add story", which picks a file.
  await view.locator('[data-action="story-menu"]').click();
  const chooser = page.waitForEvent('filechooser');
  await view.locator('[data-action="story-add"]').click();
  await (await chooser).setFiles(file);
  await until(async () => (await composer.count()) === 1, 'composer again');
  assert((await view.count()) === 0, 'the viewer closed for it');
};

await finish(async () => {
  await badge();
  await limit();
  await compose();
  await shows();
});
