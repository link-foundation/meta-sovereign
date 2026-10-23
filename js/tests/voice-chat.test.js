// Voice chats, video chats and live streams (R-Y188): the requests built,
// the routes' validation, shaping of calls and participants, live updates,
// the join params JSON <-> SDP conversion with sample data, the session
// with a fake RTCPeerConnection, and the page's pure model. Fake clients;
// nothing reaches a network, a microphone or a clock but the ones passed.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createVoiceChat,
  shapeCall,
  shapeParticipant,
} from '../src/sources/telegram-voice-chat.js';
import { updateEffect } from '../src/sources/telegram-updates.js';
import { groupCallWriter } from '../src/sources/telegram-voice-chat-live.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  joinParamsOf,
  nextSources,
  remoteSdpOf,
  signed,
  unsigned,
} from '../src/web/voice-chat-sdp.js';
import { createVoiceSession } from '../src/web/voice-chat-session.js';
import {
  callLinkOf,
  isScheduled,
  isSpeaking,
  marksOf,
  mayUnmute,
  mergedCall,
  mergedPages,
  sortedParticipants,
} from '../src/web/voice-chat-model.js';
import { named, fakeClient, telegramError } from './helpers/telegram-fakes.mjs';
import { postRoute } from './helpers/post-route.js';

const Api = {
  channels: { GetFullChannel: named('GetFullChannel') },
  messages: { GetFullChat: named('GetFullChat') },
  phone: {
    GetGroupCall: named('GetGroupCall'),
    GetGroupParticipants: named('GetGroupParticipants'),
    ToggleGroupCallStartSubscription: named('ToggleGroupCallStartSubscription'),
    GetGroupCallJoinAs: named('GetGroupCallJoinAs'),
    JoinGroupCall: named('JoinGroupCall'),
    LeaveGroupCall: named('LeaveGroupCall'),
    EditGroupCallParticipant: named('EditGroupCallParticipant'),
  },
  InputGroupCall: named('InputGroupCall'),
  InputPeerSelf: named('InputPeerSelf'),
  DataJSON: named('DataJSON'),
};

const make = (answer) => {
  const log = [];
  const client = fakeClient(answer, log);
  const actions = createVoiceChat(
    {
      importer: async () => ({
        Api,
        helpers: { returnBigInt: (v) => BigInt(v) },
      }),
      connection: {
        withPeer: async (_c, chat, use) =>
          use({ channelId: BigInt(chat.slice(4)), chat }),
      },
    },
    { userClient: async () => client }
  );
  return { actions, log };
};

const rawCall = (fields = {}) => ({
  className: 'GroupCall',
  id: 11n,
  accessHash: 22n,
  participantsCount: 5,
  title: 'Standup',
  joinMuted: true,
  ...fields,
});

const ann = { className: 'User', id: 42n, firstName: 'Ann', lastName: 'Lee' };
const rawParticipant = (fields = {}) => ({
  className: 'GroupCallParticipant',
  peer: { className: 'PeerUser', userId: 42n },
  source: 777,
  date: 100,
  ...fields,
});

test('a call and a participant are shaped for the page', () => {
  assert.equal(shapeCall({ className: 'GroupCallDiscarded' }), null);
  assert.deepEqual(
    shapeCall(rawCall({ rtmpStream: true, scheduleDate: 5000 })),
    {
      id: '11',
      accessHash: '22',
      title: 'Standup',
      count: 5,
      live: true,
      scheduleDate: 5000,
      subscribed: false,
      joinMuted: true,
      canChangeJoinMuted: false,
      canStartVideo: false,
      creator: false,
    }
  );
  const shaped = shapeParticipant(
    { users: [ann], chats: [] },
    rawParticipant({
      muted: true,
      raiseHandRating: 3n,
      about: 'hi',
      activeDate: 90,
      video: {},
    })
  );
  assert.equal(shaped.id, '42');
  assert.equal(shaped.name, 'Ann Lee');
  assert.equal(shaped.raisedHand, true);
  assert.equal(shaped.video, true);
  assert.equal(shaped.about, 'hi');
  assert.equal(shaped.activeDate, 90);
  assert.equal(shapeParticipant({}, rawParticipant()).raisedHand, false);
});

