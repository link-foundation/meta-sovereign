/**
 * Browser-side WebRTC sync wiring.
 *
 * The SPA already replicates writes over `/ws` when a server is
 * reachable. This module adds a *peer-to-peer* WebRTC data channel
 * alongside that path so two browsers can talk without the server
 * relaying every message (R-J7).
 *
 * Wire-up:
 *   1. Open a browser `WebSocket` to `/rtc?room=<room>` on the
 *      discovered server. The signaling broker fans JSON frames to
 *      everyone else in the same room.
 *   2. Wrap that WebSocket in a `signalingChannel` so SDP / ICE
 *      messages are typed.
 *   3. Construct `createWebRtcTransport({ initiator: false, ... })` —
 *      both peers start as followers. When a `peer-joined` event
 *      arrives (meaning a *new* peer just entered the room behind
 *      us), we know we're the existing one so we call
 *      `transport.startAsInitiator()` to send the offer. The newcomer
 *      sees the offer first and answers it; no race.
 *   4. Plug the transport into `createPeer(store).connect(transport)`
 *      so every local write fans out over the data channel and
 *      remote writes flow into the local store.
 *
 * The room defaults to `default`; production deployments that want
 * tenant isolation can set it from the URL or a config endpoint.
 *
 * `secret:*` links are filtered by `createPeer` itself — they never
 * traverse this transport (or any sync transport).
 */

// Import from leaf files instead of `sync/index.js` so the browser
// bundle does not pull in `node:net` / `node:http` (re-exported by
// the TCP/WebSocket *server* transports through index.js).
import {
  signalingChannel,
  createWebRtcTransport,
} from '../sync/webrtc-transport.js';
import { createPeer } from '../sync/peer.js';

const wrapBrowserWebSocket = (ws) => {
  const handlers = new Set();
  ws.addEventListener('message', (event) => {
    let parsed;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      return;
    }
    for (const h of handlers) {
      h(parsed);
    }
  });
  return {
    send(msg) {
      const text = JSON.stringify(msg);
      if (ws.readyState === ws.OPEN) {
        ws.send(text);
      } else {
        ws.addEventListener('open', () => ws.send(text), { once: true });
      }
    },
    onMessage(h) {
      handlers.add(h);
      return () => handlers.delete(h);
    },
  };
};

export const attachWebRtcSync = ({
  store,
  origin,
  room = 'default',
  RTCPeerConnection = globalThis.RTCPeerConnection,
  WebSocketImpl = globalThis.WebSocket,
  rtcConfig = { iceServers: [] },
} = {}) => {
  if (!RTCPeerConnection || !WebSocketImpl) {
    return null;
  }
  const wsUrl = (() => {
    const u = new URL(origin);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/rtc';
    u.searchParams.set('room', room);
    return u.toString();
  })();
  const ws = new WebSocketImpl(wsUrl);
  const wsTransport = wrapBrowserWebSocket(ws);
  const signaling = signalingChannel(wsTransport);
  const transport = createWebRtcTransport({
    signaling,
    RTCPeerConnection,
    initiator: false,
    rtcConfig,
  });
  // Existing peers (us, until someone else joins) become initiator
  // when the broker says a new peer arrived.
  signaling.on('peer-joined', () => {
    transport.startAsInitiator().catch(() => {});
  });
  const peer = createPeer(store, { node: 'web' });
  const detach = peer.connect(transport);
  return {
    transport,
    peer,
    close() {
      try {
        detach();
      } catch {
        // ignore
      }
      try {
        transport.close();
      } catch {
        // ignore
      }
      try {
        ws.close();
      } catch {
        // ignore
      }
    },
  };
};
