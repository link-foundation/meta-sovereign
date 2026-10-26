// Real browser e2e for round video messages (R-Y150), as Telegram
// Desktop has them. Playback: a received round video is a circle (about
// 240 px) that plays muted and looped in place; a click plays it from
// the start with sound, a ring around it filling and the circle a little
// larger; a second click pauses; its length shows while it is not
// playing. Recording (Chromium only: its fake camera, launched with
// --use-fake-device-for-media-stream --use-fake-ui-for-media-stream):
// beside the microphone a switch changes it to a camera; a click records
// on, a live round preview with the time shows, Send uploads the clip and
// the server's real route and builder make a document with
// DocumentAttributeVideo { roundMessage: true, duration, w, h } for a
// fake client; Cancel sends nothing; a missing camera says so and falls
// back to voice. WebKit runs the playback part only (no fake camera). The
// clip played is recorded by a Chromium page here from a canvas. A fake
// chat in a memory store, a server on a free port, Telegram's answers
// faked in the page; nothing reaches a network or a running app. Not part
// of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:round-video

/* global MediaRecorder, Blob, btoa, getComputedStyle, navigator, DOMException, setInterval, clearInterval */

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { roundFileOf, roundOptions } from '../src/sources/telegram-round.js';

const skip = (msg) => {
  console.log(`[e2e-round-video] SKIP: ${msg}`);
  process.exit(0);
};
if (!process.env.RUN_BROWSER_E2E) {
  skip('RUN_BROWSER_E2E not set');
}
const engine = process.env.E2E_BROWSER || 'chromium';
let playwright;
try {
  playwright = await import('playwright');
} catch {
  skip('playwright not installed');
}
const browserType = playwright[engine];
const chromium = engine === 'chromium';

const assert = (cond, msg) => {
  if (!cond) {
    throw new Error(`assertion failed: ${msg}`);
  }
};

// A short WebM clip, recorded from a canvas by a Chromium page (there is
// no encoder here); played by both engines when they can.
const makeClip = async () => {
  const maker = await playwright.chromium.launch({ headless: true });
  try {
    const page = await maker.newPage();
    await page.goto('about:blank');
    const base64 = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 160;
      const context = canvas.getContext('2d');
      let n = 0;
      const timer = setInterval(() => {
        n += 1;
        context.fillStyle = `hsl(${(n * 12) % 360} 80% 50%)`;
        context.fillRect(0, 0, 160, 160);
      }, 33);
      const recorder = new MediaRecorder(canvas.captureStream(30), {
        mimeType: 'video/webm;codecs=vp8',
      });
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      const stopped = new Promise((resolve) => {
        recorder.onstop = resolve;
      });
      recorder.start(100);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      recorder.stop();
      await stopped;
      clearInterval(timer);
      const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
      let text = '';
      for (const b of bytes) {
        text += String.fromCharCode(b);
      }
      return btoa(text);
    });
    return Buffer.from(base64, 'base64');
  } finally {
    await maker.close();
  }
};
const CLIP = await makeClip();

const CHAT = '557';
const ROUND = `msg:telegram:${CHAT}:2`;
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - (5 - n) * 60_000).toISOString();
const person = {
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Fay',
  chatType: 'user',
  sender: CHAT,
  senderName: 'Fake Fay',
};
await store.put({
  ...person,
  id: `msg:telegram:${CHAT}:1`,
  body: 'look at this',
  timestamp: at(1),
  raw: { id: 1 },
});
await store.put({
  ...person,
  id: ROUND,
  body: '',
  timestamp: at(2),
  raw: {
    id: 2,
    media: {
      className: 'MessageMediaDocument',
      document: {
        id: '3003',
        mimeType: 'video/webm',
        size: CLIP.length,
        attributes: [
          {
            className: 'DocumentAttributeVideo',
            roundMessage: true,
            duration: 2.5,
            w: 160,
            h: 160,
          },
        ],
      },
    },
  },
});