test('callInfo reads a supergroup call, its default join-as and faces', async () => {
  const { actions, log } = make((r) => {
    if (r.className === 'GetFullChannel') {
      return {
        fullChat: {
          call: { id: 11n, accessHash: 22n },
          groupcallDefaultJoinAs: { className: 'PeerChannel', channelId: 9n },
        },
      };
    }
    return {
      call: rawCall(),
      participants: [rawParticipant()],
      users: [ann],
      chats: [],
    };
  });
  const answer = await actions.callInfo({ chat: '-1005' });
  assert.equal(answer.ok, true);
  assert.equal(answer.call.id, '11');
  assert.equal(answer.call.defaultJoinAs, '-1009');
  assert.deepEqual(answer.call.recent, [{ id: '42', name: 'Ann Lee' }]);
  assert.deepEqual(
    log.map((r) => r.className),
    ['GetFullChannel', 'GetGroupCall']
  );
});

test('callInfo of a chat with no call, a basic group, and a bad id', async () => {
  const none = make(() => ({ fullChat: {} }));
  assert.deepEqual(await none.actions.callInfo({ chat: '-1005' }), {
    ok: true,
    call: null,
  });
  const group = make(() => ({ fullChat: {} }));
  await group.actions.callInfo({ chat: '-77' });
  assert.equal(group.log[0].className, 'GetFullChat');
  assert.equal(group.log[0].chatId, 77n);
  assert.equal((await none.actions.callInfo({ chat: '42' })).supported, false);
});

test('callOpen and callParticipants page the participants', async () => {
  const { actions, log } = make((r) =>
    r.className === 'GetGroupCall'
      ? {
          call: rawCall(),
          participants: [
            rawParticipant(),
            rawParticipant({
              peer: { className: 'PeerUser', userId: 5n },
              left: true,
            }),
          ],
          participantsNextOffset: 'abc',
          users: [ann],
        }
      : {
          count: 9,
          participants: [rawParticipant()],
          nextOffset: '',
          users: [ann],
        }
  );
  const open = await actions.callOpen({ id: '11', accessHash: '22' });
  assert.equal(open.participants.length, 1);
  assert.equal(open.next, 'abc');
  assert.equal(open.count, 5);
  const more = await actions.callParticipants({
    id: '11',
    accessHash: '22',
    offset: 'abc',
  });
  assert.equal(more.count, 9);
  assert.equal(more.next, null);
  assert.equal(log[1].offset, 'abc');
  assert.equal(log[1].call.id, 11n);
});

test('the writes: notify, join muted, leave, mute and hand', async () => {
  const connection = JSON.stringify({ transport: { ufrag: 'u' } });
  const { actions, log } = make((r) =>
    r.className === 'JoinGroupCall'
      ? {
          updates: [
            {
              className: 'UpdateGroupCallConnection',
              params: { data: connection },
            },
          ],
        }
      : true
  );
  const call = { id: '11', accessHash: '22' };
  assert.deepEqual(await actions.callNotify({ ...call, subscribed: true }), {
    ok: true,
    subscribed: true,
  });
  const params = JSON.stringify({
    ufrag: 'u',
    pwd: 'p',
    fingerprints: [],
    ssrc: 4294967295,
  });
  const joined = await actions.callJoin({ ...call, params });
  assert.deepEqual(joined, {
    ok: true,
    connection: { transport: { ufrag: 'u' } },
    source: -1,
  });
  const join = log.find((r) => r.className === 'JoinGroupCall');
  assert.equal(join.muted, true);
  assert.equal(join.joinAs.className, 'InputPeerSelf');
  assert.equal(join.params.data, params);
  await actions.callLeave({ ...call, source: -1 });
  await actions.callSelf({ ...call, muted: true, raiseHand: true });
  await actions.callSelf({ ...call, muted: false });
  const edits = log.filter((r) => r.className === 'EditGroupCallParticipant');
  assert.equal(edits[0].raiseHand, true);
  assert.equal(edits[0].participant.className, 'InputPeerSelf');
  assert.equal(edits[1].muted, false);
  assert.equal('raiseHand' in edits[1], false);
});

