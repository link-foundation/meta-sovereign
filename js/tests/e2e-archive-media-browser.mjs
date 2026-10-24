// Real browser e2e for imported archive media and reactions (R-Z15): a fake
// Facebook chat in a memory store holds a message with a stored picture and
// a reaction (with who reacted), a message with a stored PDF, and a message
// whose file was never imported. The page must draw the picture from
// /api/media (it loads), a file chip with name and size, a "media not
// imported" chip instead of a broken image, and the reaction with its
// actors in the title. Then a Facebook .zip picked in the Connections import
// box is streamed to /api/archive/upload and imported as Facebook (R-Z23).
// Nothing reaches a network. Not part of `npm test`:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:archive-media
//   RUN_BROWSER_E2E=1 npm run test:e2e:archive-media:webkit

import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { buildMessageLink } from '../src/sources/link.js';
import { stampSourceLink } from '../src/sources/index.js';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';
import { zipOf } from './helpers/zip-fixture.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const PDF = Buffer.from('%PDF-1.4 fake pdf bytes');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-archive-media-'));
await mkdir(path.join(dir, 'media', 'facebook'), { recursive: true });
const keep = async (bytes, ext) => {
  const hash = sha(bytes);
  await writeFile(path.join(dir, 'media', 'facebook', `${hash}${ext}`), bytes);
  return hash;
};
const pngHash = await keep(PNG, '.png');
const pdfHash = await keep(PDF, '.pdf');

const message = (n, body, extra) =>
  stampSourceLink(
    buildMessageLink({
      source: 'facebook',
      externalId: `m${n}`,
      sender: 'anna',
      senderName: 'Anna',
      chat: 'thread1',
      chatName: 'Anna',
      chatType: 'private',
      body,
      timestamp: `2026-01-05T10:0${n}:00.000Z`,
      ...extra,
    }),
    'facebook'
  );

const store = createMemoryStore();
await store.put(
  message(1, 'look at this', {
    attachments: [
      {
        kind: 'photo',
        name: 'cat.png',
        path: `media/facebook/${pngHash}.png`,
        sha256: pngHash,
        size: PNG.length,
      },
    ],
    reactions: [{ emoji: '👍', count: 2, by: ['Anna', 'Bob'] }],
  })
);
await store.put(
  message(2, 'the plan', {
    attachments: [
      {
        kind: 'file',
        name: 'plan.pdf',
        path: `media/facebook/${pdfHash}.pdf`,
        sha256: pdfHash,
        size: 3 * 1024,
      },
    ],
  })
);
await store.put(
  message(3, 'and this one', {
    attachments: [{ kind: 'photo', name: 'lost.jpg' }],
  })
);

const { base, page, until, finish } = await openChatApp('archive-media', {
  store,
  serverOptions: { storeDir: dir },
});

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator('[data-chat="facebook:thread1"]').click();

  // The stored picture loads from the media route.
  const image = page.locator('img[data-archive-image]');
  await image.waitFor({ timeout: 15000 });
  await until(
    () => image.evaluate((img) => img.complete && img.naturalWidth === 1),
    'archive picture loaded'
  );
  const src = await image.getAttribute('src');
  assert(
    src.includes(`/api/media/facebook/${pngHash}.png`),
    `picture comes from the media route: ${src}`
  );

  // The reaction: emoji, count, and who in the title.
  const reaction = page.locator('.bubble-reaction', { hasText: '👍' });
  await reaction.waitFor({ timeout: 10000 });
  assert((await reaction.innerText()).includes('2'), 'reaction count');
  assert(
    (await reaction.getAttribute('title')) === 'Anna, Bob',
    'reaction actors in the title'
  );

  // The PDF is a chip with its name and size, served as a download.
  const chip = page.locator('a[data-archive-file]');
  await chip.waitFor({ timeout: 10000 });
  const label = await chip.innerText();
  assert(
    label.includes('plan.pdf') && label.includes('3.0 KB'),
    `file chip: ${label}`
  );
  const served = await page.evaluate(
    async (href) => {
      const got = await fetch(href);
      return [got.headers.get('content-disposition'), await got.text()];
    },
    await chip.getAttribute('href')
  );
  assert(served[0].startsWith('attachment'), `disposition: ${served[0]}`);
  assert(served[1].startsWith('%PDF'), 'file bytes');

  // The file that was never imported is a chip, not a broken picture.
  const missing = page.locator('[data-archive-missing]');
  await missing.waitFor({ timeout: 10000 });
  assert((await missing.innerText()).includes('lost.jpg'), 'missing chip name');
  assert(
    (await page.locator('img[data-archive-image]').count()) === 1,
    'one picture'
  );

  // R-Z23: a zip picked in the import box goes to the server's importer.
  const thread = 'your_facebook_activity/messages/inbox/bob_Q1';
  const zip = zipOf([
    [
      `${thread}/message_1.json`,
      JSON.stringify({
        participants: [{ name: 'Bob' }, { name: 'Me' }],
        title: 'Bob',
        thread_path: 'inbox/bob_Q1',
        messages: [
          {
            sender_name: 'Bob',
            timestamp_ms: 1700000000000,
            content: 'zip hi',
          },
          { sender_name: 'Me', timestamp_ms: 1700000001000, content: 'zip yo' },
        ],
      }),
      8,
    ],
  ]);
  await page.click('button[data-view="connections"]');
  const open =
    'article[data-provider-id="facebook"] button[data-action="open-connection-detail"]';
  await page.waitForSelector(open, { timeout: 10000 });
  await page.click(open);
  const detail = page.locator('#conn-facebook');
  await detail.waitFor({ timeout: 10000 });
  const manual = detail.locator('[data-action="connection-mode-manual"]');
  if ((await manual.count()) > 0) {
    await manual.click();
  }
  const picker = detail.locator('input[data-action="archive-file"]');
  await picker.waitFor({ state: 'attached', timeout: 10000 });
  await picker.setInputFiles({
    name: 'facebook-export.zip',
    mimeType: 'application/zip',
    buffer: zip,
  });
  await until(
    () =>
      detail.evaluate((node) =>
        /facebook-export\.zip: 2 /.test(node.textContent)
      ),
    'zip imported through the upload route'
  );
  const stored = await store.query((l) => /^zip (hi|yo)$/.test(l.body ?? ''));
  assert(stored.length === 2, `zip messages stored: ${stored.length}`);
  assert(
    stored.every((l) => l.source === 'facebook'),
    'zip read as Facebook'
  );
});

await rm(dir, { recursive: true, force: true });
