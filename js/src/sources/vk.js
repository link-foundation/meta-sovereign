/**
 * VK source adapter (R-E1).
 *
 * Accepts the JSON shape produced by konard/vk-export. The live side
 * uses VK's method API (`messages.getConversations`, `messages.getHistory`,
 * `messages.send`, `status.set`, and `account.saveProfileInfo`) behind
 * an injectable fetch/baseUrl pair for testability.
 *
 * Issue #31 / PR #34: the live side also shows typing status
 * (`messages.setActivity`, the konard/vk-bot read -> typing -> reply
 * pacing) and lists audiences automation can target: friends
 * (`friends.get`), community members (`groups.getMembers`) and chat
 * members (`messages.getConversationMembers`). `vkTypingFromUpdate`
 * maps long-poll typing events to `typing` links.
 *
 * VK moved its developer endpoints to the vk.ru domain in 2025
 * (api.vk.ru, oauth.vk.ru, dev.vk.ru), so that is the default host;
 * tokens issued through oauth.vk.com work against either host.
 */

import { buildMessageLink } from './link.js';
import { typingLink } from './live-links.js';
import {
  compact,
  contentTarget,
  contentText,
  requestJson,
  resolveOption,
} from './http.js';

const SOURCE = 'vk';

const vkExternalId = (msg) =>
  String(msg.id ?? msg.conversation_message_id ?? `${msg.peer_id}-${msg.date}`);

const vkSender = (msg) => String(msg.from_id ?? (msg.out ? 'me' : 'unknown'));

const vkChat = (msg, conversation) =>
  String(
    msg.peer_id ??
      conversation?.conversation?.peer?.id ??
      conversation?.peer?.id ??
      'unknown'
  );

const vkReplyTo = (msg) => {
  if (msg.reply_message?.id) {
    return String(msg.reply_message.id);
  }
  return msg.reply_to ? String(msg.reply_to) : null;
};

const asMessageLink = (msg, conversation = null) =>
  buildMessageLink({
    source: SOURCE,
    externalId: vkExternalId(msg),
    sender: vkSender(msg),
    chat: vkChat(msg, conversation),
    body: msg.text ?? msg.body ?? '',
    timestamp: msg.date ?? msg.created_at ?? null,
    replyTo: vkReplyTo(msg),
  });

const unwrapVk = (payload) => {
  if (payload?.error) {
    const code = payload.error.error_code ?? 'unknown';
    const message = payload.error.error_msg ?? 'VK API error';
    const error = new Error(`vk API ${code}: ${message}`);
    error.vkCode = code;
    throw error;
  }
  return payload?.response ?? payload;
};

const PEOPLE_FIELDS = 'first_name,last_name,domain,screen_name';

const vkPerson = (profile) => ({
  user: String(profile.id),
  name:
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
    profile.name ||
    null,
  handle: profile.domain ?? profile.screen_name ?? null,
});

const vkUnixIso = (seconds) =>
  seconds ? new Date(Number(seconds) * 1000).toISOString() : undefined;

/**
 * Map one VK long-poll update to typing links (possibly empty).
 *
 * - Bots Long Poll: `{ type: 'message_typing_state', object: { state,
 *   from_id, to_id } }` — the user `from_id` types in the dialog with
 *   the community, so the chat peer is `from_id`.
 * - User Long Poll arrays: `[61, user_id]` (typing in a dialog),
 *   `[62, user_id, chat_id]` (typing in a chat, chat peer is
 *   2000000000 + chat_id) and `[63, peer_id, [user_ids], total, ts]`
 *   (current API: users typing in a conversation).
 */
export const vkTypingFromUpdate = (update, { now = Date.now() } = {}) => {
  const at = new Date(now).toISOString();
  if (update?.type === 'message_typing_state') {
    const { state, from_id: user } = update.object ?? {};
    return [
      typingLink({
        source: SOURCE,
        chat: user,
        user,
        state: state === 'typing' ? 'typing' : 'idle',
        at,
      }),
    ];
  }
  if (!Array.isArray(update)) {
    return [];
  }
  const [code, first, second, , ts] = update;
  if (code === 61) {
    return [typingLink({ source: SOURCE, chat: first, user: first, at })];
  }
  if (code === 62) {
    const chat = 2000000000 + Number(second);
    return [typingLink({ source: SOURCE, chat, user: first, at })];
  }
  if (code === 63) {
    const users = Array.isArray(second) ? second : [second];
    return users.map((user) =>
      typingLink({ source: SOURCE, chat: first, user, at: vkUnixIso(ts) ?? at })
    );
  }
  return [];
};