test('a join with no connection answer fails; Telegram errors become codes', async () => {
  const none = make(() => ({ updates: [] }));
  const params = JSON.stringify({
    ufrag: 'u',
    pwd: 'p',
    fingerprints: [],
    ssrc: 1,
  });
  const joined = await none.actions.callJoin({
    id: '11',
    accessHash: '22',
    params,
  });
  assert.equal(joined.ok, false);
  const gone = make(() => telegramError('GROUPCALL_INVALID'));
  assert.equal(
    (await gone.actions.callOpen({ id: '11', accessHash: '22' })).code,
    'gone'
  );
  const forbidden = make(() => telegramError('GROUPCALL_FORBIDDEN'));
  assert.equal(
    (
      await forbidden.actions.callSelf({
        id: '1',
        accessHash: '2',
        muted: false,
      })
    ).code,
    'forbidden'
  );
});

test('bad requests are refused before Telegram is asked', async () => {
  const { actions, log } = make(() => true);
  const call = { id: '11', accessHash: '22' };
  for (const bad of [
    actions.callOpen({ id: 'x', accessHash: '1' }),
    actions.callJoin({ ...call, params: 'nope' }),
    actions.callJoin({ ...call, params: '{"ssrc":1}' }),
    actions.callLeave({ ...call, source: 'x' }),
    actions.callNotify({ ...call, subscribed: 'yes' }),
    actions.callSelf({ ...call, muted: 'no' }),
    actions.callParticipants({ ...call, offset: 'a b' }),
  ]) {
    assert.equal((await bad).code, 'failed');
  }
  assert.equal(log.length, 0);
});

test('the routes validate strictly', async () => {
  const seen = [];
  const account = new Proxy(
    {},
    {
      get: (_t, name) => async (body) => {
        seen.push([name, body]);
        return { ok: true };
      },
    }
  );
  const call = { id: '11', accessHash: '22' };
  const params = JSON.stringify({
    ufrag: 'u',
    pwd: 'p',
    fingerprints: [],
    ssrc: 1,
  });
  assert.equal(await postRoute('call-info', { chat: '-1005' }, account), 200);
  assert.equal(await postRoute('call-info', { chat: '42' }, account), 400);
  assert.equal(await postRoute('call-open', call, account), 200);
  assert.equal(await postRoute('call-open', { id: '1' }, account), 400);
  assert.equal(
    await postRoute('call-notify', { ...call, subscribed: true }, account),
    200
  );
  assert.equal(
    await postRoute('call-notify', { ...call, subscribed: 1 }, account),
    400
  );
  assert.equal(await postRoute('call-join', { ...call, params }, account), 200);
  assert.equal(
    await postRoute('call-join', { ...call, params: 'x' }, account),
    400
  );
  assert.equal(
    await postRoute('call-join', { ...call, params, joinAs: 5 }, account),
    400
  );
  assert.equal(
    await postRoute('call-leave', { ...call, source: -5 }, account),
    200
  );
  assert.equal(
    await postRoute('call-leave', { ...call, source: '5' }, account),
    400
  );
  assert.equal(
    await postRoute('call-self', { ...call, muted: false }, account),
    200
  );
  assert.equal(
    await postRoute(
      'call-self',
      { ...call, muted: false, raiseHand: 'x' },
      account
    ),
    400
  );
  assert.equal(
    await postRoute('call-join-as', { chat: '-1005' }, account),
    200
  );
  assert.equal(
    await postRoute('call-participants', { ...call, offset: 'a b' }, account),
    400
  );
  assert.equal(seen.length, 7);
  assert.equal(await postRoute('call-open', call, {}), 400);
});

test('updateGroupCall and its participants become one link per chat', async () => {
  const store = createMemoryStore();
  const now = () => Date.parse('2026-01-01T00:00:00Z');
  const started = updateEffect({
    className: 'UpdateGroupCall',
    peer: { className: 'PeerChannel', channelId: 5n },
    call: rawCall({ rtmpStream: false }),
  });
  assert.equal(started.kind, 'group-call');
  assert.equal(started.chat, '-1005');
  await groupCallWriter(store, now, started);
  const link = await store.get('groupcall:telegram:-1005');
  assert.equal(link.call.title, 'Standup');
  assert.equal(link.rev, 0);
  const people = updateEffect({
    className: 'UpdateGroupCallParticipants',
    call: { id: 11n, accessHash: 22n },
    participants: [],
  });
  await groupCallWriter(store, now, people);
  assert.equal((await store.get('groupcall:telegram:-1005')).rev, 1);
  // A call with no peer is matched by its id; a discarded one empties it.
  const ended = updateEffect({
    className: 'UpdateGroupCall',
    call: { className: 'GroupCallDiscarded', id: 11n },
  });
  assert.equal(ended.chat, null);
  await groupCallWriter(store, now, ended);
  assert.equal((await store.get('groupcall:telegram:-1005')).call, null);
});

