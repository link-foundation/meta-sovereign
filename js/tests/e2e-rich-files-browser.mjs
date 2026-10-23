// Real browser e2e for files, video and audio in rich messages (R-Y224):
// a bot's rich message has a file row, a video and an audio. The file row
// has a download that saves the fake bytes under the file's name; the video
// and audio elements get a src that answers byte ranges and load nothing
// before they are played. Telegram's answers faked in the page, a fake chat
// in a memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:rich-files

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-5';
const store = createMemoryStore();
const empty = { className: 'TextEmpty' };
const caption = { text: empty, credit: empty };
const file = (id, mimeType, fileName, size) => ({
  className: 'Document',
  id,
  mimeType,
  size,
  attributes: [{ className: 'DocumentAttributeFilename', fileName }],
});

await store.put({
  id: `msg:telegram:${GROUP}:1`,
  source: 'telegram',
  chat: GROUP,
  chatName: 'Fake Group',
  chatType: 'group',
  sender: '90',
  senderName: 'Helper Bot',
  body: 'Files',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: {
    id: 1,
    richMessage: {
      className: 'RichMessage',
      blocks: [
        { className: 'PageBlockDocument', documentId: '77', caption },
        { className: 'PageBlockVideo', videoId: '78', caption },
        { className: 'PageBlockAudio', audioId: '79', caption },
      ],
      photos: [],
      documents: [
        file('77', 'application/pdf', 'plan.pdf', 2048),
        file('78', 'video/mp4', 'clip.mp4', 10),
        file('79', 'audio/mpeg', 'song.mp3', 10),
      ],
    },
  },
});

const { base, page, until, finish } = await openChatApp('rich-files', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, { chat: GROUP, kind: 'group', title: 'Fake Group' })
);
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
await page.route('**/api/telegram/media*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
);
// The file route: bytes by range, saved under a name when asked.
const BYTES = Buffer.from('0123456789');
const asked = [];
await page.route('**/api/telegram/file*', (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const rich = url.searchParams.get('rich');
  asked.push({ rich, download: url.searchParams.get('download') });
  const doc = rich === 'document:77' ? 'application/pdf' : 'video/mp4';
  const headers = { 'accept-ranges': 'bytes' };
  if (url.searchParams.get('download') === '1') {
    headers['content-disposition'] = 'attachment; filename="plan.pdf"';
  }
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers().range ?? '');
  if (range) {
    const end = range[2] === '' ? BYTES.length - 1 : Number(range[2]);
    return route.fulfill({
      status: 206,
      contentType: doc,
      headers: {
        ...headers,
        'content-range': `bytes ${range[1]}-${end}/${BYTES.length}`,
      },
      body: BYTES.subarray(Number(range[1]), end + 1),
    });
  }
  return route.fulfill({
    status: 200,
    contentType: doc,
    headers,
    body: BYTES,
  });
});

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  const box = page.locator('.rich-message').first();
  await box.waitFor({ timeout: 15000 });

  // The file row downloads the fake bytes under the file's name.
  const link = box.locator('[data-block="file"] a.iv-file-download');
  await link.waitFor({ timeout: 10000 });
  assert((await link.getAttribute('download')) === 'plan.pdf', 'name');
  assert(
    (await link.getAttribute('href')).includes('rich=document%3A77'),
    'rich document address'
  );
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    link.click(),
  ]);
  assert(download.suggestedFilename() === 'plan.pdf', 'saved name');
  // The address a click saves is the one that answers the fake bytes as
  // an attachment (the engines differ in letting a test read the saved
  // file of a faked response).
  const body = await page.evaluate(
    async (href) => {
      const got = await fetch(href);
      return [got.headers.get('content-disposition'), await got.text()];
    },
    await link.getAttribute('href')
  );
  assert(body[0].startsWith('attachment'), 'attachment');
  assert(body[1] === BYTES.toString(), 'bytes');

  // The video and audio have players with a src, and ask for nothing
  // before they are played.
  const video = box.locator('video[data-player="video"]');
  const audio = box.locator('audio[data-player="audio"]');
  await video.waitFor({ timeout: 5000 });
  await audio.waitFor({ timeout: 5000 });
  assert((await video.getAttribute('preload')) === 'none', 'preload none');
  assert((await video.getAttribute('autoplay')) === null, 'no autoplay');
  assert(
    (await video.getAttribute('src')).includes('rich=document%3A78'),
    'video src'
  );
  assert(
    (await audio.getAttribute('src')).includes('rich=document%3A79'),
    'audio src'
  );
  assert(
    !asked.some((one) => one.rich === 'document:78' && !one.download),
    'nothing streamed before play'
  );
  // The src answers a byte range.
  const answer = await page.evaluate(
    async (src) => {
      const got = await fetch(src, { headers: { range: 'bytes=2-4' } });
      return [got.status, await got.text()];
    },
    await video.getAttribute('src')
  );
  assert(answer[0] === 206 && answer[1] === '234', `range: ${answer}`);
  await until(
    () => asked.some((one) => one.rich === 'document:78'),
    'video asked'
  );

  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }
});
