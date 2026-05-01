/**
 * Sync layer (R-F5).
 *
 * Last-writer-wins-per-link CRDT seed: every link carries a `version`
 * (Lamport-style). `merge(a, b)` picks the higher version on conflict
 * and union of children otherwise. `Peer` is transport-agnostic — the
 * WebRTC adapter is plumbed via `Peer.connect(transport)` so the same
 * code runs over loopback in tests, WebSocket on a server, or
 * RTCDataChannel in the browser.
 */

export const tickVersion = (now = Date.now(), node = 'local') =>
  `${now}-${node}`;

export const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const merge = (a, b) => {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  const winner = cmp(a.version ?? '', b.version ?? '') >= 0 ? a : b;
  const childIds = new Set([...(a.children ?? []), ...(b.children ?? [])]);
  return { ...winner, children: [...childIds] };
};

export const createPeer = (store, { node = 'local' } = {}) => {
  const subs = new Set();
  let muted = false;
  store.subscribe((event) => {
    if (muted) {
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
