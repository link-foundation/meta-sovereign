import {
  replicatedMutation,
  replicationAdmission,
} from '../storage/mutation.js';

// Keep remote operations in arrival order. The storage update applies its merge
// at write admission, so a local write during an async read is not overwritten
// using a stale snapshot. Only events belonging to that mutation are silenced.
export const createPeerReceiver = (
  store,
  merge,
  onState = () => {},
  onAdmit = () => {}
) => {
  let tail = Promise.resolve();
  let legacyMuted = false;
  const atomic = typeof store.update === 'function';
  const apply = async (event) => {
    // Third-party implementations of the original interface keep their prior
    // echo suppression; they must implement update + mutation metadata to gain
    // isolation. All built-in writable stores support the extended contract.
    legacyMuted = !atomic;
    let admission;
    const options = {
      [replicatedMutation]: true,
      [replicationAdmission]: (type, id) => {
        if (type === event.type && id === event.link.id) {
          admission ??= onAdmit(event);
        }
      },
    };
    try {
      onState({
        phase: atomic ? 'receive' : 'legacy-receive',
        type: event.type,
      });
      if (event.type === 'put') {
        if (atomic) {
          await store.update(
            event.link.id,
            (local) => merge(local, event.link),
            options
          );
        } else {
          await store.put(
            merge(await store.get(event.link.id), event.link),
            options
          );
        }
      } else if (event.type === 'delete') {
        await store.delete(event.link.id, options);
      }
      // Legacy third-party stores may not expose mutation admission.
      admission ??= onAdmit(event);
      admission?.commit();
      onState({ phase: 'applied', type: event.type });
    } catch (error) {
      admission?.abort();
      onState({ phase: 'failed', type: event.type });
      throw error;
    } finally {
      legacyMuted = false;
    }
  };
  return {
    suppresses: (event) => legacyMuted || event?.[replicatedMutation] === true,
    receive(event) {
      const result = tail.then(() => apply(event));
      // The caller receives this rejection; later work can still be admitted.
      tail = result.catch(() => {});
      return result;
    },
  };
};
