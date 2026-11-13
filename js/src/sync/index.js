/**
 * Sync layer (R-F5).
 *
 * A max register per link with a joined observed clock and a grow-only set
 * of children. Vector writes retain their original winning clock in the
 * schema-11 stamp when the observed clock grows. New causal assignments
 * must tick the observed clock; ordinary unversioned writes have no causal
 * ordering. Decimal tickVersion counters compare numerically. `Peer` is
 * transport-agnostic — the
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
