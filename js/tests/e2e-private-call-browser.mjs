// Real browser e2e for private one-to-one voice calls (R-Y196), as Telegram
// Desktop has them: an incoming call is a notification with Accept and
// Decline (Decline discards); "Call" in a private chat's header places one
// that goes waiting, ringing, connecting and active with the emoji of the
// key, the running time and Mute, then End and the optional rating; the
// microphone is asked only on Accept or Call (getUserMedia is a stub) and
// during an active call the page says audio is not available yet. The
// server's part is played by the test: Telegram's routes are faked in the
// page and the call's live link is written to the store as the server's
// call machine would; nothing reaches a network or a running app. Not part
// of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:private-call

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const BOB = '43';
const store = createMemoryStore();
for (const [chat, name] of [
  [ANN, 'Ann Lee'],
  [BOB, 'Bob Ray'],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: 'private',
    sender: chat,
    senderName: name,
    body: 'hello',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    raw: { id: 1 },
  });
}

const { base, page, until, finish } = await openChatApp('private-call', {
  store,
});

// The microphone: a stub that counts, with a track Mute can switch.
await page.addInitScript(() => {
  window.__mic = 0;
  window.__track = { enabled: true, stopped: false };
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async () => {
        window.__mic += 1;
        const track = window.__track;
        track.stopped = false;
        return {
          getAudioTracks: () => [track],
          getTracks: () => [
            {
              stop() {
                track.stopped = true;
              },
            },
          ],
        };
      },
    },
  });
});

const LINK = 'phonecall:telegram';
let serial = 0;
// The call's link as the server's machine writes it.
const put = (patch) =>
  store.put({
    id: LINK,
    tokens: ['phonecall', 'telegram'],
    kind: 'phone-call',
    source: 'telegram',
    media: false,
    emoji: [],
    startedAt: 0,
    connected: false,
    needRating: false,
    ringMs: 90_000,
    ...patch,
    at: new Date().toISOString(),
  });
const ring = (patch) => {
  serial += 1;
  return {
    ref: `call-${serial}`,
    callId: String(900 + serial),
    ...patch,
  };
};

const sent = [];
const seen = (name) => sent.filter(([n]) => n === name).map(([, b]) => b);
const mic = () => page.evaluate(() => window.__mic);

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(route, { chat, kind: 'user', title: `User ${chat}` });
});

// What the fake server does with the current call.
let current = null;
await page.route('**/api/telegram/private-call-start', async (route) => {
  const body = route.request().postDataJSON();
  sent.push(['start', body]);
  current = ring({
    phase: 'waiting',
    out: true,
    user: body.user,
    name: body.name,
  });
  await put(current);
  return fulfil(route, { ok: true, callId: current.callId });
});
await page.route('**/api/telegram/private-call-accept', async (route) => {
  sent.push(['accept', route.request().postDataJSON()]);
  await put({ ...current, phase: 'connecting' });
  return fulfil(route, { ok: true, callId: current.callId });
});
await page.route('**/api/telegram/private-call-discard', async (route) => {
  const body = route.request().postDataJSON();
  sent.push(['discard', body]);
  await put({
    ...current,
    phase: 'ended',
    reason: body.reason,
    endedAt: Date.now(),
    duration: current.connected ? 7 : 0,
    needRating: current.connected && current.out,
  });
  return fulfil(route, { ok: true, duration: 7 });
});
await page.route('**/api/telegram/private-call-rate', (route) => {
  sent.push(['rate', route.request().postDataJSON()]);
  return fulfil(route, { ok: true });
});

const win = page.locator('[data-private-call]');
const EMOJI = ['\u{1F609}', '\u{1F60D}', '\u{1F61B}', '\u{1F62D}'];

const openAnn = async () => {
  await page.locator(`[data-chat="telegram:${ANN}"]`).click();
  await page.locator('[data-action="call-start"]').waitFor({ timeout: 10_000 });
};

const idleFirst = async () => {
  // Nothing rings, dials or asks for the microphone by itself.
  await openAnn();
  await page.waitForTimeout(300);
  assert((await win.count()) === 0, 'no call window on its own');
  assert((await mic()) === 0, 'no microphone yet');
  assert(sent.length === 0, 'nothing sent yet');
};

