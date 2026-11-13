// Root notifications contain no records or credentials. Each persistence root
// (including an extra account's root) has its own channel.
import { merge } from '../sync/register.js';

export const coordinateSnapshots = Symbol.for(
  'meta-sovereign.coordinate-snapshots'
);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const refused = () =>
  Object.assign(new Error('Saved browser data cannot be merged safely'), {
    code: 'STORE_SNAPSHOT_CHANGED',
  });
const privateId = (id) => id === 'meta:schema' || id.startsWith('secret:');

export const snapshotRecords = (snapshot) => {
  if (!Array.isArray(snapshot?.links)) {
    throw refused();
  }
  const records = new Map();
  for (const link of snapshot.links) {
    if (!link || typeof link.id !== 'string' || records.has(link.id)) {
      throw refused();
    }
    records.set(link.id, link);
  }
  return records;
};

// Public records use the same causal register as device sync. Private values
// use a three-way comparison: independent changes survive; conflicting edits
// refuse instead of inventing a credential ordering. Physical public removal
// by an older/noncausal writer also refuses; schema 13 uses causal tombstones.
export const mergeBrowserSnapshot = (baseline, local, remote, schema) => {
  for (const records of [baseline, local, remote]) {
    if (records.get('meta:schema')?.version !== schema) {
      throw refused();
    }
  }
  const result = new Map();
  for (const id of new Set([
    ...baseline.keys(),
    ...local.keys(),
    ...remote.keys(),
  ])) {
    const before = baseline.get(id);
    const ours = local.get(id);
    const theirs = remote.get(id);
    let next;
    if (privateId(id)) {
      if (!same(ours, before) && !same(theirs, before) && !same(ours, theirs)) {
        throw refused();
      }
      next = same(ours, before) ? theirs : ours;
    } else {
      if (before && (!ours || !theirs)) {
        throw refused();
      }
      next = merge(ours, theirs);
    }
    if (next) {
      result.set(id, next);
    }
  }
  return result;
};

export const snapshotNotifications = (
  name,
  { Channel = globalThis.BroadcastChannel, events = globalThis, key } = {}
) => {
  const channel = () => {
    try {
      return typeof Channel === 'function'
        ? new Channel(`meta-sovereign:snapshot:${name}`)
        : null;
    } catch {
      return null;
    }
  };
  return {
    publish() {
      const sender = channel();
      try {
        sender?.postMessage({ changed: true });
      } catch {
        // Notifications are advisory. A committed root remains committed if
        // the browser disables messaging; returning pages re-read the root.
      } finally {
        sender?.close();
      }
    },
    watch(changed) {
      const receiver = channel();
      if (receiver) {
        receiver.onmessage = () => changed();
      }
      const storage = (event) => {
        if (key !== undefined && (event.key === key || event.key === null)) {
          changed();
        }
      };
      events.addEventListener?.('storage', storage);
      return () => {
        receiver?.close();
        events.removeEventListener?.('storage', storage);
      };
    },
  };
};

export const watchSnapshotRoot = (
  driver,
  refresh,
  { signal, onError } = {}
) => {
  if (signal?.aborted) {
    return () => {};
  }
  let stopped = false;
  const changed = () => {
    if (!stopped) {
      refresh().catch((error) => reportSnapshotError(onError, error));
    }
  };
  const unwatch = driver.watch?.(changed);
  // Background pages can miss notifications while suspended. Re-read the root
  // on return without polling full snapshots or copying payloads into messages.
  const events = ['focus', 'pageshow', 'visibilitychange'];
  for (const name of events) {
    globalThis.addEventListener?.(name, changed);
  }
  const stop = () => {
    stopped = true;
    unwatch?.();
    for (const name of events) {
      globalThis.removeEventListener?.(name, changed);
    }
    signal?.removeEventListener('abort', stop);
  };
  signal?.addEventListener('abort', stop, { once: true });
  return stop;
};

export const reportSnapshotError = (onError, error) => {
  try {
    onError?.(error);
  } catch {
    // Optional diagnostics must not create an unhandled background rejection.
  }
};
