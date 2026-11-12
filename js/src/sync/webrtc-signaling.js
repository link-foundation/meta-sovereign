/**
 * Minimal WebRTC signaling broker.
 *
 * Two browsers that want to open an `RTCDataChannel` to each other
 * exchange SDP offers / answers and ICE candidates. The bytes can
 * flow over any transport — we use a tiny WebSocket relay mounted
 * on the http server so the SPA only needs one origin.
 *
 * Each WebSocket joins a *room* identified by a path query
 * (`?room=foo`). Addressed Lino SDP/ICE goes only to its named room member;
 * legacy untargeted signaling still fans out within the room. It is *not* a TURN server; once peers have
 * exchanged candidates they talk directly. The broker holds zero
 * application state — losing it just means new peers can't find
 * each other until it reboots.
 */

import {
  isWebSocketUpgrade,
  writeAcceptHandshake,
  encodeTextFrame,
  encodeBinaryFrame,
  encodePongFrame,
  createFrameReader,
  rejectForeignOrigin,
} from './ws-frame.js';
import { bunAttachSignaling } from './bun-server.js';

import { negotiateSync } from './wire.js';
import { createSignalingRooms } from './signaling-room.js';

const IS_BUN = typeof globalThis.Bun !== 'undefined';

export const attachSignaling = (
  server,
  { path = '/rtc', verifyOrigin = null, jsonCompatibility = false } = {}
) => {
  if (IS_BUN) {
    return bunAttachSignaling(server, {
      path,
      verifyOrigin,
      jsonCompatibility,
    });
  }
  const formats = new WeakMap();
  const frameFor = (socket, event) => {
    const wire = formats.get(socket);
    const data = wire.encode(event);
    return wire.binary ? encodeBinaryFrame(data) : encodeTextFrame(data);
  };

  const relay = createSignalingRooms((socket, event) =>
    socket.write(frameFor(socket, event))
  );
  const { rooms } = relay;

  const onUpgrade = (req, socket) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== path) {
      // Leave non-matching paths to other upgrade handlers.
      return;
    }
    if (rejectForeignOrigin(req, socket, verifyOrigin)) {
      return;
    }
    if (!isWebSocketUpgrade(req)) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    const room = url.searchParams.get('room') ?? 'default';
    const selected = negotiateSync(req.headers['sec-websocket-protocol'], {
      jsonCompatibility,
    });
    if (!selected) {
      socket.end('HTTP/1.1 406 Not Acceptable\r\nConnection: close\r\n\r\n');
      return;
    }
    writeAcceptHandshake(socket, req, selected.protocol);
    formats.set(socket, selected.wire);
    relay.join(room, socket);

    const receive = (data) => {
      let event;
      try {
        event = selected.wire.decode(data);
      } catch {
        socket.destroy();
        return;
      }
      relay.receive(room, socket, event);
    };
    const reader = createFrameReader({
      onText: receive,
      onBinary: receive,
      onClose: () => {
        relay.leave(room, socket);
        socket.destroy();
      },
      onPing: (payload) => socket.write(encodePongFrame(payload)),
    });
    socket.on('data', reader);
    socket.on('end', () => {
      relay.leave(room, socket);
      socket.destroy();
    });
    socket.on('close', () => relay.leave(room, socket));
    socket.on('error', () => relay.leave(room, socket));
  };

  server.on('upgrade', onUpgrade);

  return {
    close: () => {
      server.removeListener('upgrade', onUpgrade);
      for (const peers of rooms.values()) {
        for (const s of peers.keys()) {
          s.destroy();
        }
      }
      rooms.clear();
    },
    rooms: () => [...rooms.keys()],
    peers: (room) => rooms.get(room)?.size ?? 0,
  };
};