// The account behind the server's real routes: it keeps the upload and
// builds what the real sender would hand GramJS, for a fake client.
class CustomFile {
  constructor(name, size, filePath) {
    Object.assign(this, { name, size, path: filePath });
  }
}
class DocumentAttributeVideo {
  constructor(args) {
    Object.assign(this, args);
  }
}
const uploads = [];
const sent = [];
const account = {
  status: async () => ({ connected: true, kind: 'user' }),
  stop: async () => {},
  receiveUpload: async (stream, { name }) => {
    const parts = [];
    for await (const chunk of stream) {
      parts.push(chunk);
    }
    uploads.push({ name, bytes: Buffer.concat(parts) });
    return {
      ok: true,
      token: String(uploads.length).padStart(32, '0'),
      name,
      size: uploads.at(-1).bytes.length,
    };
  },
  sendRound: async ({ chat, token, ...rest }) => {
    const upload = uploads[Number(token) - 1];
    const options = roundFileOf(
      { name: upload.name, size: upload.bytes.length, path: '/tmp/fake' },
      roundOptions(rest)
    )({
      Api: { DocumentAttributeVideo },
      client: { uploads: { CustomFile } },
    });
    sent.push({ chat, ...options });
    return { ok: true, chat, ids: [20 + sent.length] };
  },
};

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-round-video-'));
const handle = await startServer({
  localUi: true,
  port: 0,
  storeDir: dir,
  store,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: account,
  log: null,
});
const base = `http://127.0.0.1:${handle.port}`;
const browser = await browserType.launch({
  headless: true,
  ...(chromium
    ? {
        args: [
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
        ],
      }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1200, height: 800 },
  ...(chromium ? { permissions: ['camera', 'microphone'] } : {}),
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const fulfil = (route, body) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
await page.route('**/api/telegram/status', (route) =>
  fulfil(route, {
    connected: true,
    kind: 'user',
    account: { username: 'owner' },
    offline: false,
    needsLogin: false,
  })
);
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/media?*', (route) =>
  route.fulfill({ status: 404, body: '' })
);
await page.route('**/api/telegram/file?*', (route) =>
  route.fulfill({ status: 200, contentType: 'video/webm', body: CLIP })
);

const until = async (check, what, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) {
      return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`timed out: ${what}`);
};

const round = page.locator(`[data-message="${ROUND}"] .bubble-round`);
const videoState = () =>
  round.locator('video').evaluate((v) => ({
    paused: v.paused,
    muted: v.muted,
    loop: v.loop,
    time: v.currentTime,
    ready: v.readyState,
  }));

const playback = async () => {
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await round.waitFor({ timeout: 15_000 });
  const box = await round.boundingBox();
  assert(Math.abs(box.width - box.height) < 1, 'a square box');
  assert(box.width > 220 && box.width <= 241, `about 240 px: ${box.width}`);
  assert(
    (await round.evaluate((n) => getComputedStyle(n).borderRadius)) === '50%',
    'a circle'
  );
  assert(
    (await round.locator('.media-badge').textContent()) === '0:03',
    'its length shows while idle'
  );
  const decodes = await page.evaluate(
    () =>
      document
        .createElement('video')
        .canPlayType('video/webm; codecs="vp8"') !== ''
  );
  await round.locator('video').waitFor({ timeout: 10_000 });
  // Picture-in-picture (R-Y182): the button is there exactly where the
  // browser can do it (a headless one may not; it is not entered here).
  const canPip = await round
    .locator('video')
    .evaluate(
      (v) =>
        (document.pictureInPictureEnabled === true &&
          typeof v.requestPictureInPicture === 'function' &&
          v.disablePictureInPicture !== true) ||
        (typeof v.webkitSetPresentationMode === 'function' &&
          typeof v.webkitSupportsPresentationMode === 'function' &&
          v.webkitSupportsPresentationMode('picture-in-picture'))
    );
  await until(
    async () =>
      (await round.locator('[data-action="pip"]').count()) === (canPip ? 1 : 0),
    `the picture-in-picture button follows the browser (${canPip})`
  );
  if (decodes) {
    // Muted and looped, in place, once it is on screen.
    await until(async () => !(await videoState()).paused, 'plays in place');
    const idle = await videoState();
    assert(idle.muted && idle.loop, 'muted and looped');
  }
  // A click: sound, from the start, a ring, a larger circle.
  await round.click();
  assert((await round.getAttribute('data-round')) === 'playing', 'playing');
  assert(
    await round.evaluate((n) => n.classList.contains('playing')),
    'larger'
  );
  assert((await round.locator('.round-ring').count()) === 1, 'a ring');
  assert((await round.locator('.media-badge').count()) === 0, 'no length');
  if (decodes) {
    await until(async () => {
      const v = await videoState();
      return !v.paused && !v.muted && !v.loop;
    }, 'plays with sound');
    await until(async () => {
      const dash = await round
        .locator('.round-ring circle')
        .getAttribute('style');
      return (
        Number.parseFloat(/stroke-dasharray:\s*([\d.]+)/.exec(dash)[1]) > 0
      );
    }, 'the ring fills');
  }
  // A second click pauses; the length is back.
  await round.click();
  assert((await round.getAttribute('data-round')) === 'paused', 'paused');
  if (decodes) {
    await until(async () => (await videoState()).paused, 'the video pauses');
  }
  assert((await round.locator('.media-badge').count()) === 1, 'length back');
  return decodes;
};