// ---- the join params JSON <-> SDP ----------------------------------

const OFFER = [
  'v=0',
  'o=- 4611 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'c=IN IP4 0.0.0.0',
  'a=ice-ufrag:AbCd',
  'a=ice-pwd:secretsecretsecretsecret',
  'a=fingerprint:sha-256 AA:BB:CC',
  'a=setup:actpass',
  'a=mid:0',
  'a=sendrecv',
  'a=rtpmap:111 opus/48000/2',
  'a=ssrc:3735928559 cname:xyz',
  'a=ssrc:3735928559 msid:- track',
  '',
].join('\r\n');

const ANSWER = {
  transport: {
    ufrag: 'srvu',
    pwd: 'srvpwd',
    fingerprints: [
      { hash: 'sha-256', fingerprint: 'DD:EE:FF', setup: 'passive' },
    ],
    candidates: [
      {
        foundation: '1',
        component: 1,
        protocol: 'udp',
        priority: 2130706431,
        ip: '203.0.113.7',
        port: 10001,
        type: 'host',
        generation: 0,
      },
    ],
    'rtcp-mux': true,
  },
  audio: {
    'payload-types': [
      {
        id: 111,
        name: 'opus',
        clockrate: 48000,
        channels: 2,
        parameters: { minptime: 10, useinbandfec: 1 },
        'rtcp-fbs': [{ type: 'transport-cc' }],
      },
    ],
    'rtp-hdrexts': [
      { id: 1, uri: 'urn:ietf:params:rtp-hdrext:ssrc-audio-level' },
    ],
  },
};

test('the join params come from a local offer', () => {
  assert.deepEqual(joinParamsOf(OFFER), {
    ufrag: 'AbCd',
    pwd: 'secretsecretsecretsecret',
    fingerprints: [
      { hash: 'sha-256', setup: 'active', fingerprint: 'AA:BB:CC' },
    ],
    ssrc: 3735928559,
    'ssrc-groups': [],
  });
  assert.equal(joinParamsOf('v=0\r\n'), null);
  assert.equal(joinParamsOf(OFFER.replace(/a=ssrc.*\r\n/g, '')), null);
  assert.equal(unsigned(-1), 4294967295);
  assert.equal(signed(4294967295), -1);
});

test("Telegram's answer becomes a remote answer SDP", () => {
  const sdp = remoteSdpOf(ANSWER);
  const all = sdp.split('\r\n');
  assert.ok(all.includes('a=group:BUNDLE 0'));
  assert.ok(all.includes('a=ice-ufrag:srvu'));
  assert.ok(all.includes('a=ice-pwd:srvpwd'));
  assert.ok(all.includes('a=fingerprint:sha-256 DD:EE:FF'));
  assert.ok(all.includes('a=setup:passive'));
  assert.ok(all.includes('a=sendrecv'));
  assert.ok(all.includes('a=rtpmap:111 opus/48000/2'));
  assert.ok(all.includes('a=fmtp:111 minptime=10;useinbandfec=1'));
  assert.ok(all.includes('a=rtcp-fb:111 transport-cc'));
  assert.ok(
    all.includes('a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level')
  );
  assert.ok(
    all.includes(
      'a=candidate:1 1 udp 2130706431 203.0.113.7 10001 typ host generation 0'
    )
  );
  assert.ok(sdp.endsWith('\r\n'));
  assert.equal(all.filter((l) => l.startsWith('m=audio')).length, 1);
});

