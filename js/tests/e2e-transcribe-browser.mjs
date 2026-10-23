// Real browser e2e for transcribing voice and video notes (R-Y175), as
// Telegram Desktop's "→A" button does: the button beside a voice note's
// waveform and a round video's circle asks Telegram (messages.
// transcribeAudio); while it is pending the text so far shows with a mark,
// and the final text arrives by itself (updateTranscribedAudio, here as
// the transcript link the server keeps) or, if none comes, by asking again;
// the button hides and shows the text; Telegram's limits show as text
// (Premium needed, a trial with its count, a cooldown date); a rating is
// sent. Telegram's answers faked in the page, fake chats in a memory
// store, a server on a free port, a headless browser; nothing reaches a
// network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:transcribe

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '557';
const NOW = Date.now();
const UNTIL = Math.floor(Date.parse('2031-05-04T10:00:00Z') / 1000);
const store = createMemoryStore();
const person = {
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Fay',
  chatType: 'user',
  sender: CHAT,
  senderName: 'Fake Fay',
};
const at = (n) => new Date(NOW - (10 - n) * 60_000).toISOString();
const voice = (id) => ({
  ...person,
  id: `msg:telegram:${CHAT}:${id}`,
  body: '',
  timestamp: at(id),
  raw: {
    id,
    media: {
      className: 'MessageMediaDocument',
      voice: true,
      document: {
        id: String(9000 + id),
        mimeType: 'audio/ogg',
        size: 1000,
        attributes: [
          { className: 'DocumentAttributeAudio', voice: true, duration: 4 },
        ],
      },
    },
  },
});
await store.put({
  ...person,
  id: `msg:telegram:${CHAT}:1`,
  body: 'listen',
  timestamp: at(1),
  raw: { id: 1 },
});
await store.put(voice(2));
await store.put({
  ...person,
  id: `msg:telegram:${CHAT}:3`,
  body: '',
  timestamp: at(3),
  raw: {
    id: 3,
    media: {
      className: 'MessageMediaDocument',
      document: {
        id: '3003',
        mimeType: 'video/mp4',
        size: 1000,
        attributes: [
          {
            className: 'DocumentAttributeVideo',
            roundMessage: true,
            duration: 3,
            w: 160,
            h: 160,
          },
        ],
      },
    },
  },
});
await store.put(voice(4));
await store.put(voice(5));

const { base, page, until, finish } = await openChatApp('transcribe', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/media?*', (route) =>
  route.fulfill({ status: 404, body: '' })
);
await page.route('**/api/telegram/file?*', (route) =>
  route.fulfill({ status: 404, body: '' })
);
const asked = [];
const rated = [];
await page.route('**/api/telegram/transcribe', (route) => {
  const body = route.request().postDataJSON();
  asked.push(body.id);
  const times = asked.filter((id) => id === body.id).length;
  if (body.id === 2) {
    return fulfil(route, {
      ok: true,
      transcriptionId: '700',
      text: 'good mor',
      pending: true,
      trialRemains: 2,
      trialUntil: null,
    });
  }
  if (body.id === 3) {
    // No update comes: the second ask has the final text.
    return fulfil(route, {
      ok: true,
      transcriptionId: '701',
      text: times > 1 ? 'a round hello' : 'a ro',
      pending: times < 2,
    });
  }
  if (body.id === 4) {
    return fulfil(route, { ok: false, error: 'x', code: 'premium' });
  }
  return fulfil(route, {
    ok: true,
    transcriptionId: '702',
    text: 'last free one',
    pending: false,
    trialRemains: 0,
    trialUntil: UNTIL,
  });
});
await page.route('**/api/telegram/transcribe-rate', (route) => {
  rated.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});

const row = (id) => page.locator(`[data-message="msg:telegram:${CHAT}:${id}"]`);
const button = (id) => row(id).locator('[data-action="transcribe"]');
const text = (id) => row(id).locator('.transcript');

await finish(async () => {
  await page.goto(`${base}/#chat=telegram:${CHAT}`);
  await row(2).waitFor({ timeout: 15_000 });
  await row(3).waitFor({ timeout: 15_000 });

  // A voice note: "→A" beside the waveform.
  const wave = await row(2).locator('.audio-wave').boundingBox();
  const mark = await button(2).boundingBox();
  assert(mark && wave && mark.x > wave.x + wave.width - 2, 'beside waveform');
  assert((await button(2).textContent()) === '→A', 'the label');
  assert((await text(2).count()) === 0, 'nothing shown before the press');

  // Pending: the text so far, the mark, the trial.
  await button(2).click();
  await text(2).waitFor({ timeout: 5000 });
  await until(
    async () => (await text(2).textContent()).includes('good mor'),
    'text so far'
  );
  assert(
    (await text(2).locator('[data-transcript-pending]').count()) === 1,
    'a progress mark'
  );
  assert(
    (await text(2).textContent()).includes('2 free transcriptions left'),
    `trial: ${await text(2).textContent()}`
  );

  // The final text arrives as an update (the transcript link).
  await store.put({
    id: `transcript:telegram:${CHAT}:2`,
    kind: 'transcript',
    source: 'telegram',
    chat: CHAT,
    msgId: 2,
    transcriptionId: '700',
    text: 'good morning everyone',
    pending: false,
    trialRemains: 2,
    trialUntil: null,
    at: new Date(NOW).toISOString(),
  });
  await until(
    async () => (await text(2).textContent()).includes('good morning everyone'),
    'the final text from the update'
  );
  assert(
    (await text(2).locator('[data-transcript-pending]').count()) === 0,
    'the mark goes'
  );
  assert(asked.filter((id) => id === 2).length === 1, 'asked only once');

  // Rating the transcription.
  await text(2).locator('[data-action="transcribe-good"]').click();
  await until(() => rated.length === 1, 'rated');
  assert(rated[0].good === true && rated[0].transcriptionId === '700', 'rate');

  // The button hides the text and shows it again, without asking.
  await button(2).click();
  await until(async () => (await text(2).count()) === 0, 'hidden');
  await button(2).click();
  await text(2).waitFor({ timeout: 5000 });
  assert(asked.filter((id) => id === 2).length === 1, 'no new ask');

  // A round video: the button beside the circle; no update, so the page
  // asks again after a few seconds.
  const circle = await row(3).locator('.bubble-round').boundingBox();
  const side = await button(3).boundingBox();
  assert(side && circle && side.x >= circle.x + circle.width - 2, 'beside');
  await button(3).click();
  await until(
    async () => (await text(3).textContent()).includes('a ro'),
    'partial round text'
  );
  await until(
    async () => (await text(3).textContent()).includes('a round hello'),
    'asked again',
    15_000
  );
  assert(asked.filter((id) => id === 3).length === 2, 'asked twice');
  assert(
    (await text(3).locator('[data-transcript-pending]').count()) === 0,
    'done'
  );

  // Premium needed.
  await button(4).click();
  await until(
    async () => (await text(4).textContent()).includes('Telegram Premium'),
    `premium: ${await text(4)
      .textContent()
      .catch(() => '')}`
  );

  // The trial used up: the date of the next free one.
  await button(5).click();
  await until(
    async () => (await text(5).textContent()).includes('last free one'),
    'text'
  );
  const cooldown = await text(5).textContent();
  assert(
    cooldown.includes('No free transcriptions left') &&
      cooldown.includes('2031'),
    `cooldown: ${cooldown}`
  );
});
