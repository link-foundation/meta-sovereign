// Imported archive media (R-Z15): WhatsApp zips whose media lands in
// media/, and the page's reading of stored attachments and reactions.
// Fakes only; no server, so it also runs on Bun and Deno.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createMemoryStore } from '../src/storage/index.js';
import { importWhatsAppFile } from '../src/sources/whatsapp-file.js';
import { archiveItem, mediaPathOf } from '../src/web/archive-media-model.js';
import {
  attachmentMedia,
  parseMessageParts,
} from '../src/web/message-parts.js';
import { assertMode } from './helpers/mode.js';
import { zipOf } from './helpers/zip-fixture.js';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

const CHAT = [
  '[25.10.2026, 14:32:11] Anna: Hallo',
  '[25.10.2026, 14:33:00] Anna: <attached: 00000012-PHOTO-2026-10-25-14-33-00.jpg>',
  '[25.10.2026, 14:34:00] Anna: <attached: gone.mp4>',
  '[25.10.2026, 14:35:00] Anna: <Media omitted>',
].join('\n');
const NAME = 'WhatsApp Chat - Anna.zip';
const mine = (store) => store.query((l) => l.id?.startsWith('msg:whatsapp:'));

describe('WhatsApp zip with media', () => {
  it('copies the named files into media/whatsapp (0600) and links them', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-wa-media-'));
    try {
      const store = createMemoryStore();
      const jpeg = Buffer.from('jpegbytes');
      const zip = zipOf([
        ['_chat.txt', CHAT, 8],
        ['00000012-PHOTO-2026-10-25-14-33-00.jpg', jpeg],
        ['unrelated.bin', 'zzz'],
      ]);
      const mediaDir = path.join(dir, 'media');
      const report = await importWhatsAppFile(store, NAME, zip, { mediaDir });
      assert.equal(report.imported, 4);
      assert.equal(report.media.saved, 1);
      assert.equal(report.media.missing, 1);
      const links = await mine(store);
      const photo = links.find((l) => l.attachments?.[0]?.kind === 'photo');
      const copy = photo.attachments[0];
      assert.equal(copy.sha256, sha(jpeg));
      assert.equal(copy.path, `media/whatsapp/${sha(jpeg)}.jpg`);
      assert.equal(copy.size, jpeg.length);
      const file = path.join(mediaDir, 'whatsapp', `${sha(jpeg)}.jpg`);
      assert.deepEqual(await readFile(file), jpeg);
      await assertMode(file, 0o600);
      await assertMode(path.join(mediaDir, 'whatsapp'), 0o700);
      // Named but absent from the zip, and "omitted": no path, still listed.
      const gone = links.find((l) => l.attachments?.[0]?.name === 'gone.mp4');
      assert.equal(gone.attachments[0].path, undefined);
      assert.equal(
        links.some((l) => l.attachments?.[0]?.omitted),
        true
      );
      // A second import writes no new file and stores the same messages.
      await importWhatsAppFile(store, NAME, zip, { mediaDir });
      assert.equal((await mine(store)).length, 4);
      assert.equal((await stat(file)).size, jpeg.length);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps no bytes without a media folder, and a .txt is unchanged', async () => {
    const zip = zipOf([
      ['_chat.txt', CHAT],
      ['00000012-PHOTO-2026-10-25-14-33-00.jpg', 'x'],
    ]);
    const report = await importWhatsAppFile(createMemoryStore(), NAME, zip);
    assert.equal(report.media.saved, 0);
    const txt = await importWhatsAppFile(
      createMemoryStore(),
      'a.txt',
      Buffer.from(CHAT)
    );
    assert.equal(txt.imported, 4);
    assert.equal(txt.media, undefined);
  });
});

describe('the page reads stored attachments and reactions', () => {
  const hash = 'b'.repeat(64);

  it('maps a stored path to the media route, nothing else', () => {
    assert.equal(
      mediaPathOf({ path: `media/facebook/${hash}.jpg` }),
      `/api/media/facebook/${hash}.jpg`
    );
    for (const bad of [
      '../media/x/a.jpg',
      `media/x/${hash}.jpg/../..`,
      'media/x/short.jpg',
      undefined,
    ]) {
      assert.equal(mediaPathOf({ path: bad }), null, String(bad));
    }
  });

  it('reads old WhatsApp attachments (type, no kind) and new ones alike', () => {
    assert.equal(archiveItem({ type: 'image', name: 'a.jpg' }).kind, 'photo');
    assert.equal(archiveItem({ kind: 'video', type: 'video' }).kind, 'video');
    assert.equal(archiveItem({ type: 'media', omitted: true }).omitted, true);
  });

  it('archive networks draw all attachments together; others keep their form', () => {
    const list = [
      { kind: 'photo', name: 'a.jpg', path: `media/facebook/${hash}.jpg` },
      { kind: 'file', name: 'b.pdf' },
    ];
    const media = attachmentMedia(list, 'facebook');
    assert.equal(media.kind, 'archive');
    assert.equal(media.items.length, 2);
    assert.equal(media.items[0].path, `/api/media/facebook/${hash}.jpg`);
    assert.equal(media.items[1].path, null);
    assert.equal(attachmentMedia([list[1]], 'discord').kind, 'document');
    const parts = parseMessageParts({
      source: 'whatsapp',
      body: 'x',
      attachments: [{ type: 'image', name: 'a.jpg', file: 'a.jpg' }],
      reactions: [{ emoji: '👍', count: 2, by: ['Anna', 'Bob'] }],
    });
    assert.equal(parts.media.kind, 'archive');
    assert.deepEqual(parts.reactions, [
      { emoticon: '👍', count: 2, by: ['Anna', 'Bob'] },
    ]);
  });
});
