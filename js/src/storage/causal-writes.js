// Assign clocks at storage admission, including writes made while no peer
// exists. Each writable opening gets a fresh actor, so copied backups and
// concurrent browser tabs cannot accidentally share a writer identity.
import { vcMerge, vcTick } from '../sync/clock.js';
import { merge, SYNC_STAMP } from '../sync/register.js';
import { atomicBatch, changedLink, replicatedMutation } from './mutation.js';

const causalStore = Symbol.for('meta-sovereign.causal-writes');
const privateId = (id) => id === 'meta:schema' || id.startsWith('secret:');
const unavailable = () =>
  Object.assign(new Error('Causal writes require atomic storage admission'), {
    code: 'SYNC_ATOMIC_UNAVAILABLE',
  });

/** Install below history/encryption decorators. Reads and lifecycle are kept. */
export const withCausalWrites = (
  inner,
  { actor = `writer:${globalThis.crypto.randomUUID()}` } = {}
) => {
  if (inner[causalStore]) {
    return inner;
  }
  if (typeof inner.update !== 'function') {
    throw unavailable();
  }
  vcTick({}, actor); // Validate the explicitly supplied actor before any write.
  const stamp = (link, before, options) => {
    if (options?.[replicatedMutation] || privateId(link.id)) {
      return link;
    }
    if (Object.hasOwn(link, SYNC_STAMP)) {
      // Library callers must not silently lose owner data under a reserved
      // name if they have not run the production collision migration.
      merge(null, link);
    }
    const { [SYNC_STAMP]: _previousAssignment, ...value } = link;
    return {
      ...value,
      vc: vcTick(vcMerge(before?.vc ?? {}, link.vc ?? {}), actor),
    };
  };
  const result = Object.defineProperties(
    {},
    Object.getOwnPropertyDescriptors(inner)
  );
  Object.defineProperty(result, causalStore, { value: true });
  result.put = (link, options) => {
    if (!link || typeof link.id !== 'string') {
      return Promise.reject(new Error('link.id is required'));
    }
    return inner.update(
      link.id,
      (before) => stamp(link, before, options),
      options
    );
  };
  result.update = (id, change, options) =>
    inner.update(
      id,
      (before) => stamp(changedLink(id, change, before), before, options),
      options
    );
  result.putMany = (links, options) => {
    if (typeof inner[atomicBatch] !== 'function') {
      return Promise.reject(unavailable());
    }
    return inner[atomicBatch](
      links,
      (link, before) => stamp(link, before, options),
      options
    );
  };
  return result;
};
