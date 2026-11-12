/**
 * WebRTC transport tests, using a fake `RTCPeerConnection` that lets
 * two transports talk to each other through an in-memory data
 * channel. This exercises the negotiation order (offer / answer /
 * ICE), the data-channel hand-off, and the queue-while-connecting
 * behaviour without needing the `wrtc` native binding.
 *
 * Note: real WebRTC is exercised in the browser via Playwright in a
 * separate suite; this test pins the JS-side wiring.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  signalingChannel,
  createWebRtcTransport,
} from '../src/sync/webrtc-transport.js';

const settle = () => new Promise((r) => setTimeout(r, 5));

// Polls instead of a fixed number of settles, so a loaded CI host that
// delays the fake data channel's timers does not fail the test.
const waitFor = async (predicate, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await settle();
  }
};

const makeBus = () => {
  const peers = new Set();
  return {
    connect: (label) => {
      const handlers = new Set();
      const t = {
        label,
        send: (msg) => {
          for (const p of peers) {
            if (p === t) {
              continue;
            }
            for (const h of p.handlers) {
              h(msg);
            }
          }
        },
        onMessage: (h) => {
          handlers.add(h);
          return () => handlers.delete(h);
        },
        handlers,
      };
      peers.add(t);
      return t;
    },
  };
};

const makeFakeRtc = (channelStore, { autoOpen = true } = {}) =>
  class FakeRtcPeerConnection {
    constructor() {
      this.localDescription = null;
      this.remoteDescription = null;
      this.onicecandidate = null;
      this.ondatachannel = null;
      this.iceCandidates = [];
    }
    createDataChannel(label, { protocol = '' } = {}) {
      const channel = {
        readyState: 'connecting',
        label,
        protocol,
        peer: null,
        onopen: null,
        onmessage: null,
        send(text) {
          if (this.peer) {
            this.peer.onmessage?.({ data: text });
          }
        },
        close() {
          this.readyState = 'closed';
        },
      };
      channelStore.push(channel);
      if (channelStore.length % 2 === 0) {
        const a = channelStore[channelStore.length - 2];
        const b = channelStore[channelStore.length - 1];
        a.peer = b;
        b.peer = a;
      }
      // Delay just enough for the answer-side ondatachannel to also
      // wire its listeners — mimics real RTC where both onopens fire
      // after the negotiation completes.
      if (autoOpen) {
        setTimeout(() => {
          channel.readyState = 'open';
          channel.onopen?.();
        }, 5);
      }
      return channel;
    }
    async createOffer() {
      return { type: 'offer', sdp: 'fake-offer' };
    }
    async createAnswer() {
      return { type: 'answer', sdp: 'fake-answer' };
    }
    async setLocalDescription(d) {
      this.localDescription = d;
    }
    async setRemoteDescription(d) {
      this.remoteDescription = d;
      if (d.type === 'offer') {
        const incoming = {
          readyState: 'connecting',
          label: 'meta-sovereign-sync',
          protocol: channelStore.at(-1)?.protocol ?? '',
          peer: null,
          onopen: null,
          onmessage: null,
          send(text) {
            if (this.peer) {
              this.peer.onmessage?.({ data: text });
            }
          },
          close() {
            this.readyState = 'closed';
          },
        };
        channelStore.push(incoming);
        if (channelStore.length % 2 === 0) {
          const a = channelStore[channelStore.length - 2];
          const b = channelStore[channelStore.length - 1];
          a.peer = b;
          b.peer = a;
        }
        setTimeout(() => {
          this.ondatachannel?.({ channel: incoming });
          if (autoOpen) {
            incoming.readyState = 'open';
            incoming.onopen?.();
          }
        }, 0);
      }
    }
    async addIceCandidate() {
      // no-op for the fake
    }
    close() {
      // no-op
    }
  };

test('signalingChannel routes typed messages by `type`', async () => {
  const bus = makeBus();
  const a = bus.connect('a');
  const b = bus.connect('b');
  const sa = signalingChannel(a);
  const sb = signalingChannel(b);

  const seen = [];
  sb.on('offer', (m) => seen.push(m));
  sa.sendOffer('hi');
  await settle();
  assert.deepEqual(seen, [{ type: 'offer', sdp: 'hi' }]);
});

test('two webrtc transports exchange messages over the data channel', async () => {
  const bus = makeBus();
  const channels = [];
  const Rtc = makeFakeRtc(channels);
  const sa = signalingChannel(bus.connect('a'));
  const sb = signalingChannel(bus.connect('b'));

  const tA = createWebRtcTransport({
    signaling: sa,
    RTCPeerConnection: Rtc,
    initiator: true,
  });
  const tB = createWebRtcTransport({
    signaling: sb,
    RTCPeerConnection: Rtc,
    initiator: false,
  });

  const seenA = [];
  const seenB = [];
  tA.onMessage((m) => seenA.push(m));
  tB.onMessage((m) => seenB.push(m));

  await settle();
  await settle();

  tA.send({ type: 'put', link: { id: 'l:1', tokens: ['x'] } });
  tB.send({ type: 'put', link: { id: 'l:2', tokens: ['y'] } });

  await waitFor(() => seenA.length > 0 && seenB.length > 0);

  assert.equal(seenB[0]?.link.id, 'l:1');
  assert.equal(seenA[0]?.link.id, 'l:2');

  tA.close();
  tB.close();
});

test('webrtc transport queues sends until the data channel opens', async () => {
  const bus = makeBus();
  const channels = [];
  const Rtc = makeFakeRtc(channels, { autoOpen: false });
  const sa = signalingChannel(bus.connect('a'));
  const sb = signalingChannel(bus.connect('b'));

  const tA = createWebRtcTransport({
    signaling: sa,
    RTCPeerConnection: Rtc,
    initiator: true,
  });
  // Queue *before* settle — channel.onopen has not fired yet.
  tA.send({ type: 'put', link: { id: 'l:queued', tokens: ['z'] } });

  const tB = createWebRtcTransport({
    signaling: sb,
    RTCPeerConnection: Rtc,
    initiator: false,
  });
  const seenB = [];
  tB.onMessage((m) => seenB.push(m));

  await waitFor(
    () => channels.length === 2 && channels.every((c) => c.onmessage)
  );
  assert.equal(seenB.length, 0, 'connecting channels retain the queued send');
  // Open both fake endpoints only after their message listeners exist.
  // Timers can otherwise flush the initiator before the receiver is wired
  // on loaded CI runners, unlike real RTC's buffered delivery.
  channels.forEach((channel) => {
    channel.readyState = 'open';
  });
  channels.forEach((channel) => channel.onopen?.());

  await waitFor(() => seenB.length > 0);

  assert.equal(seenB[0]?.link.id, 'l:queued');
  tA.close();
  tB.close();
});

test('late room answers and repeated peer joins cannot renegotiate an active connection', async () => {
  const bus = makeBus();
  const remote = signalingChannel(bus.connect('remote'));
  const errors = [];
  let offers = 0;
  let answers = 0;
  const Rtc = makeFakeRtc([]);
  class StrictRtc extends Rtc {
    async createOffer() {
      offers += 1;
      return super.createOffer();
    }
    async setRemoteDescription(description) {
      if (description.type === 'answer') {
        answers += 1;
        assert.equal(answers, 1, 'only one answer can complete an offer');
      }
      return super.setRemoteDescription(description);
    }
  }
  const transport = createWebRtcTransport({
    signaling: signalingChannel(bus.connect('local')),
    RTCPeerConnection: StrictRtc,
    onError: (error) => errors.push(error),
  });
  remote.sendAnswer('unsolicited');
  await settle();
  assert.equal(answers, 0);
  await Promise.all([
    transport.startAsInitiator(),
    transport.startAsInitiator(),
  ]);
  remote.sendAnswer('first');
  remote.sendAnswer('duplicate');
  await waitFor(() => answers > 0);
  await waitFor(() => transport.pc.localDescription && offers === 1);
  await settle();
  await transport.startAsInitiator();
  assert.equal(offers, 1, 'a joined tab cannot replace the open data channel');
  assert.equal(answers, 1);
  assert.deepEqual(errors, []);
  transport.close();
  remote.sendAnswer('after close');
  await settle();
  assert.equal(answers, 1);
});

test('unexpected SDP failures are reported without an unhandled rejection', async () => {
  const bus = makeBus();
  const remote = signalingChannel(bus.connect('remote'));
  const errors = [];
  class FailingRtc extends makeFakeRtc([]) {
    async setRemoteDescription() {
      throw new Error('invalid remote SDP');
    }
  }
  const transport = createWebRtcTransport({
    signaling: signalingChannel(bus.connect('local')),
    RTCPeerConnection: FailingRtc,
    onError: (error) => errors.push(error.message),
  });
  remote.sendOffer('broken');
  await waitFor(() => errors.length > 0);
  assert.deepEqual(errors, ['invalid remote SDP']);
  transport.close();
});

test(
  'binary WebRTC preserves typed values and advertises the Lino protocol',
  { timeout: 3000 },
  async () => {
    const bus = makeBus();
    const channels = [];
    const Rtc = makeFakeRtc(channels, { autoOpen: false });
    const errors = [];
    const options = {
      RTCPeerConnection: Rtc,
      format: 'application/lino-binary',
      onError: (error) => errors.push(error),
    };
    const a = createWebRtcTransport({
      ...options,
      signaling: signalingChannel(bus.connect('a')),
      initiator: true,
    });
    const b = createWebRtcTransport({
      ...options,
      signaling: signalingChannel(bus.connect('b')),
    });
    try {
      const seen = [];
      b.onMessage((message) => seen.push(message));
      const value = {
        type: 'put',
        link: {
          id: 'l:🚀',
          body: '你好\r\nПривет',
          single: [true],
          empty: [],
          value: null,
        },
      };
      a.send(value);
      await waitFor(
        () =>
          channels.length === 2 &&
          channels.every((channel) => channel.onmessage)
      );
      channels.forEach((channel) => {
        channel.readyState = 'open';
      });
      channels.forEach((channel) => channel.onopen?.());
      await waitFor(() => seen.length === 1);
      assert.deepEqual(seen, [value]);
      assert.ok(
        channels.every(
          (channel) =>
            channel.protocol === 'meta-sovereign-sync.lino-binary.v2' &&
            channel.binaryType === 'arraybuffer'
        )
      );
      assert.deepEqual(errors, []);
    } finally {
      a.close();
      b.close();
    }
  }
);

test('WebRTC refuses an unversioned data channel instead of accepting JSON', () => {
  const errors = [];
  const transport = createWebRtcTransport({
    signaling: signalingChannel(makeBus().connect('a')),
    RTCPeerConnection: makeFakeRtc([]),
    onError: (error) => errors.push(error.message),
  });
  let closed = false;
  try {
    transport.pc.ondatachannel({
      channel: {
        protocol: '',
        close: () => {
          closed = true;
        },
      },
    });
    assert.equal(closed, true);
    assert.deepEqual(errors, ['unsupported WebRTC sync protocol']);
  } finally {
    transport.close();
  }
});

test(
  'early ICE waits for a remote description and is bounded during negotiation',
  { timeout: 3000 },
  async () => {
    const bus = makeBus();
    const remote = signalingChannel(bus.connect('remote'));
    const candidates = [];
    const errors = [];
    class IceRtc extends makeFakeRtc([]) {
      async addIceCandidate(candidate) {
        assert.ok(
          this.remoteDescription,
          'remote description precedes candidates'
        );
        candidates.push(candidate);
      }
    }
    const transport = createWebRtcTransport({
      signaling: signalingChannel(bus.connect('local')),
      RTCPeerConnection: IceRtc,
      onError: (error) => errors.push(error.message),
    });
    try {
      for (let index = 0; index < 129; index++) {
        remote.sendIce({ candidate: `fixture-${index}` });
      }
      assert.equal(candidates.length, 0);
      assert.deepEqual(errors, ['too many pending WebRTC ICE candidates']);
      remote.sendOffer('fixture');
      await waitFor(() => candidates.length === 128);
      assert.equal(candidates.length, 128);
      assert.equal(candidates[0].candidate, 'fixture-0');
      assert.equal(candidates.at(-1).candidate, 'fixture-127');
      transport.close();
      remote.sendIce({ candidate: 'closed' });
      assert.equal(candidates.length, 128);
    } finally {
      transport.close();
    }
  }
);
