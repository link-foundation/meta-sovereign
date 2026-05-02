/**
 * End-to-end test for the offline-first SPA data layer.
 *
 * Walks the critical UI paths the user can exercise without any
 * server, then with a server, then between two browsers over the
 * (faked) WebRTC transport — at the layer of state that the views
 * read. A real headless-browser pass via Playwright would drive the
 * same paths through `app.js`; this suite pins the underlying
 * contract so a regression in the data layer surfaces immediately
 * without spinning up a browser.
 *
 *   1. Offline boot: pick the in-memory driver, write a link,
 *      confirm `client.links()` and the local autocomplete fallback
 *      see it. Verify the DDD bus runs the broadcast handler when a
 *      `broadcast:*` link is written, even with no server.
 *   2. Server discovery: a stub `/api/status` answers on one
 *      candidate and the discovery cascade picks it. The client
 *      flips into online mode, server-side autocomplete is used,
 *      then a server failure flips back to offline.
 *   3. WebRTC sync: two peers each own a browser-store, hand a
 *      shared `signaling` bus to `createWebRtcTransport`, and
 *      `Peer.connect` mirrors writes through the data channel.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBrowserStore,
  createInMemoryDriver,
} from '../src/storage/browser-store.js';
import { createHandlerBus, broadcastHandler } from '../src/handlers/index.js';
import { discoverServer } from '../src/web/discover.js';
import { createOfflineClient } from '../src/web/client.js';
import {
  createPeer,
  signalingChannel,
  createWebRtcTransport,
} from '../src/sync/index.js';

const settle = () => new Promise((r) => setTimeout(r, 5));

test('offline boot: write a link, see it locally, run a broadcast handler with no server', async () => {
  const store = await createBrowserStore({ driver: createInMemoryDriver() });
  const sent = [];
  const bus = createHandlerBus(store);
  const built = broadcastHandler({
    broadcast: async (networks, body) => {
      for (const n of networks) {
        sent.push({ network: n, body });
      }
      return networks.map((n) => ({ network: n, ok: true }));
    },
  });
  bus.register('broadcast', built.selector, built.run);

  const client = createOfflineClient({ store, server: null });
  assert.equal(client.isOnline(), false);

  await client.put({
    id: 'msg:telegram:hello',
    tokens: ['message', 'telegram', 'hello'],
    sender: 'me',
    source: 'telegram',
    body: 'where do we ship next?',
  });

  const ids = (await client.links()).map((l) => l.id).sort();
  assert.deepEqual(ids, ['msg:telegram:hello']);

  // Local autocomplete: the offline client must fall through to the
  // in-process compute when no server is wired.
  const ac = await client.autocomplete('ship');
  assert.equal(ac[0]?.text, 'where do we ship next?');

  // Writing a broadcast link is the API: the handler runs without a
  // server and stamps `dispatched: true`.
  await client.broadcast({
    id: 'broadcast:1',
    text: 'shipping at noon',
    networks: ['telegram', 'vk'],
  });
  await settle();

  assert.deepEqual(sent.map((s) => s.network).sort(), ['telegram', 'vk']);
  const stamped = await store.get('broadcast:1');
  assert.equal(stamped.dispatched, true);
  assert.ok(stamped.handledBy?.broadcast, 'handler stamp must land');

  bus.close();
});

test('server discovery picks the first reachable candidate, then degrades on failure', async () => {
  const calls = [];
  let serverUp = true;
  const fetchImpl = async (url) => {
    calls.push(url);
    if (!serverUp) {
      throw new Error('refused');
    }
    if (url === 'http://127.0.0.1:8787/api/status') {
      return {
        ok: true,
        json: async () => ({ count: 0, online: true }),
      };
    }
    if (url.startsWith('http://127.0.0.1:8787/api/autocomplete')) {
      return {
        ok: true,
        json: async () => [{ text: 'from-server', count: 1 }],
      };
    }
    return { ok: false, json: async () => ({}) };
  };
  const storage = (() => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, v),
      removeItem: (k) => m.delete(k),
    };
  })();

  const discovered = await discoverServer({
    fetchImpl,
    storage,
    origin: undefined,
    candidates: [],
  });
  assert.equal(discovered?.origin, 'http://127.0.0.1:8787');

  const store = await createBrowserStore({ driver: createInMemoryDriver() });
  await store.put({
    id: 'msg:telegram:1',
    sender: 'me',
    source: 'telegram',
    body: 'local-only-fallback',
  });
  const client = createOfflineClient({
    store,
    server: { origin: discovered.origin, fetchImpl },
  });

  // Online: server reply wins over the local computation.
  const acOnline = await client.autocomplete('from');
  assert.equal(acOnline[0]?.text, 'from-server');

  // Server flaps. The next call falls back and the client emits a
  // mode-change event.
  const events = [];
  client.on((e) => events.push(e));
  serverUp = false;
  const acFlap = await client.autocomplete('local');
  assert.equal(acFlap[0]?.text, 'local-only-fallback');
  assert.equal(client.isOnline(), false);
  assert.deepEqual(events, [{ type: 'mode-change', online: false }]);
});

test('two browsers sync via WebRTC: writing a link on A appears on B', async () => {
  // Shared loopback bus so both signaling channels see each other's
  // offer/answer/ice messages.
  const handlersByLabel = new Map();
  const post = (from, msg) => {
    for (const [label, set] of handlersByLabel) {
      if (label === from) {
        continue;
      }
      for (const h of set) {
        h(msg);
      }
    }
  };
  const sigTransport = (label) => {
    handlersByLabel.set(label, new Set());
    return {
      send: (msg) => post(label, msg),
      onMessage: (h) => {
        handlersByLabel.get(label).add(h);
        return () => handlersByLabel.get(label).delete(h);
      },
    };
  };

  // Fake RTC: pair channels in arrival order, like the unit-test
  // double in webrtc-transport.test.js.
  const channels = [];
  const FakeRtc = class {
    constructor() {
      this.onicecandidate = null;
      this.ondatachannel = null;
    }
    createDataChannel(label) {
      const ch = {
        readyState: 'connecting',
        label,
        peer: null,
        onopen: null,
        onmessage: null,
        send(text) {
          this.peer?.onmessage?.({ data: text });
        },
        close() {
          this.readyState = 'closed';
        },
      };
      channels.push(ch);
      if (channels.length % 2 === 0) {
        const a = channels[channels.length - 2];
        const b = channels[channels.length - 1];
        a.peer = b;
        b.peer = a;
      }
      setTimeout(() => {
        ch.readyState = 'open';
        ch.onopen?.();
      }, 5);
      return ch;
    }
    async createOffer() {
      return { type: 'offer', sdp: 'fake' };
    }
    async createAnswer() {
      return { type: 'answer', sdp: 'fake' };
    }
    async setLocalDescription(d) {
      this.localDescription = d;
    }
    async setRemoteDescription(d) {
      this.remoteDescription = d;
      if (d.type === 'offer') {
        const ch = {
          readyState: 'connecting',
          label: 'meta-sovereign-sync',
          peer: null,
          onopen: null,
          onmessage: null,
          send(text) {
            this.peer?.onmessage?.({ data: text });
          },
          close() {
            this.readyState = 'closed';
          },
        };
        channels.push(ch);
        if (channels.length % 2 === 0) {
          const a = channels[channels.length - 2];
          const b = channels[channels.length - 1];
          a.peer = b;
          b.peer = a;
        }
        setTimeout(() => {
          this.ondatachannel?.({ channel: ch });
          ch.readyState = 'open';
          ch.onopen?.();
        }, 0);
      }
    }
    async addIceCandidate() {}
    close() {}
  };

  const storeA = await createBrowserStore({ driver: createInMemoryDriver() });
  const storeB = await createBrowserStore({ driver: createInMemoryDriver() });
  const peerA = createPeer(storeA, { node: 'a' });
  const peerB = createPeer(storeB, { node: 'b' });

  const sigA = signalingChannel(sigTransport('a'));
  const sigB = signalingChannel(sigTransport('b'));
  const tA = createWebRtcTransport({
    signaling: sigA,
    RTCPeerConnection: FakeRtc,
    initiator: true,
  });
  const tB = createWebRtcTransport({
    signaling: sigB,
    RTCPeerConnection: FakeRtc,
    initiator: false,
  });
  peerA.connect(tA);
  peerB.connect(tB);

  await settle();
  await settle();

  await storeA.put({
    id: 'msg:telegram:42',
    tokens: ['message'],
    sender: 'me',
    body: 'sync me over rtc',
  });

  await settle();
  await settle();

  const onB = await storeB.get('msg:telegram:42');
  assert.equal(onB?.body, 'sync me over rtc');

  tA.close();
  tB.close();
});
