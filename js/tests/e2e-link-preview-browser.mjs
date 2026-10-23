// Real browser e2e for the link preview of the message box (R-Y145), as
// Telegram Desktop shows it: a link in the text brings a bar above the box
// (site, title, description, the picture through the app's server); "Loading
// preview…" while Telegram is still fetching, then the preview; × sends the
// message with noWebpage; the options put the preview above the text and
// choose larger media; the preview kept sends no noWebpage. Telegram's
// answers faked in the page, fake chats in a memory store, a fake sender
// that records, a server on a free port, a headless browser; nothing reaches
// a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:link-preview

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '7';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${CHAT}:1`,
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Friend',
  chatType: 'user',
  sender: CHAT,
  senderName: 'Fake Friend',
  body: 'hello there',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const sent = [];
const { base, page, until, finish } = await openChatApp('link-preview', {
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
  fulfil(route, { chat: CHAT, kind: 'user', title: 'Fake Friend' })
);
// 1x1 picture, served as the app's server would serve Telegram's.
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);
let photoAsked = 0;
await page.route('**/api/telegram/link-preview-photo*', (route) => {
  photoAsked += 1;
  return route.fulfill({ status: 200, contentType: 'image/gif', body: PIXEL });
});
const asked = [];
let pendingFirst = true;
await page.route('**/api/telegram/link-preview', (route) => {
  const body = route.request().postDataJSON();
  asked.push(body);
  if (body.url.includes('nothing')) {
    return fulfil(route, { ok: true, state: 'empty' });
  }
  if (body.url.includes('slow') && pendingFirst) {
    pendingFirst = false;
    return fulfil(route, { ok: true, state: 'pending' });
  }
  return fulfil(route, {
    ok: true,
    state: 'ready',
    preview: {
      url: body.url,
      displayUrl: body.url,
      siteName: 'Example Site',
      title: 'An example title',
      description: 'What the page says about itself',
      photo: '55',
      large: false,
    },
  });
});

const box = page.locator('.chat-composer textarea');
const bar = page.locator('.composer-link-preview');
const textOf = (draft) => draft.text ?? draft.body;

const steps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await box.waitFor({ timeout: 15000 });

  // No link, no bar and no request.
  await box.fill('just words');
  await page.waitForTimeout(900);
  assert((await bar.count()) === 0 && asked.length === 0, 'no link, no bar');

  // A link: the bar with the site, the title, the description, the picture.
  await box.fill('look https://example.com/page now');
  await bar.waitFor({ timeout: 5000 });
  const shown = await bar.textContent();
  assert(
    ['Example Site', 'An example title', 'What the page says'].every((x) =>
      shown.includes(x)
    ),
    `bar: ${shown}`
  );
  assert(asked.length === 1, `one request after the pause: ${asked.length}`);
  assert(
    asked[0].url === 'https://example.com/page' &&
      asked[0].text === 'look https://example.com/page now',
    `asked: ${JSON.stringify(asked[0])}`
  );
  await until(() => photoAsked > 0, 'the picture through the server');
  const src = await bar.locator('img').getAttribute('src');
  assert(src.includes('/api/telegram/link-preview-photo?id=55'), `img: ${src}`);

  // Kept: the message goes out without a "no preview" flag.
  await box.press('Enter');
  await until(() => sent.length === 1, 'first send');
  assert(
    !('noWebpage' in sent[0]) && !('invertMedia' in sent[0]),
    `kept preview: ${JSON.stringify(sent[0])}`
  );
  await until(async () => (await bar.count()) === 0, 'bar gone after send');

  // × : the preview off, the send carries noWebpage.
  await box.fill('see https://example.com/two please');
  await bar.waitFor({ timeout: 5000 });
  await page.locator('[data-action="link-preview-close"]').click();
  await until(async () => (await bar.count()) === 0, 'closed by ×');
  await box.press('Enter');
  await until(() => sent.length === 2, 'second send');
  assert(
    sent[1].noWebpage === true && textOf(sent[1]).includes('/two'),
    `closed: ${JSON.stringify(sent[1])}`
  );

  // The options: above the text, larger media.
  await box.fill('https://example.com/three');
  await bar.waitFor({ timeout: 5000 });
  await page.locator('[data-action="link-preview-options"]').click();
  await page.locator('[data-action="link-preview-invert"]').click();
  await page.locator('[data-action="link-preview-size"]').click();
  await box.press('Enter');
  await until(() => sent.length === 3, 'third send');
  assert(
    sent[2].invertMedia === true &&
      sent[2].previewSize === 'large' &&
      sent[2].previewUrl === 'https://example.com/three' &&
      !('noWebpage' in sent[2]),
    `options: ${JSON.stringify(sent[2])}`
  );

  // A pending page: "Loading preview…", then the preview.
  await box.fill('https://slow.example.com');
  await bar.waitFor({ timeout: 5000 });
  assert((await bar.textContent()).includes('Loading preview'), 'loading');
  await until(
    async () => (await bar.textContent()).includes('An example title'),
    'preview after pending'
  );
  assert(asked.at(-1).url === 'https://slow.example.com', 'asked again');
  await box.fill('');
  await until(async () => (await bar.count()) === 0, 'bar gone with the link');

  // No preview from Telegram: no bar.
  const before = asked.length;
  await box.fill('https://nothing.example.com');
  await until(() => asked.length === before + 1, 'asked');
  await page.waitForTimeout(300);
  assert((await bar.count()) === 0, 'empty: no bar');
  await box.press('Enter');
  await until(() => sent.length === 4, 'fourth send');
  assert(!('noWebpage' in sent[3]), 'empty page sends plainly');
};

await finish(steps);
