import { syncWire, MAX_SYNC_BYTES } from './wire.js';

const failure = (message, code) => Object.assign(new Error(message), { code });
const randomId = () =>
  Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
const validId = (id) => typeof id === 'string' && /^[\w-]{1,64}$/.test(id);

const validateRoute = (route, maxHops) => {
  if (route === undefined) {
    return;
  }
  if (
    !validId(route?.id) ||
    !Array.isArray(route.via) ||
    route.via.length === 0 ||
    route.via.length > maxHops ||
    !route.via.every(validId)
  ) {
    throw failure('Invalid sync relay envelope', 'SYNC_RELAY_INVALID');
  }
};

// Routing belongs to the operation envelope, never a stored link. Opaque
// instance IDs distinguish peers with the same public node label. Both the
// replay cache and the route are bounded; this is live routing, not a journal.
export const createRelayIdentity = ({ maxSeen = 4096, maxHops = 32 } = {}) => {
  const instance = randomId();
  const seen = new Set();
  const pending = new Set();
  const remember = (id) => {
    seen.add(id);
    if (seen.size > maxSeen) {
      seen.delete(seen.values().next().value);
    }
  };
  return {
    local(event) {
      const id = randomId();
      remember(id);
      return { ...event, relay: { id, via: [instance] } };
    },
    accept(event) {
      const route = event.relay;
      validateRoute(route, maxHops);
      const id = route?.id ?? randomId();
      if (seen.has(id) || pending.has(id) || route?.via.includes(instance)) {
        return null;
      }
      if ((route?.via.length ?? 0) >= maxHops) {
        throw failure('Sync relay hop limit reached', 'SYNC_RELAY_LIMIT');
      }
      if (pending.size >= maxSeen) {
        throw failure('Sync relay receive queue is full', 'SYNC_RELAY_FULL');
      }
      pending.add(id);
      return {
        ...event,
        relay: { id, via: [...(route?.via ?? []), instance] },
      };
    },
    finish(event, applied) {
      pending.delete(event.relay.id);
      if (applied) {
        remember(event.relay.id);
      }
    },
  };
};

// Reserve remote forwarding at actual storage admission, then release
// it only after persistence succeeds. Later owner edits queue behind it, so a
// delayed remote put cannot follow (and resurrect) a newer local deletion.
export const createRelayOutbox = (
  send,
  report,
  { maxBytes = MAX_SYNC_BYTES, maxEntries = 4096 } = {}
) => {
  const wire = syncWire();
  const queue = [];
  let bytes = 0;
  const drain = () => {
    while (queue.length && queue[0].ready) {
      const item = queue.shift();
      bytes -= item.bytes;
      if (!item.failed) {
        send(wire.decode(item.data));
      }
    }
  };
  const enqueue = (event, ready) => {
    const data = wire.encode(event);
    const size = new TextEncoder().encode(data).byteLength;
    if (queue.length >= maxEntries || bytes + size > maxBytes) {
      throw failure('Sync relay outbound queue is full', 'SYNC_RELAY_FULL');
    }
    const item = { data, bytes: size, ready, failed: false };
    bytes += size;
    queue.push(item);
    return item;
  };
  return {
    local(event) {
      try {
        if (queue.length) {
          enqueue(event, true);
        } else {
          send(event);
        }
      } catch (error) {
        report(error);
      }
    },
    reserve(event) {
      let item;
      try {
        item = enqueue(event, false);
      } catch (error) {
        report(error);
      }
      let settled = false;
      const finish = (failed) => {
        if (!item || settled) {
          return;
        }
        settled = true;
        item.ready = true;
        item.failed = failed;
        drain();
      };
      return { commit: () => finish(false), abort: () => finish(true) };
    },
  };
};
