/**
 * Transport-agnostic peer + CRDT primitives.
 *
 * Lives in its own file so the browser bundle can import `createPeer`
 * without dragging in `node:net` / `node:http` (which the TCP and
 * WebSocket *server* transports re-export from `sync/index.js`).
 */

export const tickVersion = (now = Date.now(), node = 'local') =>
  `${now}-${node}`;

export const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const vcInit = () => ({});
export const vcTick = (vc, node) => ({ ...vc, [node]: (vc[node] ?? 0) + 1 });
export const vcMerge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = Math.max(out[k] ?? 0, v);
  }
  return out;
};
const vcDominates = (a, b) => {
  let strict = false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const av = a[k] ?? 0;
    const bv = b[k] ?? 0;
    if (av < bv) {
      return false;
    }
    if (av > bv) {
      strict = true;
    }
  }
  return strict;
};
export const vcCompare = (a, b) => {
  if (vcDominates(a, b)) {
    return 1;
  }
  if (vcDominates(b, a)) {
    return -1;
  }
  const ka = Object.keys(a).sort().join('|');
  const kb = Object.keys(b).sort().join('|');
  if (ka === kb && Object.keys(a).every((k) => a[k] === b[k])) {
    return 0;
  }
  return null;
};

const tiebreak = (a, b) => {
  const av = a.vc ?? {};
  const bv = b.vc ?? {};
  const aTop = Object.entries(av).sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
  const bTop = Object.entries(bv).sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
  if (aTop !== bTop) {
    return aTop > bTop ? a : b;
  }
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
};

export const merge = (a, b) => {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  let winner;
  if (a.vc && b.vc) {
    const ord = vcCompare(a.vc, b.vc);
    if (ord === 1) {
      winner = a;
    } else if (ord === -1) {
      winner = b;
    } else if (ord === 0) {
      winner = a;
    } else {
      winner = tiebreak(a, b);
    }
    winner = { ...winner, vc: vcMerge(a.vc, b.vc) };
  } else {
    winner = cmp(a.version ?? '', b.version ?? '') >= 0 ? a : b;
  }
  const childIds = new Set([...(a.children ?? []), ...(b.children ?? [])]);
  return { ...winner, children: [...childIds] };
};

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
  { node = 'local', schemaVersion, onMismatch = () => {}, hub = false } = {}
) => {
  const subs = new Set();
  let muted = false;
  store.subscribe((event) => {
    if (muted) {
      return;
    }
    if (isSecretEvent(event)) {
      return;
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
      if (isSecretEvent(event)) {
        return;
      }
      muted = true;
      try {
        if (event.type === 'put') {
          const local = await store.get(event.link.id);
          await store.put(merge(local, event.link));
        } else if (event.type === 'delete') {
          await store.delete(event.link.id);
        }
      } finally {
        muted = false;
      }
    },
    /**
     * Plug a transport in. With `schemaVersion` set (R-Z17) every event
     * carries it and the peer says `{ type: 'hello', schema }` on connect;
     * an event or hello of another version is not applied, and
     * `onMismatch(error)` hears SCHEMA_MISMATCH once per version seen. A
     * peer without a version (or an old build) speaks as before. `hub`:
     * the transport fans out to many sockets, so one wrong one must not
     * silence the rest.
     */
    connect(transport) {
      return schemaVersion === undefined
        ? plug(this, transport, null)
        : plug(this, transport, { local: schemaVersion, onMismatch, hub });
    },
  };
};

// Connect `peer` to `transport`; `gate` (or null) is the schema check.
const plug = (peer, transport, gate) => {
  const stop = (offLocal, offRemote) => () => {
    offLocal();
    if (typeof offRemote === 'function') {
      offRemote();
    }
  };
  if (!gate) {
    return stop(
      peer.onLocal((e) => transport.send(e)),
      transport.onMessage((e) => peer.receive(e))
    );
  }
  const seen = new Set();
  let refused = false;
  const mismatch = (remote) => {
    refused = !gate.hub;
    if (!seen.has(remote)) {
      seen.add(remote);
      gate.onMismatch(schemaMismatch(gate.local, remote));
    }
  };
  const offLocal = peer.onLocal((e) => {
    if (!refused) {
      transport.send({ ...e, schema: gate.local });
    }
  });
  const offRemote = transport.onMessage((e) => {
    const remote = Number.isInteger(e?.schema) ? e.schema : null;
    if (remote !== gate.local) {
      mismatch(remote);
      return undefined;
    }
    return e.type === HELLO ? undefined : peer.receive(e);
  });
  transport.send({ type: HELLO, schema: gate.local });
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
