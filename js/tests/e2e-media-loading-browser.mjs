// Delayed bytes must retain media geometry and a visible loader until decoded.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';
import { assertControlSpacing } from './helpers/e2e-controls.mjs';

const store = createMemoryStore();
const photo = (id) => ({
  id: `msg:telegram:55:${id}`,
  source: 'telegram',
  chat: '55',
  chatName: 'Media fixture',
  chatType: 'personal_chat',
  sender: '55',
  body: 'Photo',
  timestamp: new Date(1700000000000 + id * 1000).toISOString(),
  raw: {
    id,
    media: {
      className: 'MessageMediaPhoto',
      photo: {
        className: 'Photo',
        id: String(id),
        sizes: [
          { className: 'PhotoSize', type: 'm', w: 600, h: 400, size: 100 },
        ],
      },
    },
  },
});
await store.put(photo(1));
for (const [id, attribute] of [
  [2, { className: 'DocumentAttributeVideo', w: 160, h: 90, duration: 1 }],
  [3, { className: 'DocumentAttributeAudio', voice: true, duration: 1 }],
]) {
  const item = photo(id);
  item.raw.media = {
    className: 'MessageMediaDocument',
    document: {
      className: 'Document',
      id: String(id),
      mimeType: id === 2 ? 'video/mp4' : 'audio/wav',
      size: 16044,
      attributes: [attribute],
    },
  };
  await store.put(item);
}
const { page, base, until, finish } = await openChatApp('media-loading', {
  store,
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
  globalThis.localStorage.setItem('metaSovereignSkin', 't3');
});
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
let held = true;
let broken = false;
const waiting = [];
const release = () => waiting.splice(0).forEach((resume) => resume());
const wav = Buffer.alloc(16044);
wav.write('RIFF');
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(16000, 40);
let holdFile = true;
const files = [];
await page.route('**/api/telegram/file?**', async (route) => {
  if (holdFile) {
    await new Promise((resolve) => files.push(resolve));
  }
  return route.fulfill({ contentType: 'audio/wav', body: wav });
});
await page.route('**/api/telegram/media?**', async (route) => {
  if (held) {
    await new Promise((resolve) => waiting.push(resolve));
  }
  return broken
    ? route.fulfill({ status: 404, body: 'not available' })
    : route.fulfill({ contentType: 'image/png', body: PNG });
});
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, {
    chat: '55',
    kind: 'user',
    title: 'Media fixture',
    username: 'fixture_user',
    phone: null,
  })
);
await page.route('**/api/telegram/peer-settings*', (route) =>
  fulfil(route, { ok: true, bar: {} })
);
const image = () => page.locator('.bubble-photo');
const checkBox = async () => {
  const box = await image().boundingBox();
  assert(
    box.width > 150 && Math.abs(box.width / box.height - 1.5) < 0.02,
    'known media proportions are reserved before bytes arrive'
  );
  return box;
};
const assertSameBox = (a, b) =>
  assert(
    Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1,
    'decode never changes the media box'
  );

const playerSteps = async () => {
  const video = page.locator('.bubble-video');
  await video.scrollIntoViewIfNeeded();
  await video.locator('.media-play').click();
  await video.locator('video').waitFor();
  await video.locator('[data-media-loading="loading"]').waitFor();
  assert(
    await video.locator('video').evaluate((node) => node.readyState < 2),
    'a resolved file URL is not a decoded video'
  );
  holdFile = false;
  files.splice(0).forEach((resume) => resume());
  await video.locator('[data-media-loading]').waitFor({ state: 'detached' });
  const audio = page.locator('.bubble-audio');
  await audio.scrollIntoViewIfNeeded();
  const colors = await audio.locator('.audio-play').evaluate((node) => {
    const style = globalThis.getComputedStyle(node);
    return [style.backgroundColor, style.color];
  });
  assert(
    colors[0] !== colors[1] && colors[0] === 'rgb(44, 45, 48)',
    'dark audio controls retain readable white-on-dark contrast'
  );
  await audio.locator('.audio-play').click();
  await audio
    .locator('[data-media-loading="loading"]')
    .waitFor({ state: 'detached' });
};

await finish(async () => {
  await page.goto(`${base}/#chat=telegram:55`);
  await image().scrollIntoViewIfNeeded();
  await image().locator('[data-media-loading="loading"]').waitFor();
  const before = await checkBox();
  assert(
    (await image().getAttribute('aria-busy')) === 'true',
    'loading bytes are announced'
  );
  const img = image().locator('img');
  await img.waitFor({ state: 'attached' });
  assert(
    (await img.evaluate(
      (node) => globalThis.getComputedStyle(node).opacity
    )) === '0',
    'undecoded image never flashes a partial frame'
  );
  held = false;
  release();
  await image().locator('[data-media-loading]').waitFor({ state: 'detached' });
  assertSameBox(before, await checkBox());
  assert(
    await img.evaluate((node) => node.complete && node.naturalWidth > 0),
    'loader stops after a real image decode'
  );
  await image().click();
  await page.locator('.photo-viewer').waitFor();
  await page
    .locator('.photo-viewer [data-media-loading]')
    .waitFor({ state: 'detached' });
  await page.keyboard.press('Escape');
  await page.locator('[data-action="chat-about"]').click();
  await page.locator('.person-panel').waitFor();
  await until(
    async () =>
      (await page.locator('.person-open-telegram').getAttribute('href')) ===
      'tg://resolve?domain=fixture_user',
    'desktop button uses a native Telegram route'
  );
  assert(
    (await page.locator('.person-open-telegram').getAttribute('target')) ===
      null,
    'native opening does not create a blank browser tab'
  );
  await assertControlSpacing(page);
  const gaps = await page.locator('.person-panel-body').evaluate((node) => {
    const actions = [...node.querySelectorAll('.peer-actions button')].map(
      (button) => button.getBoundingClientRect()
    );
    return actions.slice(1).map((box, index) => ({
      gap: box.top - actions[index].bottom,
      left: Math.abs(box.left - actions[index].left),
      width: Math.abs(box.width - actions[index].width),
    }));
  });
  assert(
    gaps.every((item) => item.gap >= 7 && item.left < 1 && item.width < 1),
    'right-panel actions have aligned widths and consistent gaps'
  );
  if (process.env.E2E_SHOT) {
    await page.screenshot({
      path: process.env.E2E_SHOT.replace('.png', '-panel.png'),
    });
  }
  await page.locator('.person-panel-head button').click();
  broken = true;
  await page.reload();
  await image().locator('[data-media-loading="loading"]').waitFor();
  await until(
    () =>
      image()
        .locator('img')
        .evaluate((node) => node.complete && node.naturalWidth === 0),
    'interrupted media attempt'
  );
  assert(
    (await image().locator('[data-action="media-retry"]').count()) === 0,
    'media recovery requires no manual retry'
  );
  broken = false;
  await image().locator('[data-media-loading]').waitFor({ state: 'detached' });
  await playerSteps();
  await page.setViewportSize({ width: 390, height: 844 });
  await image().scrollIntoViewIfNeeded();
  await checkBox();
  const heading = await page.locator('.chat-header').boundingBox();
  const title = await page.locator('.chat-header-title').boundingBox();
  assert(
    heading.height < 130 && title.width > 120,
    'phone header reserves title space above the action row'
  );
  assert(
    (await page
      .locator('.chat-header-title > .meta')
      .evaluate((node) => globalThis.getComputedStyle(node).whiteSpace)) ===
      'nowrap',
    'subtitle never wraps into a narrow vertical column'
  );
  await assertControlSpacing(page);
  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }
});
