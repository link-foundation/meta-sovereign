// Real browser e2e for voice chats (R-Y188), as Telegram Desktop shows
// them: the bar under the top bar with "Voice chat", the title, faces and
// Join; a scheduled one with its start and "Notify me"; the panel with the
// participants and their marks (speaking, muted, raised hand, video,
// about); joining muted as a chosen identity with the browser's join
// params; the microphone asked only on Unmute; Raise hand when Telegram
// does not let us unmute; Leave. Telegram's answers are faked in the page
// (routes), RTCPeerConnection and the microphone are fakes; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:voice-chat

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const LIVE = '-1005';
const SCHEDULED = '-1006';
const QUIET = '-1007';
const store = createMemoryStore();
for (const [chat, name] of [
  [LIVE, 'Live Group'],
  [SCHEDULED, 'Plan Group'],
  [QUIET, 'Quiet Group'],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: 'supergroup',
    sender: '42',
    senderName: 'Ann Lee',
    body: 'hello',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    raw: { id: 1 },
  });
}

const OFFER = [
  'v=0',
  'o=- 1 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'a=ice-ufrag:AbCd',
  'a=ice-pwd:secretsecretsecretsecret',
  'a=fingerprint:sha-256 AA:BB:CC',
  'a=mid:0',
  'a=ssrc:3735928559 cname:xyz',
  '',
].join('\r\n');

const ANSWER = {
  transport: {
    ufrag: 'srvu',
    pwd: 'srvpwd',
    fingerprints: [
      { hash: 'sha-256', fingerprint: 'DD:EE:FF', setup: 'passive' },
    ],
    candidates: [],
  },
  audio: { 'payload-types': [], 'rtp-hdrexts': [] },
};

const { base, page, until, finish } = await openChatApp('voice-chat', {
  store,
});

// Fakes in the page: the connection, the microphone.
await page.addInitScript((offer) => {
  window.__rtc = { descriptions: [], replaced: 0, closed: false };
  window.__mic = 0;
  window.RTCPeerConnection = class {
    addTransceiver() {
      return {
        sender: {
          replaceTrack: async (track) => {
            window.__rtc.replaced += track ? 1 : 0;
          },
        },
      };
    }
    async createOffer() {
      return { type: 'offer', sdp: offer };
    }
    async createAnswer() {
      return { type: 'answer', sdp: 'answer' };
    }
    async setLocalDescription(d) {
      this.localDescription = d;
    }
    async setRemoteDescription(d) {
      window.__rtc.descriptions.push(d);
    }
    close() {
      window.__rtc.closed = true;
    }
  };
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async () => {
        window.__mic += 1;
        return {
          getAudioTracks: () => [{}],
          getTracks: () => [{ stop() {} }],
        };
      },
    },
  });
}, OFFER);

const calls = [];
const sent = (name) => calls.filter(([n]) => n === name).map(([, b]) => b);
let selfMayUnmute = true;
const participants = () => [
  {
    id: '42',
    name: 'Ann Lee',
    source: -1,
    muted: true,
    canSelfUnmute: selfMayUnmute,
    self: true,
    activeDate: 0,
    date: 1,
    about: '',
  },
  {
    id: '43',
    name: 'Bob Ray',
    source: 555,
    muted: false,
    activeDate: Math.floor(Date.now() / 1000) - 1,
    date: 2,
    about: 'Host',
  },
  {
    id: '44',
    name: 'Cy Doe',
    source: 556,
    muted: true,
    raisedHand: true,
    video: true,
    date: 3,
    about: '',
  },
];
const START = Math.floor(Date.now() / 1000) + 3600;
const CALLS = {
  [LIVE]: {
    id: '11',
    accessHash: '22',
    title: 'Standup',
    count: 3,
    live: false,
    subscribed: false,
    joinMuted: true,
    recent: [
      { id: '43', name: 'Bob Ray' },
      { id: '44', name: 'Cy Doe' },
    ],
  },
  [SCHEDULED]: {
    id: '12',
    accessHash: '23',
    title: 'Planning',
    count: 0,
    live: false,
    scheduleDate: START,
    subscribed: false,
    recent: [],
  },
};

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/call-info', (route) => {
  const body = route.request().postDataJSON();
  return fulfil(route, { ok: true, call: CALLS[body.chat] ?? null });
});
await page.route('**/api/telegram/call-open', (route) => {
  calls.push(['call-open', route.request().postDataJSON()]);
  const list = participants();
  return fulfil(route, {
    ok: true,
    call: CALLS[LIVE],
    participants: list,
    next: null,
    count: list.length,
  });
});
await page.route('**/api/telegram/call-join-as', (route) =>
  fulfil(route, {
    ok: true,
    peers: [
      { id: '42', name: 'Ann Lee', kind: 'user' },
      { id: '-1009', name: 'The Channel', kind: 'channel' },
    ],
  })
);
for (const name of ['call-notify', 'call-leave', 'call-self']) {
  await page.route(`**/api/telegram/${name}`, (route) => {
    calls.push([name, route.request().postDataJSON()]);
    return fulfil(route, { ok: true, subscribed: true });
  });
}
await page.route('**/api/telegram/call-join', (route) => {
  calls.push(['call-join', route.request().postDataJSON()]);
  return fulfil(route, { ok: true, connection: ANSWER, source: -1 });
});

const open = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
};
const bar = page.locator('[data-voice-bar]');
const panel = page.locator('[data-dialog="voice-chat"]');

const noBar = async () => {
  // A chat without a call has no bar.
  await open(QUIET);
  await page.waitForTimeout(400);
  assert((await bar.count()) === 0, 'no bar without a call');
};

