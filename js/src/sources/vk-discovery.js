import {
  invalidDiscovery as invalid,
  discoveryFields as fields,
  discoveryProfile as profileOf,
  scanDiscovery,
} from './vk-discovery-pages.js';
/** Finite current user-token reads; native writes use shared relationship receipts. */
export const createVkDiscovery = ({ call, once, friends }) => {
  const profiles = async (ids, options) => {
    if (!ids.length) {
      return new Map();
    }
    const rows = await call(
      'users.get',
      { user_ids: ids.join(','), fields },
      options.token
    );
    if (
      !Array.isArray(rows) ||
      rows.length !== ids.length ||
      new Set(rows.map((row) => row?.id)).size !== ids.length ||
      !ids.every((id) => rows.some((row) => row?.id === id))
    ) {
      invalid();
    }
    return new Map(rows.map((row) => [row.id, profileOf(row)]));
  };
  const state = async (kind, id, options) => {
    const current = await friends.friendState(id, options);
    const profile = (await profiles([id], options)).get(id);
    const result = {
      accountId: current.accountId,
      friendCount: current.count,
      userId: id,
      relation: current.statuses[id],
      profile,
    };
    if (kind === 'suggestions') {
      result.mutualCount = await friends.friendMutualCount(id, options);
    }
    if (kind === 'community') {
      const member = await call(
        'groups.isMember',
        { group_id: options.communityId, user_id: id },
        options.token
      );
      if (![0, 1].includes(member)) {
        invalid();
      }
      result.member = member === 1;
    }
    return result;
  };
  return {
    async discoverySnapshot(kind, options) {
      const inspected = await scanDiscovery(call, kind, options);
      const initial = await friends.friendStates([], options);
      const items = [];
      // Bounded chunks keep profile reads within the official users.get limit.
      for (let offset = 0; offset < inspected.ids.length; offset += 1000) {
        const chunk = inspected.ids.slice(offset, offset + 1000);
        const users = await profiles(chunk, options);
        const current = await friends.friendStates(chunk, options);
        if (
          current.accountId !== initial.accountId ||
          current.count !== initial.count
        ) {
          invalid();
        }
        const mutuals = {};
        if (kind === 'suggestions') {
          for (let start = 0; start < chunk.length; start += 100) {
            Object.assign(
              mutuals,
              await friends.friendMutualCounts(
                chunk.slice(start, start + 100),
                options
              )
            );
          }
        }
        for (const userId of chunk) {
          items.push({
            userId,
            relation: current.statuses[userId],
            profile: users.get(userId),
            ...(kind === 'suggestions' ? { mutualCount: mutuals[userId] } : {}),
            ...(kind === 'community' ? { member: true } : {}),
          });
        }
      }
      if (kind === 'suggestions') {
        items.sort(
          (a, b) => b.mutualCount - a.mutualCount || a.userId - b.userId
        );
      }
      return {
        accountId: initial.accountId,
        friendCount: initial.count,
        total: inspected.total,
        complete: inspected.complete,
        offset: kind === 'community' ? options.offset : 0,
        items,
      };
    },
    discoveryState: state,
    async rejectFriendRequest(userId, options, beforeIssue) {
      const receipt = await once(
        'friends.delete',
        { user_id: userId },
        options.token,
        { write: true, retries: 0 },
        beforeIssue
      );
      if (receipt?.success !== 1 || receipt.in_request_deleted !== 1) {
        throw Object.assign(
          new Error('VK did not confirm incoming-request rejection'),
          { code: 'unconfirmed' }
        );
      }
      return { confirmed: true, receipt, outcome: 'rejected' };
    },
  };
};
