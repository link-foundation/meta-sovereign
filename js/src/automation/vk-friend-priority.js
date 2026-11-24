import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { readFriendState } from './vk-friends-records.js';
import {
  MAX_FRIEND_PRIORITY,
  VK_FRIENDS_JOB,
  positiveVkId,
  serializeVkFriends,
  readVkFriendSettings,
  readVkFriends,
} from './vk-friends-settings.js';

/** Own settings edits and drain admitted scans before releasing the runtime. */
export const createVkFriendPriority = ({
  store,
  optionsFor,
  provider,
  isStopped,
  log,
}) => {
  const pending = new Set();
  const edit = (mode) => {
    const operation = serializeVkFriends(store, async () => {
      if (isStopped()) {
        throw new Error('Service stopped');
      }
      const settings = await readVkFriendSettings(store);
      let ids = [];
      if (mode === 'seed') {
        const { options, live } = await provider('outgoingFriendPriority');
        const snapshot = await readFriendState(
          () => live.outgoingFriendPriority(options),
          options.token
        );
        if (
          !positiveVkId(snapshot?.accountId) ||
          !Array.isArray(snapshot.ids) ||
          !snapshot.ids.every(positiveVkId)
        ) {
          throw new Error('Incomplete outgoing priority observation');
        }
        ids = [...new Set([...settings.priorityIds, ...snapshot.ids])];
        if ((await optionsFor())?.token !== options.token) {
          throw new Error(
            'VK account credential changed; retry priority observation'
          );
        }
      } else if (mode !== 'clear') {
        throw new Error('seed or clear priority operation required');
      }
      if (isStopped() || ids.length > MAX_FRIEND_PRIORITY) {
        throw new Error(
          'Service stopped or priority list exceeds 10000 accounts'
        );
      }
      await saveAcknowledgedRecord(store, {
        id: VK_FRIENDS_JOB,
        ...settings,
        priorityIds: ids,
      });
      log({
        event: 'vk_friend_priority_saved',
        operation: mode,
        count: ids.length,
      });
      return readVkFriends(store);
    });
    pending.add(operation);
    void operation.then(
      () => pending.delete(operation),
      () => pending.delete(operation)
    );
    return operation;
  };
  return { edit, stop: () => Promise.allSettled([...pending]) };
};
