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

const makeFakeRtc = (channelStore) =>
  class FakeRtcPeerConnection {
    constructor() {
      this.localDescription = null;
      this.remoteDescription = null;
      this.onicecandidate = null;
      this.ondatachannel = null;
      this.iceCandidates = [];
    }
    createDataChannel(label) {
      const channel = {
        readyState: 'connecting',
        label,
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
      setTimeout(() => {
        channel.readyState = 'open';
        channel.onopen?.();
      }, 5);
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
          incoming.readyState = 'open';
          incoming.onopen?.();
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

  await settle();
  await settle();

  assert.equal(seenB[0]?.link.id, 'l:1');
  assert.equal(seenA[0]?.link.id, 'l:2');

  tA.close();
  tB.close();
});

test('webrtc transport queues sends until the data channel opens', async () => {
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
  // Queue *before* settle — channel.onopen has not fired yet.
  tA.send({ type: 'put', link: { id: 'l:queued', tokens: ['z'] } });

  const tB = createWebRtcTransport({
    signaling: sb,
    RTCPeerConnection: Rtc,
    initiator: false,
  });
  const seenB = [];
  tB.onMessage((m) => seenB.push(m));

  await settle();
  await settle();

  assert.equal(seenB[0]?.link.id, 'l:queued');
  tA.close();
  tB.close();
});
