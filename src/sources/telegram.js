/**
 * Telegram source adapter.
 *
 * `parseArchive` accepts the JSON shape produced by Telegram Desktop's
 * "Export chat history" feature, both per-chat and all-chats exports.
 * The live side uses Telegram's Bot API (`getUpdates`, `sendMessage`,
 * `setMyName`, `setMyDescription`) so a user-provided bot token can
 * pull incoming bot-visible messages and send queued replies.
 */

import { buildMessageLink } from './link.js';

const SOURCE = 'telegram';

const fromTextEntity = (text) => {
  if (typeof text === 'string') {
    return text;
  }
  if (Array.isArray(text)) {
    return text.map(fromTextEntity).join('');
  }
  if (text && typeof text === 'object' && 'text' in text) {
    return text.text;
  }
  return '';
};

const parseArchiveObject = (archive) =>
  typeof archive === 'string' ? JSON.parse(archive) : archive;

const archiveChats = (obj) => {
  if (Array.isArray(obj)) {
    return [{ id: 'telegram', name: 'telegram', messages: obj }];
  }
  if (obj.chats?.list) {
    return obj.chats.list;
  }
  if (obj.messages) {
    return [obj];
  }
  return [];
};

const messageText = (msg) => {
  const direct = fromTextEntity(msg.text);
  if (direct) {
    return direct;
  }
  return fromTextEntity(msg.text_entities);
};

const messageTimestamp = (msg) => {
  if (msg.date) {
    return msg.date;
  }
  if (msg.date_unixtime) {
    return new Date(Number(msg.date_unixtime) * 1000).toISOString();
  }
  return undefined;
};

const senderId = (msg) =>
  String(msg.from_id ?? msg.actor_id ?? msg.from ?? msg.sender_id ?? 'unknown');

const liveToken = () => globalThis.process?.env?.TELEGRAM_BOT_TOKEN ?? null;

const botMessage = (update) =>
  update.message ??
  update.edited_message ??
  update.channel_post ??
  update.edited_channel_post ??
  update.business_message ??
  update.edited_business_message ??
  null;

const botSender = (message) =>
  String(
    message.from?.id ??
      message.sender_chat?.id ??
      message.author_signature ??
      'unknown'
  );

const botChat = (message) =>
  String(message.chat?.id ?? message.business_connection_id ?? 'unknown');

export const telegramUpdatesToLinks = (updates) => {
  const out = [];
  for (const update of updates ?? []) {
    const message = botMessage(update);
    if (!message) {
      continue;
    }
    out.push(
      buildMessageLink({
        source: SOURCE,
        externalId: String(message.message_id ?? update.update_id),
        sender: botSender(message),
        chat: botChat(message),
        body: message.text ?? message.caption ?? '',
        timestamp: message.date
          ? new Date(Number(message.date) * 1000).toISOString()
          : undefined,
        replyTo: message.reply_to_message?.message_id
          ? String(message.reply_to_message.message_id)
          : null,
      })
    );
  }
  return out;
};

export const createTelegramBotLive = ({
  token = null,
  fetchImpl = globalThis.fetch,
  baseUrl = 'https://api.telegram.org',
} = {}) => {
  const root = baseUrl.replace(/\/+$/, '');
  const call = async (method, body = {}, tokenOverride = null) => {
    const authToken = tokenOverride ?? token ?? liveToken();
    if (!authToken) {
      throw new Error(
        'telegram live API requires TELEGRAM_BOT_TOKEN or an explicit token'
      );
    }
    if (!fetchImpl) {
      throw new Error('telegram live API requires fetch');
    }
    const res = await fetchImpl(`${root}/bot${authToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) {
      throw new Error(
        `telegram ${method}: ${payload.description ?? `HTTP ${res.status}`}`
      );
    }
    return payload.result;
  };

  return {
    async pullMessages({
      offset = undefined,
      limit = 100,
      timeout = 0,
      allowedUpdates = ['message', 'edited_message', 'channel_post'],
      token: tokenOverride = null,
    } = {}) {
      const result = await call(
        'getUpdates',
        {
          offset,
          limit,
          timeout,
          allowed_updates: allowedUpdates,
        },
        tokenOverride
      );
      const nextOffset =
        result.length > 0
          ? Math.max(...result.map((u) => Number(u.update_id))) + 1
          : (offset ?? null);
      return {
        links: telegramUpdatesToLinks(result),
        nextOffset,
        rawCount: result.length,
      };
    },
    async listChats(options = {}) {
      const pulled = await this.pullMessages(options);
      const chats = new Map();
      for (const link of pulled.links) {
        chats.set(link.chat, {
          id: link.chat,
          source: SOURCE,
          lastMessage: link.id,
        });
      }
      return [...chats.values()];
    },
    async post(content) {
      const chat = content?.chat ?? content?.chatId ?? content?.to;
      const text =
        typeof content === 'string'
          ? content
          : (content?.text ?? content?.body);
      if (!chat) {
        throw new Error('telegram live.post requires a chat/chatId target');
      }
      const result = await call('sendMessage', { chat_id: chat, text });
      return {
        ok: true,
        messageId: String(result.message_id),
        chat: String(result.chat?.id ?? chat),
      };
    },
    async syncProfile(profile) {
      const results = [];
      if (profile.name) {
        results.push({
          method: 'setMyName',
          result: await call('setMyName', {
            name: profile.name,
          }),
        });
      }
      if (profile.bio) {
        results.push({
          method: 'setMyDescription',
          result: await call('setMyDescription', {
            description: profile.bio,
          }),
        });
      }
      return results;
    },
  };
};

export const telegramSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const chats = archiveChats(parseArchiveObject(archive));
    const out = [];
    const seen = new Set();
    for (const chat of chats) {
      const chatId = String(chat.id ?? chat.name ?? 'unknown');
      for (const msg of chat.messages ?? []) {
        if (msg.type !== 'message') {
          continue;
        }
        const id = String(msg.id);
        const externalId = seen.has(id) ? `${chatId}:${id}` : id;
        seen.add(id);
        out.push(
          buildMessageLink({
            source: SOURCE,
            externalId,
            sender: senderId(msg),
            chat: chatId,
            body: messageText(msg),
            timestamp: messageTimestamp(msg),
            replyTo: msg.reply_to_message_id
              ? String(msg.reply_to_message_id)
              : null,
          })
        );
      }
    }
    return out;
  },
  live: createTelegramBotLive(),
};