const showBar = async () => {
  // A running voice chat: the bar, its title, faces, Join.
  await open(LIVE);
  await bar.waitFor({ timeout: 10_000 });
  const text = await bar.textContent();
  assert(text.includes('Voice chat') && text.includes('Standup'), text);
  assert((await bar.locator('.voice-face').count()) === 2, 'two faces');
  assert(
    (await bar.locator('[data-action="voice-bar-join"]').count()) === 1,
    'Join'
  );
  assert(sent('call-join').length === 0, 'nothing joined yet');

  // The panel: the participants and their marks.
  await bar.locator('[data-action="voice-bar-join"]').click();
  await panel.waitFor();
  await until(
    async () => (await panel.locator('.voice-row').count()) === 3,
    'rows'
  );
  const mark = (id) =>
    panel
      .locator(`[data-participant="${id}"] [data-mark]`)
      .evaluateAll((list) => list.map((m) => m.dataset.mark).join());
  assert((await mark('43')) === 'speaking', `Bob: ${await mark('43')}`);
  assert((await mark('44')) === 'hand,video,muted', `Cy: ${await mark('44')}`);
  assert((await mark('42')) === 'muted', `Ann: ${await mark('42')}`);
  assert((await panel.textContent()).includes('Host'), 'the about line');
  assert((await panel.textContent()).includes('(you)'), 'marks us');
  assert(
    sent('call-join').length === 0 &&
      (await page.evaluate(() => window.__mic)) === 0,
    'still nothing joined, no microphone'
  );
};

const joinFlow = async () => {
  // Join as the channel: muted join params, the remote answer, the sources.
  await panel.locator('[data-field="voice-join-as"]').waitFor();
  await panel.locator('[data-field="voice-join-as"]').selectOption('-1009');
  await panel.locator('[data-action="voice-join"]').click();
  await until(() => sent('call-join').length === 1, 'joined');
  const join = sent('call-join')[0];
  const params = JSON.parse(join.params);
  assert(join.id === '11' && join.joinAs === '-1009', JSON.stringify(join));
  assert(params.ufrag === 'AbCd' && params.ssrc === 3735928559, join.params);
  await panel.locator('[data-action="voice-leave"]').waitFor();
  await until(
    () => page.evaluate(() => window.__rtc.descriptions.length >= 2),
    'listening to the others'
  );
  const sdps = await page.evaluate(() =>
    window.__rtc.descriptions.map((d) => [d.type, d.sdp])
  );
  assert(
    sdps[0][0] === 'answer' && sdps[0][1].includes('a=ice-ufrag:srvu'),
    'answer'
  );
  assert(sdps[1][0] === 'offer' && sdps[1][1].includes('a=ssrc:555 '), 'offer');
  assert(
    (await page.evaluate(() => window.__mic)) === 0,
    'joined muted: no microphone'
  );

  // Unmute: the microphone is asked now, then Telegram.
  await panel.locator('[data-action="voice-mic"]').click();
  await until(() => sent('call-self').length === 1, 'unmuted');
  assert(sent('call-self')[0].muted === false, 'muted:false');
  assert(
    (await page.evaluate(() => window.__mic)) === 1,
    'microphone asked once'
  );
  await panel
    .locator('[data-action="voice-mic"][aria-pressed="true"]')
    .waitFor();
  await panel.locator('[data-action="voice-mic"]').click();
  await until(() => sent('call-self').length === 2, 'muted again');
  assert(sent('call-self')[1].muted === true, 'muted:true');

  // Leave.
  await panel.locator('[data-action="voice-leave"]').click();
  await until(() => sent('call-leave').length === 1, 'left');
  assert(sent('call-leave')[0].source === -1, 'our source');
  await panel.locator('[data-action="voice-join"]').waitFor();
};

const handFlow = async () => {
  // Telegram does not let us unmute: Raise hand instead.
  selfMayUnmute = false;
  await panel.locator('[data-action="close"]').click();
  await bar.locator('[data-action="voice-bar-join"]').click();
  await until(
    async () => (await panel.locator('.voice-row').count()) === 3,
    'rows again'
  );
  await panel.locator('[data-action="voice-join"]').click();
  await panel.locator('[data-action="voice-hand"]').waitFor();
  assert(
    (await panel.locator('[data-action="voice-mic"]').count()) === 0,
    'no mic button'
  );
  await panel.locator('[data-action="voice-hand"]').click();
  await until(
    () => sent('call-self').some((b) => b.raiseHand === true),
    'hand raised'
  );
  await panel.locator('[data-action="voice-leave"]').click();
  await until(() => sent('call-leave').length === 2, 'left again');
  await panel.locator('[data-action="close"]').click();
};

const scheduledFlow = async () => {
  // A scheduled one: its start and Notify me (a write, only on click).
  await open(SCHEDULED);
  await bar.waitFor();
  assert(
    (await bar.getAttribute('data-voice-state')) === 'scheduled',
    'scheduled'
  );
  assert((await bar.textContent()).includes('Starts'), await bar.textContent());
  assert(sent('call-notify').length === 0, 'not notified yet');
  await bar.locator('[data-action="voice-notify"]').click();
  await until(() => sent('call-notify').length === 1, 'notify');
  assert(sent('call-notify')[0].subscribed === true, 'subscribed');
  await until(
    async () =>
      (await bar.locator('[data-action="voice-notify"]').textContent()) ===
      'Cancel notification',
    'the button turns'
  );
};

await finish(async () => {
  await page.goto(`${base}/`);
  await noBar();
  await showBar();
  await joinFlow();
  await handFlow();
  await scheduledFlow();
});
