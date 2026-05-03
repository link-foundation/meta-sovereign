/**
 * Sync layer (R-F5).
 *
 * Last-writer-wins-per-link CRDT seed: every link carries a `version`
 * (Lamport-style). `merge(a, b)` picks the higher version on conflict
 * and union of children otherwise. `Peer` is transport-agnostic — the
 * WebRTC adapter is plumbed via `Peer.connect(transport)` so the same
 * code runs over loopback in tests, WebSocket on a server, or
 * RTCDataChannel in the browser.
 *
 * Transport-agnostic primitives live in `./peer.js` so browser code
 * can import them without pulling in the Node-only TCP / WebSocket
 * server transports re-exported below.
 */

export {
  tickVersion,
  cmp,
  vcInit,
  vcTick,
  vcMerge,
  vcCompare,
  merge,
  createPeer,
  loopback,
} from './peer.js';

export { startSyncListener, connectSyncPeer } from './tcp-transport.js';
export {
  attachSyncWebSocket,
  startSyncWebSocketListener,
  connectSyncWebSocket,
} from './ws-transport.js';
export { attachSignaling } from './webrtc-signaling.js';
export { signalingChannel, createWebRtcTransport } from './webrtc-transport.js';