test('other speakers are receive-only sections of a remote offer', () => {
  const sdp = remoteSdpOf(ANSWER, {
    kind: 'offer',
    sources: [-2, null, 1234],
    version: 3,
  });
  const all = sdp.split('\r\n');
  assert.ok(all.includes('a=group:BUNDLE 0 1 2 3'));
  assert.equal(all.filter((l) => l.startsWith('m=audio')).length, 4);
  assert.ok(all.includes('m=audio 0 UDP/TLS/RTP/SAVPF 111'));
  assert.ok(all.includes('a=ssrc:4294967294 cname:stream4294967294'));
  assert.ok(all.includes('a=ssrc:1234 cname:stream1234'));
  assert.ok(all.includes('a=sendonly'));
  assert.ok(all.includes('a=inactive'));
  assert.ok(all.includes('a=setup:actpass'));
  assert.ok(all.includes('o=- 3 3 IN IP4 0.0.0.0'));
  // Without any payload types Telegram's Opus is assumed.
  assert.ok(
    remoteSdpOf({ transport: ANSWER.transport }).includes(
      'a=rtpmap:111 opus/48000/2'
    )
  );
});

test('sources keep their places and skip our own', () => {
  const people = [{ source: 5 }, { source: -3 }, { source: 9 }, { source: 0 }];
  assert.deepEqual(nextSources([], people, 9), [5, 4294967293]);
  assert.deepEqual(nextSources([5, 4294967293], [{ source: -3 }], 9), [
    null,
    4294967293,
  ]);
  assert.deepEqual(
    nextSources([null, 4294967293], [{ source: 5 }, { source: -3 }], 9),
    [null, 4294967293, 5]
  );
});

// ---- the session with a fake RTCPeerConnection ----------------------

class FakeRtc {
  static last = null;
  constructor() {
    FakeRtc.last = this;
    this.descriptions = [];
    this.closed = false;
    this.replaced = [];
  }
  addTransceiver() {
    return {
      sender: {
        replaceTrack: async (track) => {
          this.replaced.push(track);
        },
      },
    };
  }
  async createOffer() {
    return { type: 'offer', sdp: OFFER };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'answer' };
  }
  async setLocalDescription(d) {
    this.localDescription = d;
  }
  async setRemoteDescription(d) {
    this.descriptions.push(d);
  }
  close() {
    this.closed = true;
  }
}

const fakeApi = (
  log,
  joinAnswer = { ok: true, connection: ANSWER, source: -1 }
) => ({
  telegramCallJoin: async (b) => (log.push(['join', b]), joinAnswer),
  telegramCallLeave: async (b) => (log.push(['leave', b]), { ok: true }),
  telegramCallSelf: async (b) => (log.push(['self', b]), { ok: true }),
});

test('joining sends the params muted, then listens; leaving closes', async () => {
  const log = [];
  const session = createVoiceSession({
    api: fakeApi(log),
    call: { id: '11', accessHash: '22' },
    joinAs: '-1009',
    Rtc: FakeRtc,
  });
  const joined = await session.join();
  assert.deepEqual(joined, { ok: true, source: -1 });
  const [name, body] = log[0];
  assert.equal(name, 'join');
  assert.equal(body.joinAs, '-1009');
  assert.equal(JSON.parse(body.params).ssrc, 3735928559);
  const rtc = FakeRtc.last;
  assert.equal(rtc.descriptions[0].type, 'answer');
  await session.sync([{ source: 5 }, { source: -1 }]);
  assert.equal(rtc.descriptions[1].type, 'offer');
  assert.ok(rtc.descriptions[1].sdp.includes('a=ssrc:5 '));
  assert.ok(!rtc.descriptions[1].sdp.includes('a=ssrc:4294967295'));
  await session.sync([{ source: 5 }]);
  assert.equal(rtc.descriptions.length, 2);
  await session.leave();
  assert.deepEqual(log.at(-1), [
    'leave',
    { id: '11', accessHash: '22', joinAs: '-1009', source: -1 },
  ]);
  assert.equal(rtc.closed, true);
});

test('a refused join or a browser without WebRTC leaves nothing open', async () => {
  const log = [];
  const refused = createVoiceSession({
    api: fakeApi(log, { ok: false, code: 'gone' }),
    call: { id: '1', accessHash: '2' },
    Rtc: FakeRtc,
  });
  assert.equal((await refused.join()).code, 'gone');
  assert.equal(FakeRtc.last.closed, true);
  const none = createVoiceSession({
    api: fakeApi(log),
    call: { id: '1', accessHash: '2' },
    Rtc: undefined,
  });
  assert.equal((await none.join()).code, 'unsupported');
});

