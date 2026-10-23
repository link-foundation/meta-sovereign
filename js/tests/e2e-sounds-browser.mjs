// Real browser e2e for notification sounds and automatic media download
// (R-Y181), as Telegram Desktop has them: Settings lists the saved
// ringtones and says the limits in words, adds one from an audio file
// (only after "Add ringtone"; too big or not audio is refused in words) and
// removes one on a second click; a chat's notification settings choose its
// sound and post it only on "Save sound"; a notification plays the chat's
// ringtone, nothing for "none", the default chime otherwise; the automatic
// download settings keep photos, videos and files from loading by
// themselves, each showing a download button with its size until asked.
// Telegram's answers faked in the page, fake chats in a memory store, a
// server on a free port, a headless browser; nothing reaches a network or
// a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:sounds

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-1005';
const ANN = '222';
const BOB = '333';
const CAT = '444';
const store = createMemoryStore();
const MB = 1024 * 1024;

const message = (
  chat,
  name,
  n,
  body,
  ago = 0,
  { type = 'user', raw = {} } = {}
) => ({
  id: `msg:telegram:${chat}:${n}`,
  source: 'telegram',
  chat,
  chatName: name,
  chatType: type,
  sender: chat,
  senderName: name,
  body,
  timestamp: new Date(Date.now() - ago).toISOString(),
  raw: { id: n, ...raw },
});
const read = (chat, max) =>
  store.put({
    id: `read:telegram:${chat}`,
    tokens: ['read', 'telegram', chat],
    kind: 'read',
    source: 'telegram',
    chat,
    inboxMaxId: max,
  });

for (const [chat, name] of [
  [ANN, 'Fake Ann'],
  [BOB, 'Fake Bob'],
  [CAT, 'Fake Cat'],
]) {
  await store.put(message(chat, name, 1, `hello ${name}`, 10 * 60_000));
  await read(chat, 1);
}

// The group: a photo, a 20 MB video and a 5 MB file.
const document = (id, size, mimeType, attributes) => ({
  className: 'MessageMediaDocument',
  document: { className: 'Document', id, size, mimeType, attributes },
});
const group = (n, body, ago, media) =>
  store.put(
    message(GROUP, 'Fake Group', n, body, ago, {
      type: 'supergroup',
      raw: { media },
    })
  );
await group(2, 'a photo', 60_000, {
  className: 'MessageMediaPhoto',
  photo: {
    className: 'Photo',
    id: '1',
    sizes: [
      { className: 'PhotoSize', type: 'm', w: 640, h: 480, size: 2.5 * MB },
    ],
  },
});
await group(
  3,
  'a video',
  50_000,
  document('2', 20 * MB, 'video/mp4', [
    { className: 'DocumentAttributeVideo', duration: 12, w: 640, h: 480 },
  ])
);
await group(
  4,
  'a file',
  40_000,
  document('3', 5 * MB, 'application/pdf', [
    { className: 'DocumentAttributeFilename', fileName: 'big.pdf' },
  ])
);
await read(GROUP, 4);

