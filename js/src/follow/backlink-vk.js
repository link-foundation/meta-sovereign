import { createVkLive } from '../sources/vk.js';
import { liveOptionsFrom } from '../sources/index.js';
import { vkRandomId } from '../sources/vk-limits.js';
import { publicationId } from '../sources/publication-receipt.js';
import { backlinkFailure, backlinkPeer } from './backlink-shape.js';

const responseFailure = () => backlinkFailure('provider-response');
const conversationOf = (result, peer) => {
  const conversation = result?.items?.length === 1 ? result.items[0] : null;
  if (
    conversation?.peer?.type !== 'chat' ||
    String(conversation.peer.id) !== peer
  ) {
    throw responseFailure();
  }
  return conversation;
};
const messages = (value, chat, limit) => {
  if (
    !Array.isArray(value?.items) ||
    value.items.length > limit ||
    value.items.some(
      (m) => !m || !publicationId(m.id) || String(m.peer_id) !== chat
    )
  ) {
    throw responseFailure();
  }
  return value.items;
};

// This adapter intentionally uses only single calls. The workflow owns timeout
// retries; VK rate limits and permissions must reach its receipts unchanged.
export const createBacklinkVk = async ({
  store,
  liveFactory = createVkLive,
  ...options
}) => {
  const credentials = await liveOptionsFrom(store, 'vk');
  if (!credentials.token) {
    throw backlinkFailure('not-connected');
  }
  const live = liveFactory({ ...options, ...credentials });
  if (typeof live.callOnce !== 'function') {
    throw backlinkFailure('unsupported');
  }
  const call = async (method, params, write = false) => {
    const fresh = await liveOptionsFrom(store, 'vk');
    if (fresh.token !== credentials.token) {
      throw backlinkFailure('account-changed');
    }
    return live.callOnce(method, params, { write });
  };
  return {
    async describe(chat) {
      const peer = backlinkPeer(chat);
      const users = await call('users.get', {});
      const owner = users?.length === 1 ? publicationId(users[0]?.id) : null;
      if (!owner || users[0].deactivated) {
        throw responseFailure();
      }
      const result = await call('messages.getConversationsById', {
        peer_ids: peer,
      });
      const conversation = conversationOf(result, peer);
      return {
        owner,
        chat: peer,
        title: String(conversation.chat_settings?.title ?? '').slice(0, 256),
        canWrite: [true, 1].includes(conversation.can_write?.allowed),
        canCleanup: true,
      };
    },
    async post({ chat, backlink, key }) {
      const result = await call(
        'messages.send',
        {
          peer_id: backlinkPeer(chat),
          message: backlink,
          random_id: vkRandomId(key),
        },
        true
      );
      const id = publicationId(result);
      if (!id) {
        throw backlinkFailure('outcome-unknown');
      }
      return { chat, id };
    },
    async inspect({ chat, id }) {
      const result = await call('messages.getById', { message_ids: id });
      const rows = messages(result, chat, 1);
      if (rows.length && String(rows[0].id) !== id) {
        throw responseFailure();
      }
      const row = rows[0];
      return {
        chat,
        id,
        state:
          !row ||
          [true, 1].includes(row.deleted) ||
          [true, 1].includes(row.is_unavailable)
            ? 'removed'
            : 'present',
      };
    },
    async retryNotice(chat) {
      const rows = messages(
        await call('messages.getHistory', {
          peer_id: backlinkPeer(chat),
          count: 10,
        }),
        chat,
        10
      );
      // This is a chat notice, not proof that its author is an administrator.
      return rows.some(
        (row) =>
          typeof row.text === 'string' &&
          /ещё\s+НЕ\s+прошло\s+5\s+чужих\s+ссылок/iu.test(
            row.text.slice(0, 8192)
          )
      );
    },
    async incoming({ chat, limit }) {
      const rows = messages(
        await call('messages.getHistory', {
          peer_id: backlinkPeer(chat),
          count: limit,
        }),
        chat,
        limit
      );
      return rows
        .filter((row) => row.out === 0 && !row.action)
        .map((row) => String(row.id));
    },
    async deleteIncoming({ chat, ids }) {
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.length > 200 ||
        ids.some((id) => !publicationId(id))
      ) {
        throw backlinkFailure('bad-request');
      }
      const result = await call(
        'messages.delete',
        {
          peer_id: backlinkPeer(chat),
          message_ids: ids.join(','),
          delete_for_all: 0,
        },
        true
      );
      return {
        confirmed: ids.filter((id) => result?.[id] === 1),
      };
    },
  };
};
