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
import { DEFAULT_TIMEOUT_MS, timedRequest } from './http.js';

// Bot API methods that only read: a timeout there is retried (R-Z1).
const BOT_READS = /^get[A-Z]/;

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

const compact = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(
      (entry) => entry[1] !== null && entry[1] !== undefined
    )
  );

const botForwardedFrom = (message) => {
  const origin = message.forward_origin;
  if (origin) {
    if (origin.type === 'user') {
      return {
        id: String(origin.sender_user?.id),
        name:
          [origin.sender_user?.first_name, origin.sender_user?.last_name]
            .filter(Boolean)
            .join(' ') || null,
      };
    }
    if (origin.type === 'channel') {
      return { id: String(origin.chat?.id), name: origin.chat?.title || null };
    }
    if (origin.type === 'hidden_user') {
      return { name: origin.sender_user_name || null };
    }
  }
  if (message.forward_from) {
    return {
      id: String(message.forward_from.id),
      name:
        [message.forward_from.first_name, message.forward_from.last_name]
          .filter(Boolean)
          .join(' ') || null,
    };
  }
  return null;
};

const photoAtt = (message) => {
  if (!message.photo) {
    return null;
  }
  const largest = message.photo.reduce(
    (best, p) => ((p.file_size ?? 0) > (best.file_size ?? 0) ? p : best),
    message.photo[0]
  );
  return compact({
    kind: 'photo',
    width: largest?.width,
    height: largest?.height,
  });
};

const documentAtt = (doc) =>
  compact({
    kind: 'file',
    name: doc.file_name ?? null,
    mime: doc.mime_type ?? null,
    size: doc.file_size ?? null,
  });

const voiceAtt = (v) =>
  compact({
    kind: 'voice',
    duration: v.duration ?? null,
    mime: v.mime_type ?? null,
  });

const videoAtt = (v) =>
  compact({
    kind: 'video',
    duration: v.duration ?? null,
    width: v.width ?? null,
    height: v.height ?? null,
  });

const audioAtt = (a) =>
  compact({
    kind: 'audio',
    duration: a.duration ?? null,
    mime: a.mime_type ?? null,
    name: a.file_name ?? null,
    title: a.title ?? null,
  });

const mediaAtt = (message) => {
  if (message.document) {
    return documentAtt(message.document);
  }
  if (message.voice) {
    return voiceAtt(message.voice);
  }
  if (message.video) {
    return videoAtt(message.video);
  }
  if (message.audio) {
    return audioAtt(message.audio);
  }
  return null;
};

const miscAtt = (message) => {
  if (message.location) {
    return {
      kind: 'location',
      lat: message.location.latitude,
      lon: message.location.longitude,
    };
  }
  if (message.contact) {
    return compact({
      kind: 'contact',
      name:
        [message.contact.first_name, message.contact.last_name]
          .filter(Boolean)
          .join(' ') || null,
    });
  }
  if (message.poll) {
    return compact({ kind: 'poll', title: message.poll.question ?? null });
  }
  return null;
};

/** Non-sticker attachments extracted from a Bot API message. */
const botAttachment = (message) => {
  const att = photoAtt(message) ?? mediaAtt(message) ?? miscAtt(message);
  return att ? [att] : null;
};

const botSenderName = (message) =>
  [message.from?.first_name, message.from?.last_name]
    .filter(Boolean)
    .join(' ') ||
  message.sender_chat?.title ||
  message.author_signature ||
  null;

const botChatName = (message) =>
  message.chat?.title ||
  (message.chat?.first_name
    ? [message.chat.first_name, message.chat.last_name]
        .filter(Boolean)
        .join(' ')
    : null) ||
  null;

const botLinkFields = (update, message) => {
  const isEdited = !!(
    update.edited_message ||
    update.edited_channel_post ||
    update.edited_business_message
  );
  return {
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
    senderName: botSenderName(message),
    chatName: botChatName(message),
    edited: isEdited
      ? new Date(Number(message.edit_date) * 1000).toISOString()
      : null,
    forwardedFrom: botForwardedFrom(message),
    attachments: botAttachment(message),
    raw: message,
  };
};

