/**
 * VK source adapter (R-E1).
 *
 * Accepts the JSON shape produced by konard/vk-export. The live side
 * uses VK's method API (`messages.getConversations`, `messages.getHistory`,
 * `messages.send`, `status.set`, and `account.saveProfileInfo`) behind
 * an injectable fetch/baseUrl pair for testability. Greeting stickers
 * (issue #35) go out through `messages.send` with `sticker_id`, and
 * `listGreetingStickers` finds them via `store.getStickersKeywords`.
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
import { contentSticker } from './sticker.js';
import { isGreetingText } from '../greetings/detect.js';
import { vkStickerPreview } from '../greetings/catalog.js';
import {
  decodeVkHtml,
  looksLikeVkHtml,
  parseVkHtmlPage,
} from './vk-html-archive.js';
import {
  VK_USER_RPS,
  createRateLimiter,
  vkApiError,
  vkRandomId,
  withTooManyBackoff,
} from './vk-limits.js';

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

const vkStickerOf = (msg) => {
  const attachment = (msg.attachments ?? []).find(
    (item) => item?.type === 'sticker' && item.sticker
  );
  if (!attachment) {
    return null;
  }
  const { sticker } = attachment;
  return {
    id: String(sticker.sticker_id ?? sticker.id),
    pack: sticker.product_id ? String(sticker.product_id) : null,
  };
};

const vkKeywordStickers = (response, match) => {
  const seen = new Map();
  for (const item of response?.dictionary ?? []) {
    const words = (item.words ?? []).filter((word) => match(word));
    if (words.length === 0) {
      continue;
    }
    const stickers = [
      ...(item.user_stickers ?? item.stickers ?? []),
      // Promoted stickers belong to packs the user does not own yet.
      ...(item.promoted_stickers ?? []),
    ];
    for (const sticker of stickers) {
      const id = String(sticker.sticker_id);
      if (!seen.has(id)) {
        seen.set(id, {
          network: SOURCE,
          id,
          packId: sticker.product_id ?? sticker.pack_id ?? null,
          owned: sticker.is_allowed !== false,
          keywords: words,
          // Always vk.com, the one sticker origin the CSP allows.
          previewUrl: vkStickerPreview(id),
        });
      }
    }
  }
  return [...seen.values()];
};

/** Map emoji to VK reaction numeric id. */
export const VK_REACTION_EMOJI_TO_ID = {
  '❤️': 1,
  '🔥': 2,
  '😂': 3,
  '👍': 4,
  '💩': 5,
  '❓': 6,
  '😭': 7,
  '👎': 8,
  '👌': 9,
  '😐': 10,
  '😡': 11,
  '🤔': 12,
};

const vkChatType = (peerId) => {
  if (peerId === null || peerId === undefined) {
    return null;
  }
  const id = Number(peerId);
  if (id >= 2000000000) {
    return 'group';
  }
  if (id < 0) {
    return 'channel';
  }
  return 'private';
};

