/**
 * Minimal WebRTC signaling broker.
 *
 * Two browsers that want to open an `RTCDataChannel` to each other
 * exchange SDP offers / answers and ICE candidates. The bytes can
 * flow over any transport — we use a tiny WebSocket relay mounted
 * on the http server so the SPA only needs one origin.
 *
 * Each WebSocket joins a *room* identified by a path query
 * (`?room=foo`). The broker fans every JSON frame to every other
 * peer in the same room. It is *not* a TURN server; once peers have
 * exchanged candidates they talk directly. The broker holds zero
 * application state — losing it just means new peers can't find
 * each other until it reboots.
 */

import {
  isWebSocketUpgrade,
  writeAcceptHandshake,
  encodeTextFrame,
  createFrameReader,
} from './ws-frame.js';

export const attachSignaling = (server, { path = '/rtc' } = {}) => {
  const rooms = new Map();

  const join = (room, socket) => {
    if (!rooms.has(room)) {
      rooms.set(room, new Set());
    }
    rooms.get(room).add(socket);
  };

  const leave = (room, socket) => {
    rooms.get(room)?.delete(socket);
    if (rooms.get(room)?.size === 0) {
      rooms.delete(room);
    }
  };

  const onUpgrade = (req, socket) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== path) {
      // Leave non-matching paths to other upgrade handlers.
      return;
    }
    if (!isWebSocketUpgrade(req)) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    const room = url.searchParams.get('room') ?? 'default';
    writeAcceptHandshake(socket, req);
    join(room, socket);

    // Notify the room the new peer arrived so existing peers can
    // initiate. We mark the announcement so peers can ignore their
    // own.
    const peerId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const announce = encodeTextFrame(
      JSON.stringify({ type: 'peer-joined', peerId })
    );
    for (const other of rooms.get(room)) {
      if (other !== socket) {
        other.write(announce);
      }
    }

    const reader = createFrameReader({
      onText: (text) => {
        const frame = encodeTextFrame(text);
        for (const other of rooms.get(room) ?? []) {
          if (other !== socket) {
            other.write(frame);
          }
        }
      },
      onClose: () => {
        leave(room, socket);
        socket.destroy();
      },
      onPing: () => socket.write(Buffer.from([0x8a, 0x00])),
    });
    socket.on('data', reader);
    socket.on('close', () => leave(room, socket));
    socket.on('error', () => leave(room, socket));
  };

  server.on('upgrade', onUpgrade);

  return {
    close: () => {
      server.removeListener('upgrade', onUpgrade);
      for (const peers of rooms.values()) {
        for (const s of peers) {
          s.destroy();
        }
      }
      rooms.clear();
    },
    rooms: () => [...rooms.keys()],
    peers: (room) => rooms.get(room)?.size ?? 0,
  };
};
