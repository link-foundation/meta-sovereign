/** Shared Node/Bun room membership and server-owned signaling identities. */
export const createSignalingRooms = (send) => {
  const rooms = new Map();
  const signalTypes = new Set(['offer', 'answer', 'ice']);
  const deliver = (socket, event) => {
    try {
      send(socket, event);
    } catch {
      // A departing socket must not prevent notification of other members.
    }
  };
  return {
    rooms,
    join(room, socket) {
      if (!rooms.has(room)) {
        rooms.set(room, new Map());
      }
      const members = rooms.get(room);
      const peerId = globalThis.crypto.randomUUID();
      members.set(socket, peerId);
      for (const other of members.keys()) {
        if (other !== socket) {
          deliver(other, { type: 'peer-joined', peerId });
        }
      }
      return peerId;
    },
    leave(room, socket) {
      const members = rooms.get(room);
      const peerId = members?.get(socket);
      if (!peerId || !members.delete(socket)) {
        return;
      }
      if (!members.size) {
        rooms.delete(room);
      }
      for (const other of members.keys()) {
        deliver(other, { type: 'peer-left', peerId });
      }
    },
    receive(room, socket, event) {
      const members = rooms.get(room);
      const from = members?.get(socket);
      if (!from || !signalTypes.has(event?.type)) {
        return;
      }
      // Never trust a client-supplied sender or membership announcement.
      // Untargeted legacy SDP still fans out, with an authoritative sender.
      for (const [other, id] of members) {
        if (other !== socket && (event.to === undefined || event.to === id)) {
          deliver(other, { ...event, from });
        }
      }
    },
  };
};