// One handler per VK attachment type — kept small so vkAttachments stays
// under complexity 10.
const vkAttachmentHandlers = {
  photo(att) {
    const sizes = att.photo?.sizes ?? [];
    const fallback = sizes.at(-1) ?? null;
    const largest = sizes.reduce(
      (best, s) => (s.width >= (best?.width ?? 0) ? s : best),
      fallback
    );
    return largest
      ? {
          kind: 'photo',
          url: largest.url,
          width: largest.width,
          height: largest.height,
        }
      : null;
  },
  doc(att) {
    const doc = att.doc ?? {};
    // Doc types: 3 gif, 4 image, 5 audio, 6 video (VK docs, R-Z8).
    const kind = { 3: 'gif', 4: 'photo', 5: 'voice' }[doc.type] ?? 'file';
    return {
      kind,
      url: doc.url ?? null,
      name: doc.title ?? null,
      size: doc.size ?? null,
      ext: doc.ext ?? null,
    };
  },
  graffiti(att) {
    return { kind: 'photo', url: att.graffiti?.url ?? null };
  },
  audio(att) {
    const { artist, title } = att.audio ?? {};
    return {
      kind: 'audio',
      title: [artist, title].filter(Boolean).join(' - ') || null,
      duration: att.audio?.duration ?? null,
    };
  },
  wall(att) {
    return {
      kind: 'link',
      url: `https://vk.com/wall${att.wall?.owner_id ?? att.wall?.from_id}_${att.wall?.id}`,
      title: String(att.wall?.text ?? '').slice(0, 120) || null,
    };
  },
  poll(att) {
    return { kind: 'poll', title: att.poll?.question ?? null };
  },
  audio_message(att) {
    const am = att.audio_message ?? {};
    return {
      kind: 'voice',
      url: am.link_ogg ?? am.link_mp3 ?? null,
      duration: am.duration ?? null,
    };
  },
  video(att) {
    const vid = att.video ?? {};
    const thumb =
      vid.image?.find((i) => i.width >= 320)?.url ??
      vid.image?.[0]?.url ??
      null;
    return {
      kind: 'video',
      title: vid.title ?? null,
      duration: vid.duration ?? null,
      thumb,
    };
  },
  sticker(att) {
    const imgs = att.sticker?.images ?? [];
    return {
      kind: 'sticker',
      url: imgs.find((i) => i.width >= 128)?.url ?? imgs[0]?.url ?? null,
    };
  },
  link(att) {
    return {
      kind: 'link',
      url: att.link?.url ?? null,
      title: att.link?.title ?? null,
    };
  },
  geo(att) {
    return {
      kind: 'location',
      lat: att.geo?.coordinates?.latitude ?? null,
      lon: att.geo?.coordinates?.longitude ?? null,
      title: att.geo?.place?.title ?? null,
    };
  },
};

// A type this adapter cannot draw still names itself, so a message with
// only a gift or a market item is not an empty bubble (R-Z8).
const vkOtherAttachment = (att) =>
  att?.type ? { kind: 'other', title: String(att.type) } : null;

/** Map VK attachment array to canonical shape; returns null when empty. */
const vkAttachments = (attachments) => {
  if (!attachments?.length) {
    return null;
  }
  const mapped = attachments
    .map((att) => {
      const handler = att?.type ? vkAttachmentHandlers[att.type] : null;
      return handler ? handler(att) : vkOtherAttachment(att);
    })
    .filter(Boolean);
  return mapped.length ? mapped : null;
};

// Reverse of VK_REACTION_EMOJI_TO_ID: the page draws an emoji, not a number.
// An id this table does not know stays a number (a new reaction VK added).
const VK_REACTION_ID_TO_EMOJI = Object.fromEntries(
  Object.entries(VK_REACTION_EMOJI_TO_ID).map(([emoji, id]) => [id, emoji])
);

/**
 * VK message `reactions: [{reaction_id, count, user_ids}]`; the message's
 * own `reaction_id` is the one the account itself set. Read-only here (R-Z8).
 */
const vkReactions = (reactions, ownReactionId = null) => {
  if (!reactions?.length) {
    return null;
  }
  return reactions.map((r) => {
    const id = Number(r.reaction_id);
    const item = {
      emoji: VK_REACTION_ID_TO_EMOJI[id] ?? String(r.reaction_id),
      reactionId: id,
      count: Number(r.count ?? r.user_ids?.length ?? 1),
    };
    if (r.user_react_id || (ownReactionId !== null && ownReactionId === id)) {
      item.mine = true;
    }
    return item;
  });
};

/** Build a Map<string userId, {name}> from VK extended profile/group arrays. */
const vkProfilesMap = (profiles, groups) => {
  const map = new Map();
  for (const p of profiles ?? []) {
    const name =
      [p.first_name, p.last_name].filter(Boolean).join(' ') || p.name || null;
    map.set(String(p.id), { name, deactivated: Boolean(p.deactivated) });
  }
  for (const g of groups ?? []) {
    map.set(String(-g.id), { name: g.name ?? null });
  }
  return map;
};

const vkPeerId = (msg, conversation) =>
  msg.peer_id ??
  conversation?.conversation?.peer?.id ??
  conversation?.peer?.id ??
  null;

// VK's `can_write.reason` codes that mean the other side cannot be written
// to: 900 we are in their blacklist, 901 they turned the community's messages
// off, 18 the user is blocked or deleted (R-Z7).
const VK_UNREACHABLE = new Set([18, 900, 901]);

