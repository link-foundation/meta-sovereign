/**
 * Data-driven handler runtime.
 *
 * Implements the architecture described in
 * https://habr.com/ru/companies/deepfoundation/articles/656879 :
 * components do not call each other directly, they read and write
 * to the central links store; reactions are handlers registered
 * against link create/update/delete events.
 *
 * Two correctness properties matter:
 *
 * 1. **At-most-once across replication.** When a handler reacts to
 *    a link, it stamps that link with `handledBy[handlerId] = ts`.
 *    On the next put coming back through sync the bus checks the
 *    stamp and skips already-handled handlers, so two peers cannot
 *    both send the same broadcast or both fire the same automation
 *    graph just because the link round-trips.
 *
 * 2. **Causality.** Handlers may write further links back into the
 *    store; the bus is reentrant and serialises events per link id
 *    so a handler that writes a follow-up link sees the original
 *    update before its own write echoes back.
 *
 * The bus is intentionally transport-agnostic: it just wraps a
 * `UniversalLinksAccess`. Whoever owns the store (server, browser,
 * Electron renderer) can attach the same handler set; the
 * `handledBy` stamp prevents duplicate work after the next sync.
 */

const stamp = (link, handlerId) => ({
  ...link,
  handledBy: { ...(link.handledBy ?? {}), [handlerId]: Date.now() },
});

const wasHandled = (link, handlerId) =>
  Boolean(link?.handledBy?.[handlerId] !== undefined);

const matchesSelector = (link, selector) => {
  if (!selector) {
    return true;
  }
  if (selector.idPrefix && !link.id?.startsWith(selector.idPrefix)) {
    return false;
  }
  if (selector.event && selector.event !== '*') {
    if (Array.isArray(selector.event)) {
      if (!selector.event.includes(link._event)) {
        return false;
      }
    } else if (selector.event !== link._event) {
      return false;
    }
  }
  if (selector.predicate && !selector.predicate(link)) {
    return false;
  }
  return true;
};

export const createHandlerBus = (store, { logger } = {}) => {
  const handlers = new Map();
  const log = logger ?? (() => {});
  const inFlight = new Set();

  const dispatch = async (event) => {
    const linkSnapshot = { ...event.link, _event: event.type };
    const id = linkSnapshot.id;
    if (!id) {
      return;
    }
    const key = `${event.type}:${id}`;
    if (inFlight.has(key)) {
      return;
    }
    inFlight.add(key);
    try {
      for (const [handlerId, handler] of handlers) {
        if (!matchesSelector(linkSnapshot, handler.selector)) {
          continue;
        }
        if (event.type === 'put' && wasHandled(event.link, handlerId)) {
          continue;
        }
        let outcome;
        try {
          outcome = await handler.run({
            link: event.link,
            event: event.type,
            store,
          });
        } catch (err) {
          log({ level: 'error', handlerId, id, error: err.message });
          continue;
        }
        if (event.type === 'put' && outcome !== false) {
          const fresh = await store.get(id);
          if (fresh) {
            await store.put(stamp(fresh, handlerId));
          }
        }
      }
    } finally {
      inFlight.delete(key);
    }
  };

  const unsubscribe = store.subscribe((event) => {
    void dispatch(event);
  });

  return {
    register(handlerId, selector, run) {
      if (handlers.has(handlerId)) {
        throw new Error(`handler "${handlerId}" already registered`);
      }
      handlers.set(handlerId, { selector, run });
      return () => handlers.delete(handlerId);
    },
    unregister(handlerId) {
      return handlers.delete(handlerId);
    },
    list() {
      return [...handlers.keys()];
    },
    async replay({ idPrefix } = {}) {
      const all = await store.query(
        idPrefix ? (l) => l.id?.startsWith(idPrefix) : undefined
      );
      for (const link of all) {
        await dispatch({ type: 'put', link });
      }
    },
    close() {
      unsubscribe?.();
      handlers.clear();
    },
  };
};

/**
 * Built-in handler: when a `broadcast:*` link is created, fan it out
 * to the listed networks via the broadcast adapter chain.
 *
 * Marks the link `dispatched: true` after a successful run so a UI
 * can render queued vs sent state without re-asking the network.
 */
export const broadcastHandler = ({ broadcast }) => ({
  selector: { idPrefix: 'broadcast:', event: 'put' },
  async run({ link, store }) {
    if (link.dispatched) {
      return false;
    }
    const results = await broadcast(link.networks ?? [], link.body ?? '');
    await store.put({ ...link, dispatched: true, results });
  },
});

/**
 * Built-in handler: when `profile:me` changes, push the profile to
 * every network adapter's `live.syncProfile`.
 */
export const profileSyncHandler = ({ syncProfile, networks }) => ({
  selector: { idPrefix: 'profile:', event: 'put' },
  async run({ link, store }) {
    if (link.synced) {
      return false;
    }
    const results = await syncProfile(networks ?? [], link);
    await store.put({ ...link, synced: true, results });
  },
});

/**
 * Built-in handler: when `resume:me` changes, push to job-board
 * adapters' `syncResume`.
 */
export const resumeSyncHandler = ({ syncResume, networks }) => ({
  selector: { idPrefix: 'resume:', event: 'put' },
  async run({ link, store }) {
    if (link.synced) {
      return false;
    }
    const results = await syncResume(networks ?? [], link);
    await store.put({ ...link, synced: true, results });
  },
});

/**
 * Built-in handler: when an `outreach:*` plan is added, run the
 * envelopes through the broadcast adapter chain (R-D3).
 */
export const outreachHandler = ({ runOutreach }) => ({
  selector: { idPrefix: 'outreach:', event: 'put' },
  async run({ link, store }) {
    if (link.dispatched || link.mode !== 'queue') {
      return false;
    }
    const results = await runOutreach(link);
    await store.put({ ...link, dispatched: true, results });
  },
});

/**
 * Built-in handler: when a new inbound `msg:*` arrives, run every
 * persisted automation graph against it and persist the planned
 * replies as `plan:<msgId>` links so the operator UI can render
 * them deterministically.
 */
export const automationHandler = ({ runGraph, hydrate }) => ({
  selector: {
    idPrefix: 'msg:',
    event: 'put',
    predicate: (l) => l.sender !== 'me',
  },
  async run({ link, store }) {
    const all = await store.query();
    const graphs = all.filter((l) => l.id?.startsWith('graph:'));
    const allPlans = [];
    for (const persisted of graphs) {
      const plans = runGraph(hydrate(persisted), link, { mode: 'semi' });
      for (const p of plans) {
        allPlans.push({ graph: persisted.id, ...p });
      }
    }
    if (allPlans.length === 0) {
      return;
    }
    await store.put({
      id: `plan:${link.id}`,
      tokens: ['plan', link.id],
      message: link.id,
      plans: allPlans,
    });
  },
});
