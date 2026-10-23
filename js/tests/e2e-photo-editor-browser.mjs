// Real browser e2e for the photo editor of the send box (R-Y187): a
// generated 400×200 picture is attached; the editor turns it left, crops
// it square, draws on it and applies (Enter); the preview shows the
// edited picture; the uploaded bytes decode to 200×200 with the stroke's
// colour in them; editing again keeps the edits and Esc closes only the
// editor. Fake chats in a memory store, uploads to the server's real
// route (a fake account behind it), a free port, a headless browser.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:photo-editor

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, browserOf } from './helpers/e2e-chat.mjs';

const { engine, browserType } = await browserOf('photo-editor');

const CHAT = '555';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${CHAT}:1`,
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Dave',
  chatType: 'user',
  sender: CHAT,
  senderName: 'Fake Dave',
  body: 'send me the picture',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const uploads = [];
const account = {
  status: async () => ({ connected: true, kind: 'user' }),
  stop: async () => {},
  receiveUpload: async (stream, { name }) => {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    uploads.push({ name, bytes: Buffer.concat(chunks) });
    return {
      ok: true,
      token: String(uploads.length).padStart(32, '0'),
      name,
      size: uploads.at(-1).bytes.length,
    };
  },
};

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-photo-editor-'));
const handle = await startServer({
  port: 0,
  storeDir: dir,
  store,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: account,
  log: null,
});
const base = `http://127.0.0.1:${handle.port}`;
const browser = await browserType.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.route('**/api/telegram/status', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      connected: true,
      kind: 'user',
      account: { username: 'owner' },
      offline: false,
      needsLogin: false,
    }),
  })
);
await page.route('**/api/telegram/history', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ written: 0, cached: 0, complete: true }),
  })
);
const sends = [];
await page.route('**/api/telegram/send-files', (route) => {
  sends.push(JSON.parse(route.request().postData() ?? '{}'));
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, chat: CHAT, ids: [2] }),
  });
});
const until = async (check, what, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) {
      return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`timed out: ${what}`);
};

// A 400×200 picture: blue left half, green right half.
const made = await page.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = 400;
  c.height = 200;
  const g = c.getContext('2d');
  g.fillStyle = '#0000ff';
  g.fillRect(0, 0, 200, 200);
  g.fillStyle = '#00ff00';
  g.fillRect(200, 0, 200, 200);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  bytes.forEach((b) => {
    s += String.fromCharCode(b);
  });
  return globalThis.btoa(s);
});
const PNG = Buffer.from(made, 'base64');

// Size and the count of reddish pixels of picture bytes, decoded in the page.
const decode = (buffer) =>
  page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(globalThis.atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await globalThis.createImageBitmap(
      new globalThis.Blob([bytes])
    );
    const c = document.createElement('canvas');
    c.width = bitmap.width;
    c.height = bitmap.height;
    const g = c.getContext('2d');
    g.drawImage(bitmap, 0, 0);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    let red = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 200 && data[i + 1] < 120 && data[i + 2] < 120) {
        red += 1;
      }
    }
    return { w: bitmap.width, h: bitmap.height, red };
  }, buffer.toString('base64'));

let failed = false;
try {
  await page.goto(`${base}/`);
  await page.click(`[data-chat="telegram:${CHAT}"]`);
  await page.waitForSelector('[data-action="attach"]');
  await page.click('[data-action="attach"]');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('[data-action="attach-file"]'),
  ]);
  await chooser.setFiles([
    { name: 'wide.png', mimeType: 'image/png', buffer: PNG },
  ]);
  await page.waitForSelector('.attach-dialog [data-action="attach-edit"]');

  // Open the editor; turn left: 400×200 becomes 200×400.
  await page.click('[data-action="attach-edit"]');
  await page.waitForSelector('.photo-editor canvas[data-width="400"]');
  await page.click('[data-action="photo-rotate"]');
  await page.waitForSelector('.photo-editor canvas[data-width="200"]');
  const turned = await page.locator('.photo-editor-box').boundingBox();
  assert(
    Math.abs(turned.height / turned.width - 2) < 0.05,
    `turned: ${JSON.stringify(turned)}`
  );
  console.log('[e2e-photo-editor] rotate left: portrait now');

  // Crop square from the aspect list: the crop box is square.
  await page.selectOption('[data-field="ratio"]', 'square');
  const crop = await page.locator('.photo-editor-crop').boundingBox();
  assert(
    Math.abs(crop.width - crop.height) < 2 && crop.width > 100,
    `crop: ${JSON.stringify(crop)}`
  );
  console.log('[e2e-photo-editor] crop: square from the ratio list');

  // Draw a red stroke with the brush across the cropped part.
  await page.click('[data-action="photo-tool-brush"]');
  await page.click('.photo-editor-color[data-color="#ff3b30"]');
  await page.click('.photo-editor-size[data-size="3"]');
  const box = await page.locator('.photo-editor-box').boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, {
    steps: 8,
  });
  await page.mouse.up();
  assert(
    !(await page.isDisabled('[data-action="photo-undo"]')),
    'undo is ready after a stroke'
  );
  console.log('[e2e-photo-editor] brush: a stroke drawn, undo ready');

  // Enter applies; the preview shows the edited picture.
  await page.click('[data-action="photo-tool-brush"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.photo-editor', { state: 'detached' });
  assert(
    (await page.$('.attach-dialog img.attach-pic')) !== null,
    'the preview stays'
  );
  console.log('[e2e-photo-editor] Enter applies the edit');

  // Editing again keeps the edits (undo is ready); Esc closes only the editor.
  await page.click('[data-action="attach-edit"]');
  await page.waitForSelector('.photo-editor canvas[data-width="200"]');
  assert(
    !(await page.isDisabled('[data-action="photo-undo"]')),
    'the earlier edits are kept'
  );
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.photo-editor', { state: 'detached' });
  assert((await page.$('.attach-dialog')) !== null, 'the send box stays');
  console.log('[e2e-photo-editor] edit again keeps edits; Esc cancels');

  // Send: the uploaded bytes are the edited picture, same name.
  await page.click('[data-action="attach-send"]');
  await until(() => sends.length === 1, 'sent');
  assert(uploads.length === 1 && uploads[0].name === 'wide.png', 'name kept');
  const shape = await decode(uploads[0].bytes);
  assert(shape.w === 200 && shape.h === 200, `size: ${JSON.stringify(shape)}`);
  assert(shape.red > 300, `the stroke is in the picture: ${shape.red}`);
  console.log(
    `[e2e-photo-editor] uploaded ${shape.w}×${shape.h}, stroke pixels ${shape.red}`
  );

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-photo-editor] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-photo-editor] FAIL (${engine}): ${error.message}`);
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
