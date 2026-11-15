import { positiveVkId } from '../automation/vk-friends-settings.js';
import { friendCredentialIdentity } from '../automation/vk-friends-records.js';

/** Fresh friend, conversation and optional ordering evidence; no cached writes. */
export const createVkGreet = ({ call, once, maintenance, conversations }) => ({
  async greetSnapshot(options) {
    const snapshot = await maintenance.maintenanceSnapshot('cleanup', options);
    return {
      ...snapshot,
      friendCount: snapshot.items.length,
      items: snapshot.items.slice(0, options.scanLimit),
    };
  },
  async greetState(userId, options) {
    const state = await conversations.cancelledState(userId, {
      ...options,
      friendGreeting: true,
    });
    const users = await call(
      'users.get',
      {
        user_ids: userId,
        fields: 'online,can_write_private_message',
      },
      options.token
    );
    const user = users?.[0];
    if (
      !Array.isArray(users) ||
      users.length !== 1 ||
      user?.id !== userId ||
      ![0, 1].includes(user.online) ||
      ![0, 1].includes(user.can_write_private_message) ||
      typeof state.markedUnread !== 'boolean' ||
      !Number.isSafeInteger(state.unreadCount) ||
      state.unreadCount < 0
    ) {
      throw new Error('Incomplete VK friend greeting evidence');
    }
    let friendCount = null;
    if (options.orderByFriends) {
      const result = await call(
        'friends.get',
        { user_id: userId, count: 1 },
        options.token
      );
      if (!Number.isSafeInteger(result?.count) || result.count < 0) {
        throw new Error('VK friend count unavailable for requested ordering');
      }
      friendCount = result.count;
    }
    const result = {
      ...state,
      online: user.online === 1,
      canWrite: state.canWrite && user.can_write_private_message === 1,
      friendCount,
    };
    return {
      ...result,
      fingerprint: await friendCredentialIdentity(JSON.stringify(result)),
    };
  },
  async greetEffect(item, options, beforeIssue) {
    const id = await once(
      'messages.send',
      {
        peer_id: item.userId,
        random_id: item.randomId,
        ...(item.sticker
          ? { sticker_id: item.sticker }
          : { message: item.text }),
      },
      options.token,
      { write: true, retries: 0 },
      beforeIssue
    );
    if (!positiveVkId(id)) {
      throw Object.assign(new Error('VK did not acknowledge the greeting'), {
        ambiguous: true,
        code: 'unconfirmed',
      });
    }
    return { confirmed: true, outcome: 'greeted', messageId: id };
  },
});
