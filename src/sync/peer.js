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

const isSecretEvent = (event) =>
  event &&
  event.link &&
  typeof event.link.id === 'string' &&
  event.link.id.startsWith('secret:');

export const createPeer = (store, { node = 'local' } = {}) => {
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
    connect(transport) {
      const offLocal = this.onLocal((e) => transport.send(e));
      transport.onMessage((e) => this.receive(e));
      return () => offLocal();
    },
  };
};

export const loopback = () => {
  const aHandlers = new Set();
  const bHandlers = new Set();
  const pending = [];
  return {
    a: {
      send: (e) =>
        bHandlers.forEach((h) => pending.push(Promise.resolve(h(e)))),
      onMessage: (h) => aHandlers.add(h),
    },
    b: {
      send: (e) =>
        aHandlers.forEach((h) => pending.push(Promise.resolve(h(e)))),
      onMessage: (h) => bHandlers.add(h),
    },
    async settle() {
      while (pending.length) {
        await pending.shift();
      }
    },
  };
};
