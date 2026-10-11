/**
 * Telegram source adapter.
 *
 * `parseArchive` accepts the JSON shape produced by Telegram Desktop's
 * "Export chat history" feature, both per-chat and all-chats exports.
 * The live side uses Telegram's Bot API (`getUpdates`, `sendMessage`,
 * `setMyName`, `setMyDescription`) so a user-provided bot token can
 * pull incoming bot-visible messages and send queued replies.
 * Greeting stickers (issue #35) go out through `sendSticker`; packs are
 * enumerated with `getStickerSet`, and their thumbnails are fetched by
 * the local server (`fetchFile`) because Bot API file links embed the
 * bot token and must never reach the browser.
 *
 * Issue #31 / PR #34: `setTyping` shows the bot's typing status via
 * `sendChatAction`, and `chatMembers` lists what the Bot API exposes
 * about a chat's members (see the limitation note on the method).
 */

import { buildMessageLink } from './link.js';
import { contentSticker } from './sticker.js';
import { greetingEmoji } from '../greetings/detect.js';

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

const botSticker = (message) =>
  message.sticker
    ? {
        id: String(message.sticker.file_unique_id ?? message.sticker.file_id),
        fileId: message.sticker.file_id ?? null,
        pack: message.sticker.set_name ?? null,
        emoji: message.sticker.emoji ?? null,
      }
    : null;

const archiveSticker = (msg) =>
  msg.media_type === 'sticker'
    ? { id: msg.file ?? null, pack: null, emoji: msg.sticker_emoji ?? null }
    : null;

const isGreetingEmoji = (emoji) =>
  Boolean(emoji) && greetingEmoji.some((wave) => emoji.includes(wave));

const stickerFormat = (sticker) => {
  if (sticker.is_animated) {
    return 'tgs';
  }
  return sticker.is_video ? 'webm' : 'webp';
};

/** One `getStickerSet` result reduced to its greeting stickers. */
const greetingStickersOfSet = (set, entry) => {
  const name = set.name ?? entry.name;
  return (set.stickers ?? [])
    .filter((sticker) => entry.all || isGreetingEmoji(sticker.emoji))
    .map((sticker) => ({
      network: SOURCE,
      id: sticker.file_id,
      uniqueId: sticker.file_unique_id ?? null,
      pack: name,
      packTitle: set.title ?? name,
      emoji: sticker.emoji ?? null,
      format: stickerFormat(sticker),
      thumbnailFileId:
        sticker.thumbnail?.file_id ?? sticker.thumb?.file_id ?? null,
      addUrl: `https://t.me/addstickers/${name}`,
    }));
};

/** `sendSticker` for sticker content, `sendMessage` otherwise. */
const sendRequest = (content, chat) => {
  const sticker = contentSticker(content);
  const business = content?.businessConnectionId;
  if (sticker) {
    return [
      'sendSticker',
      {
        chat_id: chat,
        sticker: sticker.id ?? sticker.url,
        business_connection_id: business,
      },
    ];
  }
  const text =
    typeof content === 'string' ? content : (content?.text ?? content?.body);
  return [
    'sendMessage',
    { chat_id: chat, text, business_connection_id: business },
  ];
};

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
        chatType: message.chat?.type ?? null,
        sticker: botSticker(message),
      })
    );
  }
  return out;
};

/** Membership calls (issue #31 audiences) over the Bot API `call`. */
const membershipMethods = (call) => ({
  async friends() {
    throw new Error(
      'telegram Bot API has no friends/contacts list; use chatMembers'
    );
  },
  /**
   * The Bot API cannot enumerate every member of a group: only the
   * administrators (`getChatAdministrators`) and the total head count
   * (`getChatMemberCount`) are available. Regular members only become
   * known as they post (see `pullMessages`). Returns the admins plus
   * the reported total so callers can tell the list is partial.
   */
  async chatMembers(chatId, options = {}) {
    if (!chatId) {
      throw new Error('telegram chatMembers requires a chat id');
    }
    const admins = await call(
      'getChatAdministrators',
      { chat_id: chatId },
      options.token
    );
    const count = await call(
      'getChatMemberCount',
      { chat_id: chatId },
      options.token
    );
    const members = (admins ?? []).map(({ user = {} }) => ({
      user: String(user.id),
      name: [user.first_name, user.last_name].filter(Boolean).join(' ') || null,
      handle: user.username ?? null,
    }));
    return { members, count: Number(count), partial: true };
  },
});

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
    async setTyping({ chat, chatId } = {}, options = {}) {
      const target = chat ?? chatId;
      if (!target) {
        throw new Error('telegram setTyping requires a chat/chatId target');
      }
      return call(
        'sendChatAction',
        { chat_id: target, action: 'typing' },
        options.token
      );
    },
    ...membershipMethods(call),
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
    async post(content, { token: tokenOverride = null } = {}) {
      const chat = content?.chat ?? content?.chatId ?? content?.to;
      if (!chat) {
        throw new Error('telegram live.post requires a chat/chatId target');
      }
      const result = await call(...sendRequest(content, chat), tokenOverride);
      return {
        ok: true,
        messageId: String(result.message_id),
        chat: String(result.chat?.id ?? chat),
      };
    },
    /**
     * Greeting stickers from the named sets. A sticker qualifies when
     * its emoji is a greeting gesture, or when the set is listed with
     * `{all: true}` because the whole pack is greetings. `file_id`s are
     * only valid for the bot that listed them, so they are fetched live
     * rather than stored in the catalogue.
     */
    async listGreetingStickers({
      sets = [],
      token: tokenOverride = null,
    } = {}) {
      const stickers = [];
      const failures = [];
      for (const raw of sets) {
        const entry = typeof raw === 'string' ? { name: raw } : raw;
        try {
          const set = await call(
            'getStickerSet',
            { name: entry.name },
            tokenOverride
          );
          stickers.push(...greetingStickersOfSet(set, entry));
        } catch (err) {
          failures.push({ pack: entry.name, error: err.message });
        }
      }
      return { stickers, failures };
    },
    /**
     * Downloads a file (e.g. a sticker thumbnail) through `getFile`.
     * Server-side only: the download URL contains the bot token.
     */
    async fetchFile(fileId, { token: tokenOverride = null } = {}) {
      const file = await call('getFile', { file_id: fileId }, tokenOverride);
      const authToken = tokenOverride ?? token ?? liveToken();
      const res = await fetchImpl(
        `${root}/file/bot${authToken}/${file.file_path}`
      );
      if (!res.ok) {
        throw new Error(`telegram getFile: HTTP ${res.status}`);
      }
      return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        path: file.file_path,
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
            chatType: chat.type ?? null,
            chatName: chat.type === 'personal_chat' ? chat.name : null,
            senderName: typeof msg.from === 'string' ? msg.from : null,
            sticker: archiveSticker(msg),
          })
        );
      }
    }
    return out;
  },
  live: createTelegramBotLive(),
};