const mic = page.locator('[data-action="voice"]');
const camera = page.locator('[data-action="round"]');
const toggle = page.locator('[data-action="round-switch"]');
const preview = page.locator('.round-record');

const recording = async () => {
  await mic.waitFor({ timeout: 10_000 });
  // The switch makes the microphone a camera, and back.
  await toggle.click();
  await camera.waitFor();
  assert((await mic.count()) === 0, 'the camera in the microphone place');
  await toggle.click();
  await mic.waitFor();
  await toggle.click();
  await camera.waitFor();

  // A click records on; the live round preview shows with the time.
  await camera.click();
  await preview.waitFor({ timeout: 10_000 });
  await preview.locator('.round-live canvas').waitFor();
  await page.waitForTimeout(1600);
  assert(
    /^0:0[1-3]$/.test(await preview.locator('.round-time').textContent()),
    'the time recorded'
  );
  const circle = await preview.locator('.round-record-circle').boundingBox();
  assert(Math.abs(circle.width - circle.height) < 1, 'a round preview');
  await page.locator('[data-action="round-send"]').click();
  await until(() => sent.length === 1, 'the clip sent');
  await preview.waitFor({ state: 'detached' });
  const [one] = sent;
  assert(one.chat === CHAT, 'to the chat');
  assert(
    /^round\.(mp4|webm)$/.test(uploads[0].name),
    `named as a round video: ${uploads[0].name}`
  );
  assert(uploads[0].bytes.length > 1000, 'the clip uploaded');
  const [video] = one.attributes;
  assert(video.roundMessage === true, 'roundMessage');
  assert(
    video.duration >= 1 && video.duration <= 4,
    `duration ${video.duration}`
  );
  assert(video.w === 384 && video.h === 384, 'a square');
  assert(
    one.mimeType ===
      (uploads[0].name.endsWith('.mp4') ? 'video/mp4' : 'video/webm'),
    'its type'
  );
  assert(one.caption === undefined, 'no caption');

  // Cancel (and Esc) send nothing.
  await camera.click();
  await preview.waitFor();
  await page.waitForTimeout(500);
  await page.locator('[data-action="round-cancel"]').click();
  await preview.waitFor({ state: 'detached' });
  await camera.click();
  await preview.waitFor();
  await page.keyboard.press('Escape');
  await preview.waitFor({ state: 'detached' });
  await page.waitForTimeout(300);
  assert(sent.length === 1 && uploads.length === 1, 'nothing more sent');

  // No camera: a message, and back to voice.
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('no camera', 'NotFoundError'));
  });
  await camera.click();
  await mic.waitFor({ timeout: 5000 });
  assert(
    (await page.locator('.voice-hint').textContent()) ===
      'No camera available. Back to voice messages',
    'the message'
  );
  assert((await camera.count()) === 0, 'voice mode again');
};

let failed = false;
try {
  await page.goto(`${base}/`);
  const decodes = await playback();
  if (chromium) {
    await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
    await recording();
  } else {
    console.log(
      '[e2e-round-video] recording skipped: no fake camera in this engine'
    );
  }
  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(
    `[e2e-round-video] OK (${engine}${decodes ? '' : ', clip not decoded'})`
  );
} catch (error) {
  failed = true;
  console.error(`[e2e-round-video] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-round-video-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