export const telegramReactionsFromUpdate = (update) => {
  if (!update?.message_reaction) {
    return null;
  }
  const mr = update.message_reaction;
  return {
    messageId: String(mr.message_id),
    chat: String(mr.chat?.id),
    reactions: (mr.new_reaction ?? []).map((r) => ({
      emoji: r.emoji ?? r.custom_emoji_id ?? String(r.type),
      count: 1,
    })),
  };
};

export const telegramUpdatesToLinks = (updates) => {
  const out = [];
  for (const update of updates ?? []) {
    if (update.message_reaction) {
      continue;
    }
    const message = botMessage(update);
    if (!message) {
      continue;
    }
    out.push(buildMessageLink(botLinkFields(update, message)));
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

/** Profile update methods. */
const profileMethods = (call) => ({
  async syncProfile(profile) {
    const results = [];
    if (profile.name) {
      results.push({
        method: 'setMyName',
        result: await call('setMyName', { name: profile.name }),
      });
    }
    if (profile.bio) {
      results.push({
        method: 'setMyDescription',
        result: await call('setMyDescription', { description: profile.bio }),
      });
    }
    return results;
  },
});

/** Bot API mutation methods (edit, delete, react, forward). */
const actionMethods = (call) => {
  const setMessageReaction = async (
    { chat, id, emoji, link } = {},
    options = {}
  ) => {
    const chatId = chat ?? link?.chat;
    const messageId = Number(id ?? link?.id?.split(':').pop());
    const reaction = emoji ? [{ type: 'emoji', emoji }] : [];
    return call(
      'setMessageReaction',
      { chat_id: chatId, message_id: messageId, reaction },
      options.token
    );
  };
  return {
    async editMessage({ chat, id, text, link } = {}, options = {}) {
      const chatId = chat ?? link?.chat;
      const messageId = Number(id ?? link?.id?.split(':').pop());
      return call(
        'editMessageText',
        { chat_id: chatId, message_id: messageId, text },
        options.token
      );
    },
    async deleteMessages({ chat, ids, links } = {}, options = {}) {
      const chatId = chat ?? links?.[0]?.chat;
      const rawIds = ids ?? links?.map((l) => Number(l.id?.split(':').pop()));
      const messageIds = (rawIds ?? []).filter(Boolean);
      return call(
        'deleteMessages',
        { chat_id: chatId, message_ids: messageIds },
        options.token
      );
    },
    setMessageReaction,
    react: setMessageReaction,
    async forwardMessages({ fromChat, ids, toChat, links } = {}, options = {}) {
      const from = fromChat ?? links?.[0]?.chat;
      const rawIds = ids ?? links?.map((l) => Number(l.id?.split(':').pop()));
      const messageIds = (rawIds ?? []).filter(Boolean);
      return call(
        'forwardMessages',
        { from_chat_id: from, chat_id: toChat, message_ids: messageIds },
        options.token
      );
    },
  };
};

export const createTelegramBotLive = ({
  token = null,
  fetchImpl = globalThis.fetch,
  baseUrl = 'https://api.telegram.org',
  // `{ timeoutMs?, retries?, sleep? }` for the outbound time budget.
  timing = null,
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
    // A long poll waits `timeout` seconds on purpose (R-Z1).
    const wait = Number(body.timeout) > 0 ? body.timeout * 1000 : 0;
    return timedRequest(
      fetchImpl,
      `${root}/bot${authToken}/${method}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      {
        timeoutMs: DEFAULT_TIMEOUT_MS + wait,
        write: !BOT_READS.test(method),
        ...(timing ?? {}),
      },
      async (res) => {
        const payload = await res.json();
        if (!res.ok || payload.ok === false) {
          throw new Error(
            `telegram ${method}: ${payload.description ?? `HTTP ${res.status}`}`
          );
        }
        return payload.result;
      }
    );
  };

  return {
    async pullMessages({
      offset = undefined,
      limit = 100,
      timeout = 0,
      allowedUpdates = [
        'message',
        'edited_message',
        'channel_post',
        'message_reaction',
      ],
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
    ...profileMethods(call),
    ...actionMethods(call),
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
