import { createVkLive } from '../sources/vk.js';
import { liveOptionsFrom } from '../sources/index.js';
import { extractTelegramLinks } from './telegram-links.js';

const GROUP_BASE = 2000000000;
const fail = (code, message) => Object.assign(new Error(message), { code });
const integer = (value, fallback, min, max) => {
  const n =
    value === undefined
      ? fallback
      : typeof value === 'number' ||
          (typeof value === 'string' && /^\d+$/u.test(value))
        ? Number(value)
        : NaN;
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw fail('bad-request', `Expected an integer between ${min} and ${max}`);
  }
  return n;
};
const boolean = (value) => {
  if (value === undefined || value === false || value === 'false') {
    return false;
  }
  if (value === true || value === 'true') {
    return true;
  }
  throw fail('bad-request', 'telegramOnly must be true or false');
};
const vkSource = (input) => {
  if (input.source && input.source !== 'vk') {
    throw fail(
      'unsupported',
      'Live Follow chat discovery currently supports VK'
    );
  }
};
const pageOf = (response, offset, limit) => {
  if (!Array.isArray(response?.items) || response.items.length > limit) {
    throw fail(
      'follow-provider-response',
      'VK did not return a valid conversation page'
    );
  }
  const total =
    Number.isSafeInteger(response.count) && response.count >= 0
      ? response.count
      : null;
  const scanned = response.items.length;
  const next = offset + scanned;
  const more =
    scanned > 0 && (total === null ? scanned === limit : next < total);
  const complete = !more && (total === null || next >= total);
  return {
    offset,
    limit,
    scanned,
    total,
    more,
    nextOffset: more ? next : null,
    complete,
  };
};
const conversationOf = (item) => item?.conversation ?? item;
const latestOf = (message) =>
  message
    ? {
        id: String(message.id ?? message.conversation_message_id ?? ''),
        sender: String(message.from_id ?? ''),
        timestamp: message.date ?? null,
        text: String(message.text ?? '').slice(0, 8192),
      }
    : null;
const settingsOf = (conversation) => {
  const settings = conversation.chat_settings ?? {};
  return {
    title: String(settings.title ?? ''),
    memberCount: Number.isSafeInteger(settings.members_count)
      ? settings.members_count
      : null,
    owner: settings.owner_id ?? null,
    state: settings.state ?? null,
    canWrite: [true, 1].includes(conversation.can_write?.allowed),
  };
};
const chatOf = (item) => {
  const conversation = conversationOf(item);
  const peer = conversation?.peer;
  if (
    peer?.type !== 'chat' ||
    !Number.isSafeInteger(peer.id) ||
    peer.id <= GROUP_BASE
  ) {
    return null;
  }
  const settings = settingsOf(conversation);
  const latest = latestOf(item.last_message);
  const telegramHints =
    /telegram|телеграм|(?:^|\s)тг(?:\s|$)/iu.test(settings.title) ||
    extractTelegramLinks([latest?.text ?? '']).links.length > 0;
  return {
    source: 'vk',
    chat: String(peer.id),
    localId: String(peer.id - GROUP_BASE),
    ...settings,
    latest,
    telegramHints,
  };
};
const peerOf = (value) => {
  const id = integer(value, NaN, 1, 2147483647);
  return id <= 147483647
    ? id + GROUP_BASE
    : id > GROUP_BASE
      ? id
      : (() => {
          throw fail(
            'bad-request',
            'Expected a VK group peer ID or local chat ID'
          );
        })();
};
const memberRows = (response) => {
  const profiles = new Map(
    (response.profiles ?? []).map((p) => [String(p.id), p])
  );
  const groups = new Map(
    (response.groups ?? []).map((p) => [String(-p.id), p])
  );
  return response.items.map((item) => {
    const id = String(item.member_id);
    const profile = profiles.get(id) ?? groups.get(id);
    return {
      id,
      name:
        profile?.name ??
        [profile?.first_name, profile?.last_name].filter(Boolean).join(' '),
      screenName: profile?.screen_name ?? null,
      invitedBy: item.invited_by ?? null,
      joinedAt: item.join_date ?? null,
      admin: item.is_admin === true || item.is_admin === 1,
      owner: item.is_owner === true || item.is_owner === 1,
    };
  });
};

// Explicit read operations only. Credentials stay in the owning store and the
// live adapter retains its bounded network time budget and request pacing.
export const createFollowDiscovery = ({
  store,
  liveFactory = createVkLive,
  ...options
}) => {
  let cached;
  const live = async () => {
    const credentials = await liveOptionsFrom(store, 'vk');
    if (!credentials.token) {
      throw fail(
        'not-connected',
        'Connect VK on this server to discover group chats'
      );
    }
    if (cached?.token !== credentials.token) {
      cached = {
        token: credentials.token,
        value: liveFactory({ ...options, ...credentials }),
      };
    }
    return cached.value;
  };
  return {
    async chats(input = {}) {
      vkSource(input);
      const offset = integer(input.offset, 0, 0, 1000000000);
      const limit = integer(input.limit, 50, 1, 200);
      const telegramOnly = boolean(input.telegramOnly);
      const response = await (
        await live()
      ).call('messages.getConversations', {
        count: limit,
        offset,
        filter: 'all',
        extended: 1,
        fields: 'screen_name',
      });
      const page = pageOf(response, offset, limit);
      const chats = response.items
        .map(chatOf)
        .filter((chat) => chat && (!telegramOnly || chat.telegramHints));
      return {
        source: 'vk',
        chats,
        page,
        filter: telegramOnly ? 'title-or-latest-message' : 'group-chats',
      };
    },
    async details(input = {}) {
      vkSource(input);
      const peer = peerOf(input.chat);
      const memberOffset = integer(input.memberOffset, 0, 0, 1000000000);
      const memberLimit = integer(input.memberLimit, 50, 1, 200);
      const messageLimit = integer(input.messageLimit, 10, 1, 100);
      const api = await live();
      const response = await api.call('messages.getConversationsById', {
        peer_ids: peer,
        extended: 1,
      });
      const chat = chatOf(response?.items?.[0]);
      if (!chat || chat.chat !== String(peer)) {
        throw fail(
          'follow-provider-response',
          'VK did not return the requested group'
        );
      }
      const members = await api.call('messages.getConversationMembers', {
        peer_id: peer,
        offset: memberOffset,
        count: memberLimit,
        extended: 1,
        fields: 'first_name,last_name,screen_name',
      });
      const memberPage = pageOf(members, memberOffset, memberLimit);
      const history = await api.call('messages.getHistory', {
        peer_id: peer,
        count: messageLimit,
        offset: 0,
      });
      const messagePage = pageOf(history, 0, messageLimit);
      return {
        source: 'vk',
        chat,
        members: memberRows(members),
        memberPage,
        messages: history.items.map(latestOf),
        messagePage,
      };
    },
  };
};