const { base, page, until, finish } = await openChatApp('sounds', { store });
// The system's notifications and every sound played, recorded.
await page.addInitScript(() => {
  globalThis.__notes = [];
  globalThis.__played = [];
  class FakeNotification {
    static permission = 'granted';
    static requestPermission = async () => 'granted';
    constructor(title, options = {}) {
      this.title = title;
      globalThis.__notes.push({ title, body: options.body });
    }
    close() {}
  }
  globalThis.Notification = FakeNotification;
  document.hasFocus = () => true;
  globalThis.HTMLMediaElement.prototype.play = function play() {
    globalThis.__played.push(this.src);
    return Promise.resolve();
  };
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);

// Telegram's notification settings: three chats with a sound of their own.
const scopes = {
  users: { on: true, previews: true, stories: true },
  chats: { on: true, previews: true, stories: true },
  broadcasts: { on: true, previews: true, stories: true },
};
const exception = (chat, name, scope, sound) => ({
  chat,
  name,
  scope,
  state: 'custom',
  muteUntil: 0,
  forever: false,
  previews: null,
  sound,
});
await page.route('**/api/telegram/notify-settings', (route) =>
  fulfil(route, {
    ok: true,
    scopes,
    exceptions: [
      exception(ANN, 'Fake Ann', 'users', '11'),
      exception(BOB, 'Fake Bob', 'users', 'none'),
    ],
  })
);
const calls = [];
await page.route('**/api/telegram/notify-chat', (route) =>
  fulfil(route, {
    ok: true,
    chat: route.request().postDataJSON().chat,
    exception: false,
    muteUntil: 0,
    forever: false,
    previews: null,
    stories: true,
    sound: 'default',
  })
);
await page.route('**/api/telegram/notify-chat-set', (route) => {
  const body = route.request().postDataJSON();
  calls.push(['chat', body]);
  return fulfil(route, {
    ok: true,
    chat: body.chat,
    exception: true,
    muteUntil: 0,
    forever: false,
    previews: null,
    stories: true,
    sound: body.sound,
  });
});

// The saved ringtones.
let ringtones = [
  { id: '11', title: 'ding', duration: 2, size: 9000 },
  { id: '12', title: 'bell', duration: 3, size: 12000 },
];
const limits = { sizeBytes: 300 * 1024, seconds: 5, count: 100 };
await page.route('**/api/telegram/ringtones', (route) =>
  fulfil(route, { ok: true, ringtones, limits })
);
await page.route('**/api/telegram/upload*', (route) =>
  fulfil(route, { token: 'abc123', name: 'pop.mp3', size: 100 })
);
await page.route('**/api/telegram/ringtone-add', (route) => {
  calls.push(['add', route.request().postDataJSON()]);
  ringtones = [
    ...ringtones,
    { id: '13', title: 'pop', duration: 1, size: 100 },
  ];
  return fulfil(route, { ok: true, ringtone: ringtones.at(-1) });
});
await page.route('**/api/telegram/ringtone-remove', (route) => {
  const body = route.request().postDataJSON();
  calls.push(['remove', body]);
  ringtones = ringtones.filter((r) => r.id !== body.id);
  return fulfil(route, { ok: true });
});

// Pictures: a tiny PNG for the photo; everything counted.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
let pictures = 0;
await page.route('**/api/telegram/media?*', (route) => {
  pictures += 1;
  return route.fulfill({
    status: 200,
    contentType: 'image/png',
    headers: { 'cache-control': 'no-store' },
    body: PNG,
  });
});
await page.route('**/api/telegram/file?*', (route) =>
  route.fulfill({ status: 404, body: '' })
);

const played = () => page.evaluate(() => [...globalThis.__played]);
const notes = () => page.evaluate(() => globalThis.__notes.length);

const sounds = async () => {
  await page.locator('button[data-view="settings"]').click();
  const section = page.locator('.sound-settings');
  await section.locator('[data-ringtone]').first().waitFor({ timeout: 15000 });
  assert((await section.locator('[data-ringtone]').count()) === 2, 'two');
  const limitsText = await section.locator('.ringtones .meta').textContent();
  assert(
    limitsText.includes('300 KB') && limitsText.includes('5 seconds'),
    `limits in words: ${limitsText}`
  );

  // Choosing a file writes nothing; "Add ringtone" uploads and saves it.
  const choose = section.locator('[data-action="ringtone-file"]');
  const add = section.locator('[data-action="ringtone-add"]');
  assert(await add.isDisabled(), 'nothing chosen: add is off');
  await choose.setInputFiles({
    name: 'pop.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.alloc(100),
  });
  await until(async () => !(await add.isDisabled()), 'add is on');
  assert(calls.length === 0, 'a chosen file posts nothing');
  await add.click();
  await until(async () => calls.length === 1, 'the ringtone is added');
  assert(
    JSON.stringify(calls[0]) === JSON.stringify(['add', { token: 'abc123' }]),
    `added: ${JSON.stringify(calls[0])}`
  );
  await until(
    async () => (await section.locator('[data-ringtone]').count()) === 3,
    'three ringtones'
  );

  // Too big, or not audio: said in words, nothing posted.
  await choose.setInputFiles({
    name: 'huge.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.alloc(400 * 1024),
  });
  await section.locator('[data-problem="too-big"]').waitFor();
  assert(await add.isDisabled(), 'too big: add is off');
  assert(
    (await section.locator('[data-problem]').textContent()).includes('300 KB'),
    'the size limit in the problem'
  );
  await choose.setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.alloc(10),
  });
  await section.locator('[data-problem="bad-type"]').waitFor();
  assert(calls.length === 1, 'nothing more posted');

  // Remove asks to be confirmed.
  const row = section.locator('[data-ringtone="12"]');
  await row.locator('[data-action="ringtone-remove"]').click();
  assert(calls.length === 1, 'the first click posts nothing');
  await row.locator('[data-action="ringtone-remove-confirm"]').click();
  await until(async () => calls.length === 2, 'the removal is posted');
  assert(
    JSON.stringify(calls[1]) === JSON.stringify(['remove', { id: '12' }]),
    `removed: ${JSON.stringify(calls[1])}`
  );
  await until(
    async () => (await section.locator('[data-ringtone]').count()) === 2,
    'two again'
  );
};

const chatSound = async () => {
  await page.locator('button[data-view="chat"]').click();
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  await page.locator('[data-action="chat-notify"]').click();
  const dialog = page.locator('[data-dialog="chat-notify"]');
  await dialog.waitFor({ timeout: 5000 });
  const select = dialog.locator('[data-action="notify-sound"]');
  await select.locator('option').nth(2).waitFor({ state: 'attached' });
  const options = await select.locator('option').allTextContents();
  assert(
    options.join('|') === 'Default|No sound|ding|pop',
    `options: ${options}`
  );
  const save = dialog.locator('[data-action="notify-sound-save"]');
  assert(await save.isDisabled(), 'nothing changed: save is off');
  await select.selectOption('13');
  assert(calls.length === 2, 'choosing posts nothing');
  await save.click();
  await until(async () => calls.length === 3, 'the sound is posted');
  assert(
    JSON.stringify(calls[2]) ===
      JSON.stringify(['chat', { chat: GROUP, sound: '13' }]),
    `sound: ${JSON.stringify(calls[2])}`
  );
  await dialog.locator('[data-action="notify-close"]').click();
};

