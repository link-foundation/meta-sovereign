/**
 * VK source adapter (R-E1).
 *
 * Accepts the JSON shape produced by konard/vk-export. The live side
 * uses VK's method API (`messages.getConversations`, `messages.getHistory`,
 * `messages.send`, `status.set`, and `account.saveProfileInfo`) behind
 * an injectable fetch/baseUrl pair for testability.
 */

import { buildMessageLink } from './link.js';
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
    throw new Error(`vk API ${code}: ${message}`);
  }
  return payload?.response ?? payload;
};

export const createVkLive = ({
  token = null,
  fetchImpl = globalThis.fetch,
  baseUrl = 'https://api.vk.com',
  apiVersion = '5.199',
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
      let raw = [];
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