const declineFlow = async () => {
  // An incoming call: Accept and Decline, nothing asked before a click.
  current = ring({
    phase: 'incoming',
    out: false,
    user: BOB,
    name: 'Bob Ray',
  });
  await put(current);
  await page.locator('[data-private-call="incoming"]').waitFor();
  const text = await win.textContent();
  assert(text.includes('Bob Ray') && text.includes('Incoming call'), text);
  assert(
    (await page.locator('[data-action="call-accept"]').count()) === 1,
    'Accept'
  );
  assert(
    (await page.locator('[data-action="call-decline"]').count()) === 1,
    'Decline'
  );
  await page.waitForTimeout(300);
  assert((await mic()) === 0, 'ringing does not ask for the microphone');
  assert(sent.length === 0, 'ringing sends nothing');

  // Decline discards, and still no microphone.
  await page.locator('[data-action="call-decline"]').click();
  await until(() => seen('discard').length === 1, 'discarded');
  assert(seen('discard')[0].id === current.callId, 'the call');
  assert(seen('discard')[0].reason === 'hangup', 'a hangup');
  await until(async () => (await win.count()) === 0, 'the notification goes');
  assert((await mic()) === 0, 'declining never asks for the microphone');
};

const acceptFlow = async () => {
  // Accept asks for the microphone, then accepts; the key makes it active.
  current = ring({ phase: 'incoming', out: false, user: BOB, name: 'Bob Ray' });
  await put(current);
  await page.locator('[data-action="call-accept"]').click();
  await until(() => seen('accept').length === 1, 'accepted');
  assert(seen('accept')[0].id === current.callId, 'the call');
  assert((await mic()) === 1, 'the microphone is asked on Accept');
  await page.locator('[data-private-call="connecting"]').waitFor();
  current = { ...current, phase: 'active', connected: true, emoji: EMOJI };
  await put({ ...current, startedAt: Date.now() });
  await page.locator('[data-private-call="active"]').waitFor();
  await page.locator('[data-action="call-end"]').click();
  await until(() => seen('discard').length === 2, 'ended');
  // An incoming call that was taken shows how it ended, no rating asked.
  await page.locator('[data-action="call-close"]').click();
  await until(async () => (await win.count()) === 0, 'closed');
};

const outgoingFlow = async () => {
  // "Call" in the header: the microphone, then the request.
  const before = await mic();
  await page.locator('[data-action="call-start"]').click();
  await until(() => seen('start').length === 1, 'called');
  assert(seen('start')[0].user === ANN, 'the person');
  assert((await mic()) === before + 1, 'the microphone is asked on Call');
  await page.locator('[data-private-call="waiting"]').waitFor();
  assert(
    (await win.textContent()).includes('Calling'),
    await win.textContent()
  );

  // Ringing on the other side, then the keys, then active with the emoji.
  await put({ ...current, phase: 'ringing' });
  await page.locator('[data-private-call="ringing"]').waitFor();
  await put({ ...current, phase: 'connecting' });
  await page.locator('[data-private-call="connecting"]').waitFor();
  current = { ...current, phase: 'active', connected: true, emoji: EMOJI };
  await put({ ...current, startedAt: Date.now() });
  await page.locator('[data-private-call="active"]').waitFor();
  const shown = await page.locator('[data-call-emoji]').textContent();
  assert(shown === EMOJI.join(''), `the emoji: ${shown}`);
  await page.locator('[data-call-clock]').waitFor();
  assert(
    (await page.locator('[data-call-media-note]').textContent()) ===
      "Audio isn't available in the browser yet",
    'says audio is not available'
  );

  // Mute switches the microphone track; again to unmute.
  await page.locator('[data-action="call-mute"]').click();
  await page
    .locator('[data-action="call-mute"][aria-pressed="true"]')
    .waitFor();
  assert(!(await page.evaluate(() => window.__track.enabled)), 'track muted');
  await page.locator('[data-action="call-mute"]').click();
  await page
    .locator('[data-action="call-mute"][aria-pressed="false"]')
    .waitFor();
  assert(await page.evaluate(() => window.__track.enabled), 'track back on');

  // End: discardCall, then the rating dialog.
  await page.locator('[data-action="call-end"]').click();
  await until(() => seen('discard').length === 3, 'ended');
  assert(seen('discard')[2].id === current.callId, 'the call');
  assert(seen('discard')[2].reason === 'hangup', 'a hangup');
  await page.locator('[data-call-rate]').waitFor();
  assert(
    await page.evaluate(() => window.__track.stopped),
    'the microphone is released'
  );
  assert(seen('rate').length === 0, 'nothing rated yet');
  await page.locator('[data-action="call-rate-send"][disabled]').waitFor();
  await page.locator('[data-rating="4"]').click();
  await page.locator('[data-action="call-rate-send"]').click();
  await until(() => seen('rate').length === 1, 'rated');
  assert(seen('rate')[0].rating === 4, 'four stars');
  assert(seen('rate')[0].id === current.callId, 'the call');
  await until(async () => (await win.count()) === 0, 'the window closes');
};

await finish(async () => {
  await page.goto(`${base}/`);
  await idleFirst();
  await declineFlow();
  await acceptFlow();
  await outgoingFlow();
});