const playing = async () => {
  await page.waitForTimeout(800);
  const before = await notes();
  await store.put(message(ANN, 'Fake Ann', 5, 'ring for Ann'));
  await until(async () => (await notes()) === before + 1, 'Ann notified');
  await until(async () => (await played()).length === 1, 'a sound played');
  assert(
    (await played())[0].endsWith('/api/telegram/ringtone?id=11'),
    `ringtone: ${await played()}`
  );

  // "None" shows the notification and plays nothing.
  await store.put(message(BOB, 'Fake Bob', 5, 'silence for Bob'));
  await until(async () => (await notes()) === before + 2, 'Bob notified');
  await page.waitForTimeout(500);
  assert((await played()).length === 1, 'none plays nothing');

  // A chat with no sound of its own gets the default chime.
  await store.put(message(CAT, 'Fake Cat', 5, 'meow'));
  await until(async () => (await notes()) === before + 3, 'Cat notified');
  await until(async () => (await played()).length === 2, 'the chime played');
  assert((await played())[1].startsWith('blob:'), `chime: ${await played()}`);

  // Sounds off in Settings: still notified, nothing played.
  await page.locator('button[data-view="settings"]').click();
  await page.locator('[data-action="notify-sound-on"]').uncheck();
  await page.locator('button[data-view="chat"]').click();
  await page.waitForTimeout(800);
  await store.put(message(ANN, 'Fake Ann', 6, 'again'));
  await until(async () => (await notes()) === before + 4, 'notified again');
  await page.waitForTimeout(500);
  assert((await played()).length === 2, 'sounds off: nothing played');
  await page.locator('button[data-view="settings"]').click();
  await page.locator('[data-action="notify-sound-on"]').check();
};

const downloads = async () => {
  await page.locator('button[data-view="chat"]').click();
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  await page.locator('.bubble-photo').waitFor({ timeout: 15000 });
  // By default: the photo loads, the 20 MB video and 5 MB file wait.
  await until(async () => pictures > 0, 'the photo loads by itself');
  assert(
    (await page.locator('.bubble-photo[data-download]').count()) === 0,
    'the photo is not waiting'
  );
  const videoButton = page.locator('.bubble-video [data-download="manual"]');
  assert(
    (await videoButton.textContent()).includes('20.0 MB'),
    `video size: ${await videoButton.textContent()}`
  );
  assert(
    (await page.locator('.file-size[data-download="manual"]').textContent()) ===
      '5.0 MB',
    'file size'
  );
  assert(
    (await page.locator('.bubble-video .media-video').count()) === 0,
    'the video is not loaded'
  );

  // Groups: photos off. The photo waits, with its size; a click loads it.
  await page.locator('button[data-view="settings"]').click();
  await page.locator('[data-action="auto-photos-chats"]').uncheck();
  assert(
    await page.locator('[data-action="auto-photos-users"]').isChecked(),
    'private chats keep their photos'
  );
  await page.locator('button[data-view="chat"]').click();
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  const photo = page.locator('.bubble-photo[data-download="manual"]');
  await photo.waitFor({ timeout: 15000 });
  assert((await photo.textContent()).includes('2.5 MB'), 'photo size');
  const loaded = pictures;
  await page.waitForTimeout(500);
  assert(pictures === loaded, 'a waiting photo is not fetched');
  assert(
    (await page.locator('.bubble-photo-img').count()) === 0,
    'a waiting photo shows no picture'
  );
  await photo.click();
  await page.locator('.bubble-photo-img').waitFor({ timeout: 5000 });
  await page.locator('.bubble-photo[data-download]').waitFor({
    state: 'detached',
  });

  // Videos up to 30 MB: the 20 MB one no longer waits for a click on the
  // button; still it plays only when asked.
  await page.locator('button[data-view="settings"]').click();
  await page.locator('[data-action="auto-video-chats"]').selectOption('30');
  await page.locator('button[data-view="chat"]').click();
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  await page.locator('.bubble-video').waitFor({ timeout: 15000 });
  assert(
    (await page.locator('.bubble-video [data-download]').count()) === 0,
    'the video is allowed now'
  );
  // The button plays it.
  await page.locator('.bubble-video .media-play').click();
  await page.locator('.bubble-video .media-video').waitFor({ timeout: 5000 });
};

await finish(async () => {
  await page.goto(`${base}/#chat=telegram:${GROUP}`);
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  await page.locator(`[data-chat="telegram:${ANN}"]`).waitFor();
  await sounds();
  await chatSound();
  await playing();
  await downloads();
});
