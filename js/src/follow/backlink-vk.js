import { createFollowVkCalls } from './vk-calls.js';
import { incomingFollowLinks } from './incoming-links.js';
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

const deleteIncoming =
  (call, identity) =>
  async ({ chat, ids, cancelled, read = (use) => use() }) => {
    const peer = backlinkPeer(chat);
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 200 ||
      ids.some((id) => typeof id !== 'string' || publicationId(id) !== id) ||
      new Set(ids).size !== ids.length
    ) {
      throw backlinkFailure('bad-request');
    }
    // The earlier history scan is only a candidate list. Re-read exact IDs
    // before deletion so outgoing, service or changed-peer rows cannot pass.
    const rows = messages(
      await read(() =>
        call('messages.getById', { message_ids: ids.join(',') })
      ),
      peer,
      ids.length
    );
    if (
      rows.length !== ids.length ||
      new Set(rows.map((row) => String(row.id))).size !== ids.length ||
      rows.some(
        (row) =>
          !ids.includes(String(row.id)) ||
          row.out !== 0 ||
          row.action ||
          [true, 1].includes(row.deleted) ||
          [true, 1].includes(row.is_unavailable)
      )
    ) {
      throw responseFailure();
    }
    await read(identity);
    const result = await call(
      'messages.delete',
      { peer_id: peer, message_ids: ids.join(','), delete_for_all: 0 },
      true,
      { cancelled }
    );
    return { confirmed: ids.filter((id) => result?.[id] === 1) };
  };

// This adapter intentionally uses only single calls. The workflow owns timeout
// retries; VK rate limits and permissions must reach its receipts unchanged.
export const createBacklinkVk = async (options) => {
  const { call, identity } = await createFollowVkCalls(options);
  return {
    async describe(chat) {
      const peer = backlinkPeer(chat);
      const owner = await identity();
      const result = await call('messages.getConversationsById', {
        peer_ids: peer,
      });
      const conversation = conversationOf(result, peer);
      await identity();
      return {
        owner,
        chat: peer,
        title: String(conversation.chat_settings?.title ?? '').slice(0, 256),
        canWrite: [true, 1].includes(conversation.can_write?.allowed),
        canCleanup: true,
      };
    },
    async post({ chat, backlink, key, cancelled, read = (use) => use() }) {
      await read(identity);
      const result = await call(
        'messages.send',
        {
          peer_id: backlinkPeer(chat),
          message: backlink,
          random_id: vkRandomId(key),
        },
        true,
        { cancelled }
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
    async links({ chat, targetSource, historyLimit, maxLinks }) {
      const rows = messages(
        await call('messages.getHistory', {
          peer_id: backlinkPeer(chat),
          count: historyLimit,
        }),
        chat,
        historyLimit
      );
      return incomingFollowLinks(rows, {
        source: 'vk',
        targetSource,
        maxLinks,
      });
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
    deleteIncoming: deleteIncoming(call, identity),
  };
};