/**
 * What a conversation says about writing to it (R-Z7): `blocked`, `left` (a
 * chat we left or were removed from) and `deletedAccount`, only when true;
 * the autopilot's planner skips such chats (../automation/safety.js).
 */
export const vkReachability = (item, peerProfile = null) => {
  const conversation = item?.conversation ?? {};
  const flags = {};
  if (['left', 'kicked'].includes(conversation.chat_settings?.state)) {
    flags.left = true;
  }
  const write = conversation.can_write;
  const reason = Number(write?.reason);
  if (write?.allowed === false && VK_UNREACHABLE.has(reason)) {
    const deleted = reason === 18 && peerProfile?.deactivated;
    flags[deleted ? 'deletedAccount' : 'blocked'] = true;
  }
  return flags;
};

/** Derives chatType/outgoing/edited/forwardedFrom from a raw VK message. */
const vkMessageMeta = (msg, conversation, peerProfile = null) => {
  const edited = msg.update_time
    ? new Date(Number(msg.update_time) * 1000).toISOString()
    : null;
  const forwardedFrom =
    (msg.fwd_messages?.length ?? 0) > 0
      ? { id: String(msg.fwd_messages[0].from_id ?? '') }
      : null;
  const outgoing = msg.out === 1 || msg.out === true ? true : null;
  return {
    chatType: vkChatType(vkPeerId(msg, conversation)),
    ...vkReachability(conversation, peerProfile),
    edited,
    forwardedFrom,
    outgoing,
  };
};

const asMessageLink = (
  msg,
  conversation = null,
  { senderName = null, chatName = null, peerProfile = null } = {}
) =>
  buildMessageLink({
    source: SOURCE,
    externalId: vkExternalId(msg),
    sender: vkSender(msg),
    chat: vkChat(msg, conversation),
    body: msg.text ?? msg.body ?? '',
    timestamp: msg.date ?? msg.created_at ?? null,
    replyTo: vkReplyTo(msg),
    sticker: vkStickerOf(msg),
    senderName,
    chatName,
    raw: msg,
    attachments: vkAttachments(msg.attachments),
    reactions: vkReactions(
      msg.reactions,
      msg.reaction_id === undefined ? null : Number(msg.reaction_id)
    ),
    ...vkMessageMeta(msg, conversation, peerProfile),
  });

