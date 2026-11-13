/**
 * Transport-agnostic peer + CRDT primitives.
 *
 * Lives in its own file so the browser bundle can import `createPeer`
 * without dragging in `node:net` / `node:http` (which the TCP and
 * WebSocket *server* transports re-export from `sync/index.js`).
 */

import { isolatePeerTransport } from './peer-transport.js';
import { createPeerReceiver } from './peer-receiver.js';
import { createRelayIdentity, createRelayOutbox } from './peer-relay.js';
import { merge } from './register.js';
import { createReconciliation } from './peer-reconcile.js';
export { merge } from './register.js';
export {
  tickVersion,
  cmp,
  vcInit,
  vcTick,
  vcMerge,
  vcCompare,
} from './clock.js';

// Secrets and the schema marker never leave the store (R-Z2, R-Z17): each
// side's `meta:schema` is its own.
const isSecretEvent = (event) =>
  event &&
  event.link &&
  typeof event.link.id === 'string' &&
  (event.link.id.startsWith('secret:') || event.link.id === 'meta:schema');

const HELLO = 'hello';

/** The refusal text, naming both versions; the older side must update. */
export const schemaMismatch = (local, remote) => {
  const older =
    remote === null || remote < local ? 'the other side' : 'this side';
  return Object.assign(
    new Error(
      `SCHEMA_MISMATCH: this side is at data schema ${local}, the other side at ${remote ?? 'an unversioned build'}; ${older} must update the app. No data was exchanged.`
    ),
    { code: 'SCHEMA_MISMATCH', local, remote }
  );
};

export const createPeer = (
  store,
  {
    node = 'local',
    schemaVersion,
    onMismatch = () => {},
    hub = false,
    onState = () => {},
    reconciliation = {},
    onError = (error) =>
      globalThis.console?.warn?.('Sync transport failed', error),
  } = {}
) => {
  const subs = new Set();
  const transports = new Set();
  const identity = createRelayIdentity();
  const report = (error) => {
    try {
      onError(error);
    } catch {
      /* Diagnostics cannot interrupt persistence. */
    }
  };
  const send = (event) => {
    for (const handler of transports) {
      handler(event);
    }
  };
  const outbox = hub ? createRelayOutbox(send, report) : { local: send };
  const receiver = createPeerReceiver(
    store,
    merge,
    onState,
    hub ? (event) => outbox.reserve(event) : undefined
  );
  const subscribe = (handler) => {
    transports.add(handler);
    return () => transports.delete(handler);
  };
  store.subscribe((event) => {
    if (receiver.suppresses(event)) {
      return;
    }
    if (isSecretEvent(event)) {
      return;
    }
    if (transports.size) {
      outbox.local(identity.local(event));
    }
    for (const s of subs) {
      s(event);
    }
  });
  return {
    node,
    onLocal(handler) {
      subs.add(handler);
      return () => subs.delete(handler);
    },
    async receive(event) {
      if (isSecretEvent(event) || !['put', 'delete'].includes(event?.type)) {
        return;
      }
      if (!event.link || typeof event.link.id !== 'string') {
        throw Object.assign(new Error('Sync mutation requires a link id'), {
          code: 'SYNC_RELAY_INVALID',
        });
      }
      const accepted = identity.accept(event);
      if (!accepted) {
        return;
      }
      let applied = false;
      try {
        await receiver.receive(accepted);
        applied = true;
      } finally {
        identity.finish(accepted, applied);
      }
    },
    /**
     * Plug a transport in. With `schemaVersion` set (R-Z17) every event
     * carries it and the peer says `{ type: 'hello', schema }` on connect;
     * an event or hello of another version is not applied, and
     * `onMismatch(error)` hears SCHEMA_MISMATCH once per version seen. A
     * peer without a version (or an old build) speaks as before. `hub`:
     * the transport fans out to many sockets, so one wrong one must not
     * silence the rest. Hubs relay successful remote mutations to their
     * connected transports. Bounded operation routes prevent cycles; pending
     * persistence keeps later owner events in admission order. Built-in causal
     * stores also reconcile existing records and deletion clocks after matching
     * schema negotiation, with one durably acknowledged record per session.
     */
    connect(transport) {
      const isolated = isolatePeerTransport(transport, onError);
      return schemaVersion === undefined
        ? plug(this, isolated, null, subscribe)
        : plug(
            this,
            isolated,
            { local: schemaVersion, onMismatch, hub },
            subscribe,
            reconciliation === false
              ? null
              : {
                  store,
                  send: (event) => transport.send(event),
                  report,
                  onState,
                  options: reconciliation,
                }
          );
    },
  };
};

// Connect `peer` to `transport`; `gate` (or null) is the schema check.
const plug = (peer, transport, gate, subscribe, reconciliation) => {
  const history = reconciliation
    ? createReconciliation({
        ...reconciliation,
        schema: gate.local,
        receive: (event) => peer.receive(event),
      })
    : null;
  let disconnected = false;
  const stop = (offLocal, offRemote) => () => {
    disconnected = true;
    offLocal();
    if (typeof offRemote === 'function') {
      offRemote();
    }
    history?.close();
  };
  if (!gate) {
    return stop(
      subscribe((e) => transport.send(e)),
      transport.onMessage((e) => (disconnected ? undefined : peer.receive(e)))
    );
  }
  const seen = new Set();
  let refused = false;
  const mismatch = (remote) => {
    refused = !gate.hub;
    if (refused) {
      history?.close();
    }
    if (!seen.has(remote)) {
      seen.add(remote);
      gate.onMismatch(schemaMismatch(gate.local, remote));
    }
  };
  const offLocal = subscribe((e) => {
    if (!refused) {
      transport.send({ ...e, schema: gate.local });
    }
  });
  const offRemote = transport.onMessage((e) => {
    if (disconnected || refused || (history && !history.addressed(e))) {
      return undefined;
    }
    const remote = Number.isInteger(e?.schema) ? e.schema : null;
    if (remote !== gate.local) {
      mismatch(remote);
      return undefined;
    }
    if (history?.handles(e)) {
      return history.receive(e);
    }
    return e.type === HELLO ? undefined : peer.receive(e);
  });
  transport.send(history?.hello() ?? { type: HELLO, schema: gate.local });
  return stop(offLocal, offRemote);
};

export const loopback = () => {
  const aHandlers = new Set();
  const bHandlers = new Set();
  const pending = [];
  return {
    a: {
      send: (e) =>
        bHandlers.forEach((h) => pending.push(Promise.resolve(h(e)))),
      onMessage: (h) => {
        aHandlers.add(h);
        return () => aHandlers.delete(h);
      },
    },
    b: {
      send: (e) =>
        aHandlers.forEach((h) => pending.push(Promise.resolve(h(e)))),
      onMessage: (h) => {
        bHandlers.add(h);
        return () => bHandlers.delete(h);
      },
    },
    async settle() {
      while (pending.length) {
        await pending.shift();
      }
    },
  };
};
