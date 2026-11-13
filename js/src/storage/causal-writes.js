// Assign clocks at storage admission, including writes made while no peer
// exists. Each writable opening gets a fresh actor, so copied backups and
// concurrent browser tabs cannot accidentally share a writer identity.
import { vcMerge, vcTick } from '../sync/clock.js';
import { merge, SYNC_STAMP } from '../sync/register.js';
import {
  atomicBatch,
  changedLink,
  replicatedMutation,
  replicationAdmission,
} from './mutation.js';
import {
  SYNC_DELETED,
  isSyncDeleted,
  replicatedDeletion,
  syncRecords,
} from './sync-deletions.js';

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
  const assign = (link, before) => {
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
  const stamp = (link, before, options) => {
    if (privateId(link.id)) {
      return link;
    }
    if (options?.[replicatedMutation]) {
      return merge(before, link);
    }
    if (Object.hasOwn(link, SYNC_DELETED)) {
      throw Object.assign(new Error('Causal deletion marker is reserved'), {
        code: 'SYNC_VALUE_INVALID',
      });
    }
    return assign(link, before);
  };
  const result = Object.defineProperties(
    {},
    Object.getOwnPropertyDescriptors(inner)
  );
  Object.defineProperty(result, causalStore, { value: true });
  Object.defineProperty(result, syncRecords, {
    value: { scan: (...args) => inner.scan(...args), size: () => inner.size() },
  });
  const visible = (link) => link && !isSyncDeleted(link);
  result.get = async (id, project) => {
    if (project) {
      return inner.get(id, (link) => (visible(link) ? project(link) : null));
    }
    const link = await inner.get(id);
    return visible(link) ? link : null;
  };
  result.query = (filter) =>
    inner.query((link) => visible(link) && (!filter || filter(link)));
  if (inner.scan) {
    result.scan = (filter, batchSize, onBatch, project) =>
      inner.scan(
        (link) => visible(link) && (!filter || filter(link)),
        batchSize,
        onBatch,
        project
      );
  }
  result.subscribe = (handler) =>
    inner.subscribe((event) =>
      handler(isSyncDeleted(event.link) ? { ...event, type: 'delete' } : event)
    );
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
      (before) =>
        stamp(
          changedLink(
            id,
            change,
            options?.[replicatedMutation] || visible(before) ? before : null
          ),
          before,
          options
        ),
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
  result.delete = async (id, options) => {
    if (privateId(id)) {
      return inner.delete(id, options);
    }
    let existed = false;
    const incoming = options?.[replicatedDeletion];
    // History purges also erase derived revision payloads. Those distinct IDs
    // receive their own causal deletion; the incoming message clock is not
    // silently reused as a revision's timestamp.
    const exact = incoming?.id === id;
    if (exact && !isSyncDeleted(incoming)) {
      throw Object.assign(
        new Error('Replicated delete requires causal metadata'),
        {
          code: 'SYNC_VALUE_INVALID',
        }
      );
    }
    const admitted = options?.[replicationAdmission];
    await inner.update(
      id,
      (before) => {
        existed = Boolean(visible(before));
        return exact
          ? merge(before, incoming)
          : assign(
              {
                id,
                [SYNC_DELETED]: 1,
                ...(before?.children ? { children: before.children } : {}),
              },
              before
            );
      },
      {
        ...options,
        [replicationAdmission]: (_type, key) => admitted?.('delete', key),
      }
    );
    return existed;
  };
  return result;
};
