/** Official user-token receipts: 1 sent, 2 approved, 4 resent. */
import { positiveVkId } from '../automation/vk-friends-settings.js';

const invalid = () => {
  throw new Error('Incomplete VK friend state');
};
export const createVkFriends = ({ call, once }) => {
  const state = async (ids, options) => {
    const self = await call('users.get', {}, options.token);
    const friends = await call('friends.get', { count: 1 }, options.token);
    const statuses = ids.length
      ? await call(
          'friends.areFriends',
          { user_ids: ids.join(',') },
          options.token
        )
      : [];
    if (
      !Array.isArray(self) ||
      self.length !== 1 ||
      !positiveVkId(self[0]?.id) ||
      !Number.isSafeInteger(friends?.count) ||
      friends.count < 0 ||
      !Array.isArray(statuses)
    ) {
      invalid();
    }
    const indexed = Object.fromEntries(
      statuses.map((row) => [row.user_id, row.friend_status])
    );
    if (
      statuses.length !== ids.length ||
      new Set(statuses.map((row) => row.user_id)).size !== ids.length ||
      !ids.every((id) => [0, 1, 2, 3].includes(indexed[id]))
    ) {
      invalid();
    }
    return { accountId: self[0].id, count: friends.count, statuses: indexed };
  };
  return {
    async friendSnapshot(options) {
      const requests = await call(
        'friends.getRequests',
        { count: options.batchSize, sort: 1, out: 0 },
        options.token
      );
      const incoming = requests?.items;
      if (
        !Array.isArray(incoming) ||
        !Number.isSafeInteger(requests.count) ||
        requests.count < incoming.length ||
        incoming.length > options.batchSize ||
        !incoming.every(positiveVkId)
      ) {
        invalid();
      }
      const ids = [...new Set([...options.priorityIds, ...incoming])];
      const inspected = [...new Set([...ids, ...(options.observeIds ?? [])])];
      return { ...(await state(inspected, options)), incoming, ids };
    },
    friendState: (userId, options) => state([userId], options),
    async addFriend(userId, options, beforeIssue) {
      const receipt = await once(
        'friends.add',
        { user_id: userId },
        options.token,
        { write: true, retries: 0 },
        beforeIssue
      );
      if (![1, 2, 4].includes(receipt)) {
        throw Object.assign(new Error('VK did not confirm the friend action'), {
          code: 'unconfirmed',
        });
      }
      return {
        confirmed: true,
        receipt,
        outcome: { 1: 'sent', 2: 'accepted', 4: 'resent' }[receipt],
      };
    },
  };
};
