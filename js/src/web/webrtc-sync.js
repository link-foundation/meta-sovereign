/**
 * Browser-side WebRTC sync wiring.
 *
 * Browser stores replicate over a peer-to-peer WebRTC data channel.
 * The server's `/rtc` endpoint relays signaling; application records
 * travel directly between the browser stores (R-J7).
 *
 * The broker assigns each remote socket a fresh identity. Existing peers
 * initiate one addressed connection for each newcomer; offers and early ICE
 * create the newcomer's matching follower. Departures dispose only that pair.
 * A reload therefore receives fresh connections without replacing other peers.
 * Application records remain on data channels, separate from signaling.
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
import { signalingChannel } from '../sync/webrtc-transport.js';
import { createWebRtcMesh } from '../sync/webrtc-mesh.js';
import { debugBrowser } from './client-log.js';
import { createPeer } from '../sync/peer.js';
import { syncWire, syncQueue } from '../sync/wire.js';
import { CURRENT_SCHEMA } from '../storage/migrations/index.js';

const wrapBrowserWebSocket = (ws, wire, onError) => {
  const queue = syncQueue();
  ws.binaryType = 'arraybuffer';
  ws.addEventListener('open', () => {
    if (ws.protocol !== wire.protocol) {
      onError(new Error('signaling sync protocol was not negotiated'));
      ws.close();
      return;
    }
    queue.drain((event) => ws.send(wire.encode(event)));
  });
  ws.addEventListener('close', () => queue.clear());
  ws.addEventListener('error', () =>
    onError(new Error('signaling connection failed'))
  );
  const handlers = new Set();
  ws.addEventListener('message', (event) => {
    let parsed;
    try {
      parsed = wire.decode(event.data);
    } catch (error) {
      onError(error);
      ws.close(1003, 'invalid signaling message');
      return;
    }
    for (const h of handlers) {
      h(parsed);
    }
  });
  return {
    send(msg) {
      const data = wire.encode(msg);
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      } else if (ws.readyState === ws.CONNECTING) {
        queue.push(msg);
      } else {
        throw new Error('signaling connection is closed');
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
  capabilities,
  room = 'default',
  RTCPeerConnection = globalThis.RTCPeerConnection,
  WebSocketImpl = globalThis.WebSocket,
  rtcConfig = { iceServers: [] },
  format,
  jsonCompatibility = false,
  onMismatch = () => {},
  onError = (error) =>
    globalThis.console?.warn?.('WebRTC negotiation failed', error),
} = {}) => {
  if (
    capabilities?.webRtcSync === false ||
    !RTCPeerConnection ||
    !WebSocketImpl
  ) {
    return null;
  }
  const wsUrl = (() => {
    const u = new URL(origin);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/rtc';
    u.searchParams.set('room', room);
    return u.toString();
  })();
  const wire = syncWire({ format, jsonCompatibility });
  const ws = new WebSocketImpl(wsUrl, wire.protocol);
  const wsTransport = wrapBrowserWebSocket(ws, wire, onError);
  const signaling = signalingChannel(wsTransport);
  // A browser and a peer of another data schema exchange nothing (R-Z17).
  const peer = createPeer(store, {
    node: 'web',
    schemaVersion: CURRENT_SCHEMA,
    onMismatch,
  });
  const mesh = createWebRtcMesh({
    signaling,
    RTCPeerConnection,
    rtcConfig,
    format,
    jsonCompatibility,
    connect: (transport) => peer.connect(transport),
    onState: (state) => debugBrowser('rtc-peer', state),
    onError,
  });
  ws.addEventListener('close', () => mesh.close());
  return {
    mesh,
    peer,
    close() {
      mesh.close();
      ws.close();
    },
  };
};