const unwrapVk = (payload) => {
  if (payload?.error) {
    throw vkApiError(payload);
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

const vkConversationMessageId = (link) =>
  link?.raw?.conversation_message_id ?? link?.conversationMessageId ?? null;

// Message action methods (edit, delete, markRead, react, forward) —
// extracted so createVkLive stays under the line-count threshold.
const vkLiveActions = (call) => ({
  async editMessage({ chat, id, text, link } = {}, options = {}) {
    const peerId = chat ?? link?.chat;
    const msgId = id ?? link?.id?.split(':').pop();
    return call(
      'messages.edit',
      { peer_id: peerId, message_id: msgId, message: text },
      options.token
    );
  },
  async deleteMessages({ chat, ids, revoke, links } = {}, options = {}) {
    const peerId = chat ?? links?.[0]?.chat;
    const msgIds = ids ?? links?.map((l) => l.id?.split(':').pop());
    return call(
      'messages.delete',
      {
        peer_id: peerId,
        message_ids: (msgIds ?? []).join(','),
        delete_for_all: revoke ? 1 : undefined,
      },
      options.token
    );
  },
  async markRead({ chat, maxId, id, link } = {}, options = {}) {
    const peerId = chat ?? link?.chat;
    const startId = maxId ?? id ?? link?.id?.split(':').pop();
    return call(
      'messages.markAsRead',
      { peer_id: peerId, start_message_id: startId },
      options.token
    );
  },
  async react({ chat, emoji, link } = {}, options = {}) {
    const peerId = chat ?? link?.chat;
    // Reactions name a message by its number in the chat (cmid), not by
    // the global id our links keep; it is in the raw message.
    const msgId = vkConversationMessageId(link);
    if (!msgId) {
      throw Object.assign(
        new Error('VK: the message has no conversation_message_id'),
        { code: 'unsupported-action' }
      );
    }
    if (!emoji) {
      return call(
        'messages.deleteReaction',
        { peer_id: peerId, cmid: msgId },
        options.token
      );
    }
    const reactionId = VK_REACTION_EMOJI_TO_ID[emoji];
    if (!reactionId) {
      const err = new Error(`VK: unsupported reaction emoji: ${emoji}`);
      err.code = 'unsupported-reaction';
      throw err;
    }
    return call(
      'messages.sendReaction',
      { peer_id: peerId, cmid: msgId, reaction_id: reactionId },
      options.token
    );
  },
  async forwardMessages({ fromChat, ids, toChat, links } = {}, options = {}) {
    const fromPeer = fromChat ?? links?.[0]?.chat;
    const msgIds = ids ?? links?.map((l) => l.id?.split(':').pop());
    return call(
      'messages.send',
      {
        peer_id: toChat,
        forward: JSON.stringify({
          peer_id: fromPeer,
          message_ids: (msgIds ?? []).map(Number),
          is_reply: false,
        }),
        random_id: options.randomId ?? vkRandomId(options.clientId),
      },
      options.token
    );
  },
});

const conversationPeer = (c) =>
  c?.conversation?.peer?.id ?? c?.peer?.id ?? c?.peer_id;

// The conversation's own name: a chat's title, a person's or community's name.
const vkChatNameOf = (conversation, profiles) => {
  const title =
    conversation?.conversation?.chat_settings?.title ??
    conversation?.chat_settings?.title;
  const peer = conversationPeer(conversation);
  return (
    title ??
    (peer === undefined ? null : profiles.get(String(peer))?.name) ??
    null
  );
};

// Links from a getConversations or getHistory answer, with names (R-Z8).
export const vkLinksOf = (response, peerId = null) => {
  const profiles = vkProfilesMap(response.profiles, response.groups);
  const nameOf = (msg) => profiles.get(String(msg.from_id))?.name ?? null;
  if (peerId) {
    const chatName = profiles.get(String(peerId))?.name ?? null;
    return (response.items ?? []).map((msg) =>
      asMessageLink(msg, null, { senderName: nameOf(msg), chatName })
    );
  }
  return (
    (response.items ?? [])
      // A conversation names its last message; a bare message is itself one.
      .map((item) => ({
        item,
        msg: item.last_message ?? item.message ?? (item.peer_id ? item : null),
      }))
      .filter(({ msg }) => msg)
      .map(({ item, msg }) =>
        asMessageLink(msg, item, {
          senderName: nameOf(msg),
          chatName: vkChatNameOf(item, profiles),
          peerProfile: profiles.get(String(conversationPeer(item))) ?? null,
        })
      )
  );
};

/** One VK message object as a link, with the sender's name when known. */
export const vkMessageLink = (msg, senderName = null) =>
  asMessageLink(msg, null, { senderName });

// Reading messages: the conversations, one chat's history, paged (R-Z8).
const vkLivePulls = (call) => {
  const pullMessages = async (options = {}) => {
    const count = options.limit ?? options.count ?? 20;
    const response = options.peerId
      ? await call(
          'messages.getHistory',
          {
            peer_id: options.peerId,
            count,
            offset: options.offset,
            start_message_id: options.startMessageId,
            extended: 1,
          },
          options.token
        )
      : await call(
          'messages.getConversations',
          {
            count,
            offset: options.offset,
            filter: options.filter ?? 'all',
            // Names of the people and communities (R-Z8).
            extended: 1,
            fields: PEOPLE_FIELDS,
          },
          options.token
        );
    const links = vkLinksOf(response, options.peerId);
    return {
      links,
      rawCount: response.items?.length ?? 0,
      nextOffset: response.items?.length
        ? Number(options.offset ?? 0) + response.items.length
        : null,
      raw: response,
    };
  };
  /**
   * Page through one chat with `messages.getHistory` offsets (VK serves at
   * most 200 a page), newest first. Stops at the end or at `maxPages`;
   * `nextOffset` is where to go on, null at the end (R-Z8).
   */
  const pullHistory = async ({
    peerId,
    offset = 0,
    maxPages = 5,
    ...rest
  } = {}) => {
    if (!peerId) {
      throw new Error('vk pullHistory peer_id is required');
    }
    const links = [];
    let next = Number(offset);
    for (let page = 0; page < maxPages; page += 1) {
      const got = await pullMessages({
        ...rest,
        peerId,
        offset: next,
        count: 200,
      });
      links.push(...got.links);
      next += got.rawCount;
      const total = Number(got.raw?.count ?? 0);
      if (got.rawCount === 0 || (total && next >= total)) {
        return { links, rawCount: links.length, nextOffset: null };
      }
    }
    return { links, rawCount: links.length, nextOffset: next };
  };
  return { pullMessages, pullHistory };
};

export const VK_API_BASE = 'https://api.vk.ru';
export const VK_API_VERSION = '5.199';

export const createVkLive = ({
  token = null,
  fetchImpl = globalThis.fetch,
  baseUrl = VK_API_BASE,
  apiVersion = VK_API_VERSION,
  // 3 requests a second for a user token, 20 for a community token (R-Z8).
  requestsPerSecond = VK_USER_RPS,
  limiter = createRateLimiter({ perSecond: requestsPerSecond }),
  sleep,
} = {}) => {
  const once = async (method, params, accessToken) => {
    await limiter.wait();
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
  const call = async (method, params = {}, overrideToken = null) => {
    const accessToken = resolveOption(
      overrideToken ?? token,
      'VK_ACCESS_TOKEN',
      'VK access token'
    );
    // Error 6: wait and repeat; error 14 (captcha) is thrown as it is.
    return withTooManyBackoff(() => once(method, params, accessToken), {
      sleep,
    });
  };

  return {
    call,
    ...vkLiveAudience(call),
    ...vkLiveActions(call),
    async listChats(options = {}) {
      return call(
        'messages.getConversations',
        { count: options.limit ?? options.count ?? 20, offset: options.offset },
        options.token
      );
    },
    ...vkLivePulls(call),
    async post(content, options = {}) {
      const peerId =
        options.peerId ?? contentTarget(content) ?? options.to ?? options.chat;
      const message = contentText(content);
      const sticker = contentSticker(content);
      if (!peerId) {
        throw new Error('vk post peer_id is required');
      }
      if (!message && !sticker) {
        throw new Error('vk post message text or sticker is required');
      }
      return call(
        'messages.send',
        {
          peer_id: peerId,
          message: message || undefined,
          sticker_id: sticker?.id,
          random_id:
            options.randomId ??
            (typeof content === 'object' ? content.randomId : undefined) ??
            vkRandomId(
              options.clientId ??
                (typeof content === 'object' ? content.clientId : undefined)
            ),
        },
        options.token
      );
    },
    /**
     * Stickers whose VK keywords are greetings ("привет", "hi", 👋…).
     * `owned` is VK's `is_allowed`: only owned stickers can be sent.
     */
    async listGreetingStickers(options = {}) {
      const response = await call(
        'store.getStickersKeywords',
        { all_products: 1, need_stickers: 1 },
        options.token
      );
      return {
        stickers: vkKeywordStickers(response, options.match ?? isGreetingText),
        failures: [],
      };
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

// A JSON export, or a page of VK's own HTML archive (R-Z8).
const vkArchiveObject = (archive) => {
  if (looksLikeVkHtml(archive)) {
    return parseVkHtmlPage(decodeVkHtml(archive));
  }
  return typeof archive === 'string' ? JSON.parse(archive) : archive;
};

export const vkSource = {
  name: SOURCE,
  async parseArchive(archive) {
    const obj = vkArchiveObject(archive);
    const out = [];
    for (const conv of obj.conversations ?? []) {
      const convPeerId = conv.peer?.id ?? conv.id;
      const chatName = conv.chat_settings?.title ?? null;
      const fakeConv = { peer: { id: convPeerId } };
      for (const msg of conv.messages ?? []) {
        out.push(
          asMessageLink(msg, fakeConv, {
            chatName,
            senderName: msg.from_name ?? null,
          })
        );
      }
    }
    return out;
  },
  live: createVkLive(),
};
