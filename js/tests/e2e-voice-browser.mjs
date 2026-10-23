// Real browser e2e for voice messages (R-Y108): with nothing typed, a
// microphone takes the Send button's place (typed text brings Send
// back); held, the message box gives way to the red dot, the time and
// "Release outside this field to cancel"; let go over the box, the
// recording goes up as Ogg Opus and is sent as a voice with its length
// and a 100-value waveform; let go outside it, nothing is sent; a short
// press says to hold it; dragged up, it locks — the hand goes and it
// records on, Cancel (or Esc) drops it, Send sends it. In Chromium the
// browser's own MediaRecorder records a tone made in the page (its WebM
// remuxed in the page); in WebKit the microphone and recorder are fakes
// giving a WebM made here. A fake chat in a memory store, the upload to
// the server's real route (a fake account behind it), Telegram's answers
// faked in the page, a server on a free port, a headless browser;
// nothing reaches a network or a running app. Not part of `npm test`;
// run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:voice

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { oggPages, voiceDuration } from '../src/web/voice-ogg.js';

const skip = (msg) => {
  console.log(`[e2e-voice] SKIP: ${msg}`);
  process.exit(0);
};
if (!process.env.RUN_BROWSER_E2E) {
  skip('RUN_BROWSER_E2E not set');
}
const engine = process.env.E2E_BROWSER || 'chromium';
let browserType;
try {
  browserType = (await import('playwright'))[engine];
} catch {
  skip('playwright not installed');
}

const assert = (cond, msg) => {
  if (!cond) {
    throw new Error(`assertion failed: ${msg}`);
  }
};

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
  body: 'say it out loud',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

// ---- a WebM with an Opus track, as MediaRecorder writes one: 2 s of
// 20 ms packets, in a Segment and Cluster of unknown size.
const bytesOf = (...parts) => Buffer.concat(parts.map((p) => Buffer.from(p)));
const idOf = (id) => {
  const out = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) {
    out.unshift(v % 256);
  }
  return out;
};
const sizeOf = (n) => (n < 127 ? [0x80 | n] : [0x40 | (n >> 8), n & 255]);
const element = (id, payload) =>
  bytesOf(idOf(id), sizeOf(payload.length), payload);
const unknown = (id, payload) =>
  bytesOf(idOf(id), [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], payload);
const head = Buffer.alloc(19);
head.write('OpusHead');
head[8] = 1;
head[9] = 1;
head.writeUInt16LE(312, 10);
head.writeUInt32LE(48000, 12);
const packet = (i) => {
  const p = Buffer.alloc(30, i & 255);
  p[0] = 0xf8; // 20 ms, one frame
  return p;
};
const WEBM = bytesOf(
  element(0x1a45dfa3, element(0x4282, Buffer.from('webm'))),
  unknown(
    0x18538067,
    bytesOf(
      element(
        0x1654ae6b,
        element(
          0xae,
          bytesOf(
            element(0xd7, [1]),
            element(0x83, [2]),
            element(0x86, Buffer.from('A_OPUS')),
            element(0x63a2, head),
            element(0xe1, element(0x9f, [1]))
          )
        )
      ),
      unknown(
        0x1f43b675,
        bytesOf(
          element(0xe7, [0]),
          ...Array.from({ length: 100 }, (_, i) =>
            element(0xa3, bytesOf([0x81, 0, 0, 0x80], packet(i)))
          )
        )
      )
    )
  )
);

// The fake microphone and recorder (WebKit): loudness that rises and
// falls; on stop, the WebM above.
const fakes = (webm) => {
  const stream = { getTracks: () => [{ stop() {} }] };
  // On the prototype: WebKit may drop what is set on the object itself.
  globalThis.MediaDevices.prototype.getUserMedia = async () => stream;
  class FakeRecorder extends globalThis.EventTarget {
    static isTypeSupported(type) {
      return type.startsWith('audio/webm');
    }
    constructor(_stream, options) {
      super();
      this.mimeType = options.mimeType;
      this.state = 'inactive';
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      const bytes = Uint8Array.from(globalThis.atob(webm), (c) =>
        c.charCodeAt(0)
      );
      const data = new globalThis.Blob([bytes], { type: this.mimeType });
      const event = new globalThis.Event('dataavailable');
      event.data = data;
      this.dispatchEvent(event);
      this.dispatchEvent(new globalThis.Event('stop'));
    }
  }
  window.MediaRecorder = FakeRecorder;
  let tick = 0;
  class FakeContext {
    createAnalyser() {
      return {
        fftSize: 1024,
        getByteTimeDomainData(samples) {
          tick += 1;
          samples.fill(128);
          samples[0] = 128 + Math.round(100 * Math.abs(Math.sin(tick / 5)));
        },
      };
    }
    createMediaStreamSource() {
      return { connect() {} };
    }
    close() {
      return Promise.resolve();
    }
  }
  window.AudioContext = FakeContext;
};

// The microphone in Chromium: a tone whose loudness rises and falls,
// made in the page — headless Chromium opens no microphone, not even a
// fake one — recorded by the browser's own MediaRecorder.
const tone = () => {
  globalThis.MediaDevices.prototype.getUserMedia = async () => {
    const context = new globalThis.AudioContext();
    const osc = context.createOscillator();
    const gain = context.createGain();
    const lfo = context.createOscillator();
    lfo.frequency.value = 2;
    lfo.connect(gain.gain);
    const out = context.createMediaStreamDestination();
    osc.connect(gain).connect(out);
    osc.start();
    lfo.start();
    return out.stream;
  };
};

