import {
  MAX_FRIEND_PRIORITY,
  positiveVkId,
} from '../automation/vk-friends-settings.js';

/** Complete bounded outgoing-request observation; never issues a provider write. */
export const outgoingFriendPriority = async (call, options) => {
  const account = async () => {
    const rows = await call('users.get', {}, options.token);
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      !positiveVkId(rows[0]?.id)
    ) {
      throw new Error('Incomplete VK priority account');
    }
    return rows[0].id;
  };
  const accountId = await account();
  const ids = [];
  let total;
  do {
    const count = Math.min(1000, MAX_FRIEND_PRIORITY - ids.length);
    const page = await call(
      'friends.getRequests',
      {
        count,
        offset: ids.length,
        out: 1,
        need_viewed: 1,
      },
      options.token
    );
    if (
      !Number.isSafeInteger(page?.count) ||
      page.count < 0 ||
      page.count > MAX_FRIEND_PRIORITY ||
      (total !== undefined && total !== page.count) ||
      !Array.isArray(page.items) ||
      page.items.length !== Math.min(count, page.count - ids.length) ||
      !page.items.every(positiveVkId)
    ) {
      throw new Error('Incomplete or changing VK outgoing priority list');
    }
    total = page.count;
    ids.push(...page.items);
  } while (ids.length < total);
  if (new Set(ids).size !== ids.length || (await account()) !== accountId) {
    throw new Error('VK priority account or list changed');
  }
  return { accountId, ids };
};