test('unmuting asks for the microphone only when called, and undoes a refusal', async () => {
  const log = [];
  let asked = 0;
  const track = { id: 'mic' };
  const stopped = [];
  const session = createVoiceSession({
    api: fakeApi(log),
    call: { id: '1', accessHash: '2' },
    Rtc: FakeRtc,
    getMic: async () => {
      asked += 1;
      return {
        getAudioTracks: () => [track],
        getTracks: () => [{ stop: () => stopped.push(1) }],
      };
    },
  });
  await session.join();
  assert.equal(asked, 0);
  assert.equal((await session.unmute()).ok, true);
  assert.equal(asked, 1);
  assert.deepEqual(log.at(-1)[1].muted, false);
  assert.equal(FakeRtc.last.replaced[0], track);
  await session.mute();
  assert.equal(FakeRtc.last.replaced.at(-1), null);
  assert.equal(log.at(-1)[1].muted, true);
  assert.equal(stopped.length, 1);
  await session.raiseHand(true);
  assert.deepEqual(log.at(-1)[1].raiseHand, true);
  const denied = createVoiceSession({
    api: fakeApi(log),
    call: { id: '1', accessHash: '2' },
    Rtc: FakeRtc,
    getMic: async () => {
      throw new Error('denied');
    },
  });
  await denied.join();
  assert.equal((await denied.unmute()).code, 'mic');
});

// ---- the page's model -----------------------------------------------

test('the live link wins when newer, and ends the call when empty', () => {
  const asked = {
    call: { id: '1', title: 'A', recent: [{ id: '5' }] },
    at: 1000,
  };
  assert.equal(mergedCall(null, null), null);
  assert.equal(mergedCall(asked, null).title, 'A');
  const older = {
    at: new Date(500).toISOString(),
    call: { id: '1', title: 'B' },
  };
  assert.equal(mergedCall(asked, older).title, 'A');
  const newer = {
    at: new Date(2000).toISOString(),
    call: { id: '1', title: 'B' },
  };
  const merged = mergedCall(asked, newer);
  assert.equal(merged.title, 'B');
  assert.deepEqual(merged.recent, [{ id: '5' }]);
  assert.equal(
    mergedCall(asked, { at: new Date(2000).toISOString(), call: { id: '2' } })
      .recent,
    undefined
  );
  assert.equal(
    mergedCall(asked, { at: new Date(2000).toISOString(), call: null }),
    null
  );
  assert.equal(mergedCall(null, newer).title, 'B');
  assert.equal(
    callLinkOf([{ id: 'groupcall:telegram:-1005' }], {
      source: 'telegram',
      chat: '-1005',
    }).id,
    'groupcall:telegram:-1005'
  );
  assert.equal(callLinkOf(null, { source: 'telegram', chat: '-1005' }), null);
});

test('marks, speaking and order of participants', () => {
  const NOW = Date.parse('2026-01-01T00:00:10Z');
  const sec = NOW / 1000;
  const talking = { id: 'a', activeDate: sec - 2, date: 3 };
  const quiet = { id: 'b', muted: true, date: 1 };
  const hand = { id: 'c', muted: true, raisedHand: true, video: true, date: 2 };
  const open = { id: 'd', date: 4 };
  assert.equal(isSpeaking(talking, NOW), true);
  assert.equal(isSpeaking({ ...talking, muted: true }, NOW), false);
  assert.equal(isSpeaking({ id: 'x', activeDate: sec - 60 }, NOW), false);
  assert.deepEqual(marksOf(hand, NOW), ['hand', 'video', 'muted']);
  assert.deepEqual(
    sortedParticipants([quiet, hand, open, talking], NOW).map((p) => p.id),
    ['a', 'd', 'c', 'b']
  );
  assert.deepEqual(mergedPages([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }]), [
    { id: 'a' },
    { id: 'b' },
  ]);
  assert.equal(
    mayUnmute({ canSelfUnmute: false }, { joinMuted: false }),
    false
  );
  assert.equal(mayUnmute(undefined, { joinMuted: true }), false);
  assert.equal(mayUnmute(undefined, { joinMuted: false }), true);
  assert.equal(isScheduled({ scheduleDate: 100 }, 50_000), true);
  assert.equal(isScheduled({ scheduleDate: 100 }, 200_000), false);
  assert.equal(isScheduled({}, 0), false);
});
