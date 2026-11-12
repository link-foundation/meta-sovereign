import { createWebRtcTransport, signalingChannel } from './webrtc-transport.js';

/** One disposable connection per broker-owned remote identity. */
export const createWebRtcMesh = ({
  signaling,
  connect,
  createTransport = createWebRtcTransport,
  onState = () => {},
  onError = () => {},
  ...options
}) => {
  const connections = new Map();
  let closed = false;
  const remove = (id) => {
    const entry = connections.get(id);
    if (!entry) {
      return;
    }
    connections.delete(id);
    try {
      entry.detach();
    } finally {
      entry.transport.close();
      onState({ phase: 'removed', peers: connections.size });
    }
  };
  const ensure = (id) => {
    if (!connections.has(id)) {
      const handlers = new Set();
      const directed = signalingChannel({
        send: (event) => signaling.raw.send({ ...event, to: id }),
        onMessage: (handler) => handlers.add(handler),
      });
      const transport = createTransport({
        ...options,
        signaling: directed,
        onError,
      });
      const entry = { transport, handlers, detach: () => {} };
      connections.set(id, entry);
      try {
        entry.detach = connect(transport);
      } catch (error) {
        remove(id);
        throw error;
      }
      onState({ phase: 'created', peers: connections.size });
    }
    return connections.get(id);
  };
  const off = signaling.on('*', (event) => {
    if (closed) {
      return;
    }
    try {
      if (event.type === 'peer-left') {
        remove(event.peerId);
      } else if (
        event.type === 'peer-joined' &&
        typeof event.peerId === 'string'
      ) {
        Promise.resolve(
          ensure(event.peerId).transport.startAsInitiator()
        ).catch(onError);
      } else if (
        ['offer', 'answer', 'ice'].includes(event.type) &&
        typeof event.from === 'string'
      ) {
        // An offer/early ICE may be the newcomer's first sight of this peer.
        const entry =
          connections.get(event.from) ??
          (event.type !== 'answer' ? ensure(event.from) : null);
        entry?.handlers.forEach((handler) => handler(event));
      }
    } catch (error) {
      onError(error);
    }
  });
  return {
    connections,
    close() {
      closed = true;
      off();
      for (const id of [...connections.keys()]) {
        remove(id);
      }
    },
  };
};
