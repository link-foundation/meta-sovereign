import { positiveVkId } from '../automation/vk-friends-settings.js';
import { friendCredentialIdentity } from '../automation/vk-friends-records.js';

const invalid = () => {
  throw new Error('Incomplete VK friendship follow-up evidence');
};
const countOf = (page) => {
  if (
    !Number.isSafeInteger(page?.count) ||
    page.count < 0 ||
    !Array.isArray(page.items)
  ) {
    invalid();
  }
  return page.count;
};
const messageEvidence = (row, userId, accountId) => {
  if (
    !positiveVkId(row?.id) ||
    row.peer_id !== userId ||
    ![0, 1].includes(row.out) ||
    row.from_id !== (row.out ? accountId : userId) ||
    !Number.isSafeInteger(row.date) ||
    row.date < 0 ||
    typeof row.text !== 'string' ||
    row.text.length > 9000 ||
    row.deleted
  ) {
    invalid();
  }
  return {
    id: row.id,
    out: row.out,
    date: row.date,
    text: row.text,
    service: Boolean(row.action),
  };
};
const unreadEvidence = (conversation) => ({
  unreadCount: conversation.unread_count ?? 0,
  markedUnread: conversation.is_marked_unread ?? false,
});
/** Read a finite complete history. Partial history never authorizes a prompt. */
export const createVkCancelled = ({ call, once, maintenance }) => {
  const history = async (userId, accountId, options) => {
    const messages = [];
    let total;
    do {
      const page = await call(
        'messages.getHistory',
        {
          peer_id: userId,
          offset: messages.length,
          count: 200,
          rev: 0,
        },
        options.token
      );
      const count = countOf(page);
      if (count > 1000) {
        return null;
      }
      if (
        (total !== undefined && count !== total) ||
        page.items.length > 200 ||
        messages.length + page.items.length > count ||
        (!page.items.length && messages.length < count)
      ) {
        invalid();
      }
      total = count;
      for (const row of page.items) {
        messages.push(messageEvidence(row, userId, accountId));
      }
    } while (messages.length < total);
    if (
      new Set(messages.map((row) => row.id)).size !== messages.length ||
      messages.some(
        (row, i) =>
          i && (messages[i - 1].id <= row.id || messages[i - 1].date < row.date)
      )
    ) {
      invalid();
    }
    return messages;
  };
  return {
    async cancelledSnapshot(options) {
      return maintenance.maintenanceSnapshot('outgoing', options);
    },
    async cancelledState(userId, options) {
      const relation = await maintenance.maintenanceState(userId, options);
      const conversations = await call(
        'messages.getConversationsById',
        { peer_ids: userId },
        options.token
      );
      if (countOf(conversations) !== 1 || conversations.items.length !== 1) {
        invalid();
      }
      const conversation = conversations.items[0];
      if (
        conversation.peer?.id !== userId ||
        conversation.peer.type !== 'user' ||
        typeof conversation.can_write?.allowed !== 'boolean' ||
        !Number.isSafeInteger(conversation.last_message_id) ||
        conversation.last_message_id < 0
      ) {
        invalid();
      }
      const messages = await history(userId, relation.accountId, options);
      if (messages && (messages[0]?.id ?? 0) !== conversation.last_message_id) {
        invalid();
      }
      const state = {
        ...relation,
        canWrite: conversation.can_write.allowed,
        messages,
        ...(options.friendGreeting ? unreadEvidence(conversation) : {}),
      };
      return {
        ...state,
        fingerprint: await friendCredentialIdentity(JSON.stringify(state)),
      };
    },
    async cancelledEffect(item, options, beforeIssue) {
      const prompting = item.action === 'prompt';
      const receipt = await once(
        prompting ? 'messages.send' : 'account.ban',
        prompting
          ? {
              peer_id: item.userId,
              message: item.text,
              random_id: item.randomId,
            }
          : { owner_id: item.userId },
        options.token,
        { write: true, retries: 0 },
        beforeIssue
      );
      if (prompting ? !positiveVkId(receipt) : receipt !== 1) {
        throw Object.assign(
          new Error('VK did not acknowledge the friendship follow-up'),
          { code: 'unconfirmed', ambiguous: true }
        );
      }
      return {
        confirmed: true,
        outcome: prompting ? 'prompted' : 'blocked',
        ...(prompting ? { messageId: receipt } : {}),
      };
    },
  };
};
