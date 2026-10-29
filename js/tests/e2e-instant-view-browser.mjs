// Real browser e2e for Instant View (R-Y205), as Telegram Desktop offers
// it: a message whose link preview has a cached page shows an INSTANT
// VIEW button; it opens a full-height reader with the page's title,
// paragraph, a table, a collapsed details block, an anchor link that
// scrolls inside the reader, related-article cards and a picture served
// by the instant-view-media route; "Open in browser" is a link opening a
// new tab with rel=noopener; a t.me/iv link in a message opens the reader
// too; a page Telegram has not cached says so, and an error shows as
// text. Telegram's answers faked in the page, a fake chat in a memory
// store, a server on a free port, a headless browser; nothing reaches a
// network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:instant-view

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '7';
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - 60_000 * (100 - n)).toISOString();
const put = (id, body, media) =>
  store.put({
    id: `msg:telegram:${CHAT}:${id}`,
    source: 'telegram',
    chat: CHAT,
    chatName: 'Fake Reader',
    chatType: 'user',
    sender: CHAT,
    senderName: 'Fake Reader',
    body,
    timestamp: at(id),
    raw: { id, ...(media ? { media } : {}) },
  });
await put(1, 'read this https://a.test/story', {
  className: 'MessageMediaWebPage',
  webpage: {
    className: 'WebPage',
    url: 'https://a.test/story',
    displayUrl: 'a.test/story',
    siteName: 'Fake Site',
    title: 'A Fake Story',
    description: 'Short words',
    cachedPage: { className: 'Page' },
  },
});
await put(
  2,
  'wrapped https://t.me/iv?url=https%3A%2F%2Fa.test%2Fwrapped&rhash=1'
);
await put(3, 'nothing https://t.me/iv?url=https%3A%2F%2Fa.test%2Fnone&rhash=1');
await put(4, 'broken https://t.me/iv?url=https%3A%2F%2Fa.test%2Fgone&rhash=1');

const { base, page, until, finish } = await openChatApp('instant-view', {
  store,
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, { chat: CHAT, kind: 'user', title: 'Fake Reader' })
);

const t = (s) => [{ t: 'text', s }];
const filler = Array.from({ length: 30 }, () => ({
  k: 'p',
  c: t('A long paragraph of the story, so the reader has to scroll.'),
}));
const tree = {
  url: 'https://a.test/story',
  rtl: false,
  blocks: [
    { k: 'title', c: t('A Fake Story') },
    {
      k: 'p',
      c: [
        { t: 'text', s: 'Jump to the ' },
        { t: 'a', anchor: 'end', c: t('end') },
        { t: 'text', s: ' or visit ' },
        { t: 'a', href: 'https://b.test/out', c: t('outside') },
        { t: 'text', s: '.' },
      ],
    },
    { k: 'photo', id: '5', caption: { c: t('A picture'), credit: [] } },
    {
      k: 'table',
      bordered: true,
      striped: false,
      title: t('Scores'),
      rows: [
        [
          { c: t('Name'), header: true },
          { c: t('Score'), header: true },
        ],
        [{ c: t('Ann') }, { c: t('10') }],
      ],
    },
    {
      k: 'details',
      open: false,
      title: t('Hidden part'),
      blocks: [{ k: 'p', c: t('Secret words') }],
    },
    ...filler,
    { k: 'anchor', name: 'end' },
    { k: 'header', c: t('The end') },
    {
      k: 'related',
      title: t('Related'),
      articles: [
        {
          href: 'https://r.test/1',
          title: 'Related one',
          description: 'More',
          author: '',
          photo: '5',
        },
      ],
    },
  ],
};
const asked = [];
await page.route('**/api/telegram/instant-view', (route) => {
  const { url } = route.request().postDataJSON();
  asked.push(url);
  if (url.endsWith('/gone')) {
    return fulfil(route, { ok: false, error: 'failed', code: 'not-found' });
  }
  if (url.endsWith('/none')) {
    return fulfil(route, { ok: true, available: false });
  }
  return fulfil(route, {
    ok: true,
    available: true,
    siteName: 'Fake Site',
    title: 'A Fake Story',
    page: tree,
  });
});
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const mediaAsked = [];
await page.route('**/api/telegram/instant-view-media*', (route) => {
  mediaAsked.push(route.request().url());
  return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
});