// Typing status and audience listing (issue #31 / PR #34), built on the
// adapter's `call` so every request shares its auth and error handling.
const vkLiveAudience = (call) => {
  // Walk `count`/`offset` pages until VK's reported total is reached.
  const paginate = async (method, params, options = {}, pageSize = 1000) => {
    const out = [];
    let offset = Number(options.offset ?? 0);
    for (;;) {
      const page = await call(
        method,
        { ...params, count: pageSize, offset, fields: PEOPLE_FIELDS },
        options.token
      );
      const items = page?.items ?? [];
      out.push(...items.map(vkPerson));
      offset += items.length;
      const total = Number(page?.count ?? out.length);
      if (items.length === 0 || offset >= total) {
        return out;
      }
    }
  };

  return {
    async setTyping({ chat, peerId } = {}, options = {}) {
      const peer = chat ?? peerId;
      if (!peer) {
        throw new Error('vk setTyping peer_id is required');
      }
      return call(
        'messages.setActivity',
        { peer_id: peer, type: 'typing' },
        options.token
      );
    },
    async friends(options = {}) {
      return paginate('friends.get', {}, options, 5000);
    },
    async communityMembers(groupId, options = {}) {
      if (!groupId) {
        throw new Error('vk communityMembers group_id is required');
      }
      return paginate('groups.getMembers', { group_id: groupId }, options);
    },
    async chatMembers(peerId, options = {}) {
      if (!peerId) {
        throw new Error('vk chatMembers peer_id is required');
      }
      const response = await call(
        'messages.getConversationMembers',
        { peer_id: peerId, fields: PEOPLE_FIELDS },
        options.token
      );
      // Communities appear as negative member ids; their names live in
      // `groups` while people come from `profiles`.
      const known = new Map(
        [
          ...(response?.profiles ?? []),
          ...(response?.groups ?? []).map((g) => ({ ...g, id: -g.id })),
        ].map((profile) => [String(profile.id), vkPerson(profile)])
      );
      return (response?.items ?? []).map((item) => {
        const user = String(item.member_id);
        return known.get(user) ?? { user, name: null, handle: null };
      });
    },
  };
};

export const VK_API_BASE = 'https://api.vk.ru';
export const VK_API_VERSION = '5.199';

export const createVkLive = ({
  token = null,
  fetchImpl = globalThis.fetch,
  baseUrl = VK_API_BASE,
  apiVersion = VK_API_VERSION,
} = {}) => {
  const call = async (method, params = {}, overrideToken = null) => {
    const accessToken = resolveOption(
      overrideToken ?? token,
      'VK_ACCESS_TOKEN',
      'VK access token'
    );
    const body = new URLSearchParams({
      ...compact(params),
      access_token: accessToken,
      v: apiVersion,
    });
    const payload = await requestJson(
      fetchImpl,
      `${baseUrl}/method/${method}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }
    );
    return unwrapVk(payload);
  };

  return {
    call,
    ...vkLiveAudience(call),
    async listChats(options = {}) {
      return call(
        'messages.getConversations',
        { count: options.limit ?? options.count ?? 20, offset: options.offset },
        options.token
      );
    },
    async pullMessages(options = {}) {
      const count = options.limit ?? options.count ?? 20;
      let response;
      let raw;
      if (options.peerId) {
        response = await call(
          'messages.getHistory',
          {
            peer_id: options.peerId,
            count,
            offset: options.offset,
            start_message_id: options.startMessageId,
          },
          options.token
        );
        raw = response.items ?? [];
      } else {
        response = await call(
          'messages.getConversations',
          { count, offset: options.offset, filter: options.filter ?? 'all' },
          options.token
        );
        raw = (response.items ?? [])
          .map((item) => item.last_message ?? item.message)
          .filter(Boolean)
          .map((msg, index) => ({
            msg,
            conversation: response.items[index],
          }));
      }
      const links = raw.map((entry) =>
        entry.msg
          ? asMessageLink(entry.msg, entry.conversation)
          : asMessageLink(entry)
      );
      return {
        links,
        rawCount: raw.length,
        nextOffset:
          raw.length > 0 ? Number(options.offset ?? 0) + raw.length : null,
        raw: response,
      };
    },
    async post(content, options = {}) {
      const peerId =
        options.peerId ?? contentTarget(content) ?? options.to ?? options.chat;
      const message = contentText(content);
      if (!peerId) {
        throw new Error('vk post peer_id is required');
      }
      if (!message) {
        throw new Error('vk post message text is required');
      }
      return call(
        'messages.send',
        {
          peer_id: peerId,
          message,
          random_id:
            options.randomId ??
            (typeof content === 'object' ? content.randomId : undefined) ??
            Date.now(),
        },
        options.token
      );
    },
    async syncProfile(profile, options = {}) {
      const results = [];
      const status = profile.status ?? profile.about ?? profile.description;
      if (status) {
        results.push(
          await call('status.set', { text: String(status) }, options.token)
        );
      }
      if (profile.firstName || profile.lastName || profile.name) {
        const [first, ...rest] = String(profile.name ?? '').split(/\s+/);
        results.push(
          await call(
            'account.saveProfileInfo',
            {
              first_name: profile.firstName ?? first,
              last_name: profile.lastName ?? rest.join(' '),
            },
            options.token
          )
        );
      }
      return results;
    },
  };
};

export const vkSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = typeof archive === 'string' ? JSON.parse(archive) : archive;
    const out = [];
    for (const conv of obj.conversations ?? []) {
      for (const msg of conv.messages ?? []) {
        out.push(
          buildMessageLink({
            source: SOURCE,
            externalId: String(msg.id),
            sender: String(msg.from_id),
            chat: String(conv.peer?.id ?? conv.id),
            body: msg.text ?? '',
            timestamp: msg.date,
            replyTo: msg.reply_message?.id
              ? String(msg.reply_message.id)
              : null,
          })
        );
      }
    }
    return out;
  },
  live: createVkLive(),
};
