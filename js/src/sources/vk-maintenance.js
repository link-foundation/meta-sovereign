import { positiveVkId } from '../automation/vk-friends-settings.js';

const invalid = () => {
  throw new Error('Incomplete VK maintenance state');
};
const list = (value, maximum, objects) => {
  if (
    !Number.isSafeInteger(value?.count) ||
    value.count < 0 ||
    !Array.isArray(value.items) ||
    value.items.length > maximum ||
    value.items.length > value.count ||
    !value.items.every((row) => positiveVkId(objects ? row?.id : row))
  ) {
    invalid();
  }
  return value;
};
/** Complete bounded scans. No cached deactivation state authorizes a deletion. */
export const createVkMaintenance = ({ call, once }) => {
  const account = async (options) => {
    const self = await call('users.get', {}, options.token);
    if (
      !Array.isArray(self) ||
      self.length !== 1 ||
      !positiveVkId(self[0]?.id)
    ) {
      invalid();
    }
    return self[0].id;
  };
  const scan = async (kind, options) => {
    const items = [];
    let total;
    // Both provider lists are bounded by the policy. Cleanup scans the full
    // supported 10k friend capacity, then applies its effect limit.
    const maximum = kind === 'cleanup' ? 10000 : options.limit;
    while (items.length < maximum) {
      const count = Math.min(
        kind === 'cleanup' ? 5000 : 1000,
        maximum - items.length
      );
      const page = list(
        await call(
          kind === 'cleanup' ? 'friends.get' : 'friends.getRequests',
          kind === 'cleanup'
            ? { count, offset: items.length, fields: 'screen_name' }
            : { count, offset: items.length, out: 1, need_viewed: 1 },
          options.token
        ),
        count,
        kind === 'cleanup'
      );
      if (total !== undefined && total !== page.count) {
        invalid();
      }
      total = page.count;
      items.push(...page.items);
      if (items.length >= Math.min(total, maximum)) {
        break;
      }
      if (!page.items.length) {
        invalid();
      }
    }
    const ids = items.map((row) => (kind === 'cleanup' ? row.id : row));
    if (
      new Set(ids).size !== ids.length ||
      (kind === 'cleanup' && total > maximum)
    ) {
      invalid();
    }
    return items.map((row) => ({
      userId: kind === 'cleanup' ? row.id : row,
      relation: kind === 'cleanup' ? 3 : 1,
      deactivated: row.deactivated ?? null,
    }));
  };
  return {
    async maintenanceSnapshot(kind, options) {
      const accountId = await account(options);
      const items = options.limit ? await scan(kind, options) : [];
      const observed = {};
      const ids = options.observeIds ?? [];
      for (let offset = 0; offset < ids.length; offset += 1000) {
        const chunk = ids.slice(offset, offset + 1000);
        const rows = await call(
          'friends.areFriends',
          { user_ids: chunk.join(',') },
          options.token
        );
        if (
          !Array.isArray(rows) ||
          rows.length !== chunk.length ||
          new Set(rows.map((row) => row.user_id)).size !== chunk.length ||
          !chunk.every((id) =>
            rows.some(
              (row) =>
                row.user_id === id && [0, 1, 2, 3].includes(row.friend_status)
            )
          )
        ) {
          invalid();
        }
        for (const row of rows) {
          observed[row.user_id] = row.friend_status;
        }
      }
      return { accountId, items, observed };
    },
    async maintenanceState(userId, options) {
      const accountId = await account(options);
      const [users, relations] = await Promise.all([
        call('users.get', { user_ids: userId }, options.token),
        call('friends.areFriends', { user_ids: userId }, options.token),
      ]);
      if (
        !Array.isArray(users) ||
        users.length !== 1 ||
        users[0]?.id !== userId ||
        !Array.isArray(relations) ||
        relations.length !== 1 ||
        relations[0]?.user_id !== userId ||
        ![0, 1, 2, 3].includes(relations[0].friend_status)
      ) {
        invalid();
      }
      return {
        accountId,
        relation: relations[0].friend_status,
        deactivated: users[0].deactivated ?? null,
      };
    },
    async removeFriend(userId, kind, options, beforeIssue) {
      const receipt = await once(
        'friends.delete',
        { user_id: userId },
        options.token,
        { write: true, retries: 0 },
        beforeIssue
      );
      const expected =
        kind === 'cleanup' ? 'friend_deleted' : 'out_request_deleted';
      if (receipt?.success !== 1 || receipt[expected] !== 1) {
        throw Object.assign(
          new Error('VK did not confirm the requested deletion'),
          { code: 'unconfirmed' }
        );
      }
      return {
        confirmed: true,
        receipt,
        outcome: kind === 'cleanup' ? 'removed' : 'cancelled',
      };
    },
  };
};