const reader = page.locator('[data-dialog="instant-view"]');

const steps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();

  // The preview's button opens the reader.
  const button = page.locator('[data-action="instant-view"]');
  await button.waitFor({ timeout: 15000 });
  assert((await button.innerText()).trim() === 'INSTANT VIEW', 'button text');
  await button.click();
  await reader.waitFor({ timeout: 5000 });
  await reader.locator('h1').waitFor({ timeout: 5000 });
  assert((await reader.locator('h1').innerText()) === 'A Fake Story', 'title');
  assert(asked[0] === 'https://a.test/story', `asked ${asked[0]}`);
  const box = await reader.boundingBox();
  assert(box.height >= 700, `full height (${box.height})`);

  // A table, a collapsed details block, a related card, a picture.
  assert((await reader.locator('table th').count()) === 2, 'table headers');
  const details = reader.locator('details');
  assert(!(await details.evaluate((d) => d.open)), 'details collapsed');
  await details.locator('summary').click();
  assert(await details.evaluate((d) => d.open), 'details open');
  assert(
    (await reader.locator('.iv-article[href="https://r.test/1"]').count()) ===
      1,
    'related card'
  );
  await until(
    () =>
      reader
        .locator('figure img')
        .evaluate((i) => i.complete && i.naturalWidth > 0),
    'the picture loads'
  );
  assert(
    mediaAsked.some((u) => u.includes('kind=photo&id=5')),
    'photo asked'
  );

  // The anchor link scrolls inside the reader; the outside link is safe.
  const scroll = reader.locator('.iv-scroll');
  assert((await scroll.evaluate((s) => s.scrollTop)) === 0, 'starts on top');
  await reader.locator('a.iv-link', { hasText: 'end' }).click();
  await until(
    async () => (await scroll.evaluate((s) => s.scrollTop)) > 100,
    'the anchor scrolled'
  );
  const outside = reader.locator('a.iv-link', { hasText: 'outside' });
  assert((await outside.getAttribute('target')) === '_blank', 'new tab');
  assert((await outside.getAttribute('rel')).includes('noopener'), 'noopener');
  const open = reader.locator('[data-action="open-browser"]');
  assert(
    (await open.getAttribute('href')) === 'https://a.test/story',
    'open in browser'
  );
  assert(
    (await open.getAttribute('rel')).includes('noopener'),
    'open noopener'
  );

  // Back closes it.
  await reader.locator('[data-action="back"]').click();
  await reader.waitFor({ state: 'detached', timeout: 5000 });

  // A t.me/iv link opens it for the page it wraps.
  await page.locator('a.msg-link', { hasText: 'wrapped' }).first().click();
  await reader.locator('h1').waitFor({ timeout: 5000 });
  assert(
    asked.some((url) => url === 'https://a.test/wrapped'),
    'wrapped url asked'
  );
  await page.keyboard.press('Escape');
  await reader.waitFor({ state: 'detached', timeout: 5000 });

  // Not cached: says so, with Open in browser.
  await page.locator('a.msg-link', { hasText: 'none' }).first().click();
  await reader
    .getByText('Instant View is not available')
    .waitFor({ timeout: 5000 });
  assert(
    (await reader
      .locator('.iv-notice [data-action="open-browser"]')
      .count()) === 1,
    'open in browser on the notice'
  );
  await reader.locator('[data-action="back"]').click();
  await reader.waitFor({ state: 'detached', timeout: 5000 });

  // An error code is text.
  await page.locator('a.msg-link', { hasText: 'gone' }).first().click();
  await reader.getByText('This page was not found.').waitFor({ timeout: 5000 });
  await reader.locator('[data-action="back"]').click();
  await reader.waitFor({ state: 'detached', timeout: 5000 });
};

await finish(steps);