// The upload reaches the server's real route; the account behind it
// keeps the bytes.
const uploads = [];
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
};

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-voice-'));
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
const chromium = engine === 'chromium';
const browser = await browserType.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1200, height: 800 },
});
await (chromium
  ? context.addInitScript(tone)
  : context.addInitScript(fakes, WEBM.toString('base64')));
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
const voices = [];
await page.route('**/api/telegram/send-voice', (route) => {
  voices.push(route.request().postDataJSON());
  fulfil(route, { ok: true, chat: CHAT, ids: [10 + voices.length] });
});

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

const mic = page.locator('[data-action="voice"]');
const bar = page.locator('.voice-bar');
// Down on the microphone, moved `dy` up while held.
const hold = async (dy = 0) => {
  const box = await mic.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (dy) {
    await page.mouse.move(x, y - dy / 2, { steps: 3 });
    await page.mouse.move(x, y - dy, { steps: 3 });
  }
  return { x, y };
};

let failed = false;
try {
  await page.goto(`${base}/`);
  // Nothing typed: the microphone; typed: Send.
  await mic.waitFor({ timeout: 10_000 });
  const box = page.locator('.chat-composer textarea');
  await box.fill('hello');
  await page.locator('.chat-composer button.send[type="submit"]').waitFor();
  assert((await mic.count()) === 0, 'Send in place of the microphone');
  await box.fill('');
  await mic.waitFor();

  // Held: the bar; let go over the box: sent as a voice.
  const at = await hold();
  await bar.waitFor({ timeout: 5000 });
  assert(
    (await page.locator('.voice-how').textContent()) ===
      'Release outside this field to cancel',
    'how to cancel'
  );
  assert((await box.count()) === 0, 'the box gives way');
  await page.waitForTimeout(1600);
  assert(
    /^0:01,\d\d$/.test(await page.locator('.voice-time').textContent()),
    'the time recorded'
  );
  await page.mouse.up();
  await until(() => voices.length === 1, 'the voice sent');
  const [voice] = voices;
  assert(voice.chat === CHAT, 'to the chat');
  assert(/^0+1$/.test(voice.token), 'its upload');
  assert(voice.waveform.length === 100, 'a waveform of 100');
  assert(
    voice.waveform.some((v) => v > 0) &&
      voice.waveform.every((v) => v >= 0 && v <= 31),
    `a waveform heard: ${voice.waveform.slice(0, 10)}`
  );
  const ogg = uploads[0].bytes;
  assert(uploads[0].name === 'voice.ogg', 'named as a voice');
  assert(ogg.subarray(0, 4).toString() === 'OggS', 'Ogg');
  const pages = oggPages(new Uint8Array(ogg));
  assert(
    Buffer.from(pages[0].packets[0].subarray(0, 8)).toString() === 'OpusHead',
    'Opus'
  );
  const seconds = voiceDuration(new Uint8Array(ogg));
  assert(
    chromium ? seconds > 1.2 && seconds < 4 : Math.abs(seconds - 2) < 0.1,
    `its length: ${seconds}`
  );
  assert(voice.duration === Math.max(1, Math.round(seconds)), 'length said');
  await bar.waitFor({ state: 'detached' });
  await box.waitFor();

  // Let go outside the box: dropped.
  await mic.waitFor();
  await hold();
  await bar.waitFor();
  await page.waitForTimeout(1200);
  await page.mouse.move(at.x - 600, at.y - 400, { steps: 4 });
  await page.mouse.up();
  await bar.waitFor({ state: 'detached' });
  await page.waitForTimeout(400);
  assert(voices.length === 1, 'nothing sent when let go outside');

  // A short press: "hold it".
  await hold();
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.locator('.voice-hint').waitFor({ timeout: 5000 });
  assert(
    (await page.locator('.voice-hint').textContent()) ===
      'Hold to record audio',
    'the hint'
  );
  assert(voices.length === 1, 'nothing sent for a short press');

  // Dragged up: locked; the hand goes, it records on; Cancel drops it.
  await hold(100);
  await page.locator('[data-voice="locked"]').waitFor({ timeout: 5000 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  assert((await bar.count()) === 1, 'still recording once let go');
  await page.locator('[data-action="voice-cancel"]').click();
  await bar.waitFor({ state: 'detached' });
  assert(voices.length === 1, 'nothing sent when cancelled');

  // Locked, then Esc: dropped.
  await hold(100);
  await page.locator('[data-voice="locked"]').waitFor();
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await bar.waitFor({ state: 'detached' });
  assert(voices.length === 1, 'nothing sent on Esc');

  // Locked, then Send: sent.
  await hold(100);
  await page.locator('[data-voice="locked"]').waitFor();
  await page.mouse.up();
  await page.waitForTimeout(1200);
  await page.locator('[data-action="voice-send"]').click();
  await until(() => voices.length === 2, 'the locked voice sent');
  await bar.waitFor({ state: 'detached' });

  assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
  console.log(`[e2e-voice] OK (${engine})`);
} catch (error) {
  failed = true;
  console.error(`[e2e-voice] FAIL (${engine}): ${error.message}`);
  await page.screenshot({
    path: path.join(os.tmpdir(), `ms-e2e-voice-${engine}.png`),
  });
} finally {
  await browser.close();
  await handle.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
