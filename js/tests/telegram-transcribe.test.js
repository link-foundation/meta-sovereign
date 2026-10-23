// Transcribing voice and video notes and reporting messages (R-Y175): the
// requests built, Telegram's answers and refusals, the live update kept as
// a link, the routes, and the page's pure helpers. Fake clients; nothing
// reaches a network, and no test meets today's date.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createTranscribe,
  transcriptLinkId,
  transcriptWriter,
} from '../src/sources/telegram-transcribe.js';
import { createPeerActions } from '../src/sources/telegram-peer-actions.js';
import { updateEffect } from '../src/sources/telegram-updates.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { postRoute } from './helpers/post-route.js';
import {
  clearTranscripts,
  feedTranscripts,
  transcriptOf,
  trialNote,
} from '../src/web/chat-transcribe.js';
import { canReport, menuItems } from '../src/web/chat-selection.js';
import { reportIds } from '../src/web/chat-report.js';

const NOW = Date.parse('2026-03-01T12:00:00Z');

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  messages: {
    TranscribeAudio: named('TranscribeAudio'),
    RateTranscribedAudio: named('RateTranscribedAudio'),
    Report: named('Report'),
  },
};

const make = (answer, store = createMemoryStore()) => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      const next = answer(request);
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  const env = {
    store,
    importer: async () => ({
      Api,
      helpers: { returnBigInt: (v) => BigInt(v) },
    }),
    connection: {
      withPeer: async (_c, chat, use) => use({ chat }),
    },
  };
  const context = { userClient: async () => client, now: () => NOW };
  return {
    log,
    store,
    ...createTranscribe(env, context),
    peer: createPeerActions(env, context),
  };
};

const telegramError = (errorMessage) =>
  Object.assign(new Error(errorMessage), { errorMessage });

test('transcribeAudio sends the message and shapes the answer', async () => {
  const { transcribeAudio, log, store } = make(() => ({
    transcriptionId: 99n,
    text: 'hello',
    pending: true,
    trialRemainsNum: 2,
    trialRemainsUntilDate: 0,
  }));
  const answer = await transcribeAudio({ chat: '-1005', id: 7 });
  assert.deepEqual(answer, {
    ok: true,
    transcriptionId: '99',
    text: 'hello',
    pending: true,
    trialRemains: 2,
    trialUntil: null,
  });
  assert.equal(log[0].className, 'TranscribeAudio');
  assert.equal(log[0].msgId, 7);
  const link = await store.get(transcriptLinkId('-1005', 7));
  assert.equal(link.text, 'hello');
  assert.equal(link.pending, true);
  assert.equal(link.at, new Date(NOW).toISOString());
});

test('a finished transcription is kept; a pending one is asked again', async () => {
  const answers = [
    { transcriptionId: 5n, text: 'part', pending: true },
    { transcriptionId: 5n, text: 'whole thing', pending: false },
  ];
  const { transcribeAudio, log } = make(() => answers.shift());
  assert.equal((await transcribeAudio({ chat: '5', id: 1 })).pending, true);
  assert.equal(
    (await transcribeAudio({ chat: '5', id: 1 })).text,
    'whole thing'
  );
  assert.equal(
    (await transcribeAudio({ chat: '5', id: 1 })).text,
    'whole thing'
  );
  assert.equal(log.length, 2);
});

test('rateTranscription sends the id and the verdict', async () => {
  const { rateTranscription, log } = make(() => true);
  const answer = await rateTranscription({
    chat: '5',
    id: 3,
    transcriptionId: '123456789012',
    good: false,
  });
  assert.deepEqual(answer, { ok: true });
  assert.equal(log[0].className, 'RateTranscribedAudio');
  assert.equal(log[0].transcriptionId, 123456789012n);
  assert.equal(log[0].good, false);
});

test("Telegram's refusals become codes", async () => {
  for (const [name, code] of [
    ['PREMIUM_ACCOUNT_REQUIRED', 'premium'],
    ['TRANSCRIPTION_FAILED', 'transcription-failed'],
    ['MSG_ID_INVALID', 'not-found'],
    ['FLOOD_WAIT_3', 'flood'],
    ['SOMETHING_ELSE', 'failed'],
  ]) {
    const { transcribeAudio } = make(() => telegramError(name));
    const answer = await transcribeAudio({ chat: '5', id: 1 });
    assert.equal(answer.ok, false);
    assert.equal(answer.code, code);
  }
});

test('bad requests never reach Telegram', async () => {
  const { transcribeAudio, rateTranscription, log } = make(() => true);
  for (const bad of [
    () => transcribeAudio({ chat: 'x', id: 1 }),
    () => transcribeAudio({ chat: '5', id: 0 }),
    () => transcribeAudio({ chat: '5', id: '1' }),
    () =>
      rateTranscription({ chat: '5', id: 1, transcriptionId: 'a', good: true }),
    () =>
      rateTranscription({ chat: '5', id: 1, transcriptionId: '1', good: 1 }),
  ]) {
    assert.equal((await bad()).ok, false);
  }
  assert.equal(log.length, 0);
});

test('updateTranscribedAudio becomes an effect and a link', async () => {
  const effect = updateEffect({
    className: 'UpdateTranscribedAudio',
    pending: false,
    peer: { className: 'PeerChannel', channelId: 5n },
    msgId: 12,
    transcriptionId: 77n,
    text: 'final words',
  });
  assert.deepEqual(effect, {
    kind: 'transcript',
    chat: '-1005',
    id: 12,
    transcriptionId: '77',
    text: 'final words',
    pending: false,
  });
  const store = createMemoryStore();
  assert.equal(await transcriptWriter(store, effect, () => NOW), true);
  assert.equal(await transcriptWriter(store, effect, () => NOW), false);
  const link = await store.get(transcriptLinkId('-1005', 12));
  assert.equal(link.text, 'final words');
  assert.equal(link.kind, 'transcript');
  assert.equal(await transcriptWriter(store, { chat: '5' }, () => NOW), false);
});

test('the page takes transcript links into memory by chat and message', () => {
  clearTranscripts();
  feedTranscripts([
    { id: 'msg:telegram:5:1', kind: undefined },
    {
      id: transcriptLinkId('5', 1),
      kind: 'transcript',
      chat: '5',
      msgId: 1,
      transcriptionId: '9',
      text: 'there',
      pending: false,
    },
  ]);
  assert.equal(transcriptOf('5', 1).text, 'there');
  assert.equal(transcriptOf('5', 2), undefined);
  clearTranscripts();
});

test('the trial shows as text: the ones left, or the cooldown date', () => {
  const t = (key, values) => `${key}:${JSON.stringify(values ?? {})}`;
  assert.equal(trialNote({}, t, 'en'), null);
  assert.equal(
    trialNote({ trialRemains: 2 }, t, 'en'),
    'chat.transcribe.trial:{"count":2}'
  );
  assert.equal(
    trialNote({ trialRemains: 0 }, t, 'en'),
    'chat.transcribe.trialNone:{}'
  );
  const until = Math.floor(NOW / 1000);
  assert.match(
    trialNote({ trialRemains: 0, trialUntil: until }, t, 'en'),
    /^chat\.transcribe\.cooldown:\{"date":".*2026.*"\}$/
  );
});

test('report with message ids sends them; without, the whole chat', async () => {
  const { peer, log } = make(() => ({ className: 'ReportResultReported' }));
  assert.deepEqual(
    await peer.peerReport({ chat: '-1005', ids: [4, 9], option: 'AQ==' }),
    { ok: true, result: 'reported' }
  );
  assert.deepEqual(log[0].id, [4, 9]);
  await peer.peerReport({ chat: '-1005' });
  assert.deepEqual(log[1].id, []);
  for (const ids of [
    [],
    [0],
    ['1'],
    Array.from({ length: 101 }, (_, i) => i + 1),
  ]) {
    assert.equal((await peer.peerReport({ chat: '-1005', ids })).ok, false);
  }
  assert.equal(log.length, 2);
});

test('routes validate strictly', async () => {
  const calls = [];
  const account = {
    transcribeAudio: async (b) => (calls.push(b), { ok: true }),
    rateTranscription: async (b) => (calls.push(b), { ok: true }),
  };
  for (const [route, bad, good] of [
    ['transcribe', { chat: 'x', id: 1 }, { chat: '-1005', id: 1 }],
    ['transcribe', { chat: '5', id: '1' }, { chat: '5', id: 2 }],
    [
      'transcribe-rate',
      { chat: '5', id: 1, transcriptionId: '1' },
      { chat: '5', id: 1, transcriptionId: '1', good: true },
    ],
    [
      'transcribe-rate',
      { chat: '5', id: 1, transcriptionId: 'x', good: true },
      { chat: '5', id: 1, transcriptionId: '12', good: false },
    ],
  ]) {
    assert.equal(await postRoute(route, bad, account), 400);
    assert.equal(await postRoute(route, good, account), 200);
  }
  assert.equal(calls.length, 4);
  assert.equal(await postRoute('transcribe', { chat: '5', id: 1 }, {}), 400);
});

const other = (id, extra = {}) => ({
  id: `msg:telegram:-1005:${id}`,
  source: 'telegram',
  chat: '-1005',
  sender: 'u1',
  raw: { id },
  ...extra,
});

test('Report is offered on others messages in groups and channels only', () => {
  const group = { chat: '-1005', personal: false, kind: 'group' };
  assert.equal(canReport(other(1), group), true);
  assert.equal(canReport(other(1, { sender: 'me' }), group), false);
  assert.equal(canReport(other(1, { pending: true }), group), false);
  assert.equal(canReport(other(1, { service: true }), group), false);
  assert.equal(canReport(other(1), { chat: '42', personal: true }), false);
  const items = menuItems({ message: other(1), chat: group, now: NOW });
  assert.ok(items.includes('report'));
  assert.ok(
    !menuItems({
      message: other(1, { sender: 'me' }),
      chat: group,
      now: NOW,
    }).includes('report')
  );
  const selected = menuItems({
    message: other(1),
    chat: group,
    selection: {
      ids: [other(1).id],
      has: () => true,
      canForward: true,
      canReport: true,
    },
  });
  assert.ok(selected.includes('reportSelected'));
  assert.deepEqual(
    reportIds([other(3), other(4, { sender: 'me' })], group),
    [3]
  );
});
