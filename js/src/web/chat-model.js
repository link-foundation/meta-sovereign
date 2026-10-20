// What the chat screen shows, computed from links (issue #31 / PR #34):
// the conversation list with names, previews and t3-style date sections,
// one chat's messages, who is typing, and which automations the chat
// menu offers. Pure, so it is tested without React or a browser.

import { isPersonalChatType } from '../crm/reengage.js';

const DAY_MS = 86_400_000;

export const chatKey = (source, chat) => `${source}:${chat}`;

const fold = (text) => String(text ?? '').toLocaleLowerCase();

// The network's own message number (`msg:telegram:<chat>:<id>`), when
// there is one: it orders messages sent in the same second, and it is
// what "read up to" receipts count in.
export const networkMessageId = (message) => {
  const tail = String(message?.id ?? '')
    .split(':')
    .pop();
  return /^\d+$/.test(tail) ? Number(tail) : null;
};

/** Oldest first: by time, then by the network's number. */
export const byTime = (a, b) =>
  String(a.timestamp ?? '').localeCompare(String(b.timestamp ?? '')) ||
  (networkMessageId(a) ?? 0) - (networkMessageId(b) ?? 0);

// A message link the chat shows (a deleted one stays stored, unshown).
const isShownMessage = (link) =>
  Boolean(link?.id?.startsWith('msg:')) &&
  link.chat !== undefined &&
  !link.deleted;

const isMine = (message, self) => self.includes(String(message.sender));

const chatTitle = (messages, self) => {
  const named = messages.find((m) => m.chatName)?.chatName;
  if (named) {
    return named;
  }
  const other = messages.find((m) => !isMine(m, self));
  return other?.senderName ?? other?.sender ?? null;
};

/** A chat's read link (`read:<source>:<chat>`), or null. */
const readLinkOf = (links, key) =>
  links.find(
    (l) => l?.id?.startsWith('read:') && chatKey(l.source, l.chat) === key
  ) ?? null;

/**
 * How many messages the user has not read in a chat, as Telegram counts
 * them: the count the network gave with the chat list, plus incoming
 * messages that arrived after it. Reading the chat (here or on another
 * device) moves `inboxMaxId` on and resets the count. 0 without a read
 * link (networks that do not say).
 */
export const unreadCount = (messages, read, self = ['me']) => {
  if (!read) {
    return 0;
  }
  const after = Math.max(
    Number(read.unreadTopId ?? 0),
    Number(read.inboxMaxId ?? 0)
  );
  const newer = messages.filter(
    (m) => !isMine(m, self) && (networkMessageId(m) ?? 0) > after
  ).length;
  return Number(read.unreadCount ?? 0) + newer;
};

const PRIVATE_TYPES = new Set(['bot_chat', 'saved_messages']);

/**
 * Which tab a chat is under: `private` (one other person, a bot, saved
 * messages), `group` or `channel` (a broadcast one), from the adapter's
 * `chatType` — or, without one, from how many people wrote in it.
 */
export const chatKind = (chatType, people = 1) => {
  if (!chatType) {
    return people <= 1 ? 'private' : 'group';
  }
  if (isPersonalChatType(chatType) || PRIVATE_TYPES.has(chatType)) {
    return 'private';
  }
  return chatType === 'channel' || chatType.endsWith('_channel')
    ? 'channel'
    : 'group';
};

export const CHAT_FILTERS = Object.freeze([
  'all',
  'private',
  'group',
  'channel',
]);

/** The chats under one tab (`all`: every chat), newest first as given. */
export const filterChats = (chats = [], filter = 'all') =>
  filter === 'all' || !CHAT_FILTERS.includes(filter)
    ? chats
    : chats.filter((c) => (c.kind ?? 'private') === filter);

const summarize = (key, messages, self, read = null) => {
  const sorted = [...messages].sort(byTime);
  const last = sorted.at(-1);
  const people = new Set(
    sorted.filter((m) => !isMine(m, self)).map((m) => String(m.sender))
  );
  const title = chatTitle(sorted, self);
  return {
    key,
    source: last.source,
    chat: String(last.chat),
    name: title ?? String(last.chat),
    // A chat type from the adapter wins (the same rule as the CRM's);
    // otherwise one other person.
    personal: last.chatType
      ? isPersonalChatType(last.chatType)
      : people.size <= 1,
    kind: chatKind(last.chatType, people.size),
    people: [...people],
    count: sorted.length,
    unread: unreadCount(sorted, read, self),
    last: {
      body: String(last.body ?? ''),
      mine: isMine(last, self),
      at: last.timestamp ?? null,
    },
    search: fold(
      [title, last.chat, last.source, ...sorted.map((m) => m.body)].join('\n')
    ),
  };
};

// A one-to-one chat with only our own messages (written from Contacts)
// takes the person's name from their `person:` link.
const named = (chat, links) => {
  if (!chat.personal || chat.name !== chat.chat) {
    return chat;
  }
  const id = `person:${chat.source}:${chat.chat}`;
  const person = links.find((l) => l?.id === id);
  const name = person?.name ?? person?.handle;
  return name
    ? { ...chat, name, search: `${fold(name)}\n${chat.search}` }
    : chat;
};

/**
 * One row per conversation, newest first. `query` matches the name, the
 * chat id, the network and any message in it.
 */
export const summarizeChats = (
  links = [],
  { query = '', self = ['me'] } = {}
) => {
  const groups = new Map();
  const reads = new Map();
  for (const link of links) {
    if (link?.id?.startsWith('read:')) {
      reads.set(chatKey(link.source, link.chat), link);
    }
    if (!isShownMessage(link)) {
      continue;
    }
    const key = chatKey(link.source, link.chat);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(link);
  }
  const words = fold(query).split(/\s+/).filter(Boolean);
  return [...groups.entries()]
    .map(([key, messages]) =>
      named(summarize(key, messages, self, reads.get(key)), links)
    )
    .filter((c) => words.every((w) => c.search.includes(w)))
    .sort((a, b) => String(b.last.at).localeCompare(String(a.last.at)));
};

/** How far the other side has read our messages in a chat (0: unknown). */
export const readUpTo = (links = [], key) =>
  readLinkOf(links, key)?.outboxMaxId ?? 0;

/** How far the user has read a chat (0: unknown). */
export const readInboxUpTo = (links = [], key) =>
  Number(readLinkOf(links, key)?.inboxMaxId ?? 0);

/** A chat's draft saved on the network (Telegram), or undefined. */
export const cloudDraft = (links = [], key) => {
  const draft = readLinkOf(links, key)?.draft;
  return typeof draft === 'string' ? draft : undefined;
};

// The composer's states that still show a clock (queued behind another
// message, or waiting to be tried again) and the ones shown as they are.
const ON_THE_WAY = new Set(['queued', 'sending', 'waiting']);
const AS_IS = new Set(['failed', 'stored']);
const NETWORK_DELIVERY = new Set(['sent', 'delivered', 'read', 'failed']);

/**
 * Where one of our messages is, as Telegram shows it:
 *   sending (clock) → sent (✓) → read (✓✓); waiting (clock, tried again
 * by itself), failed (!) and stored (kept here while offline, not sent
 * yet). Others' messages have none.
 */
export const deliveryStatus = (message, readMax = 0) => {
  if (message?.sender !== 'me' && message?.outgoing !== true) {
    return null;
  }
  // A network that reports it (WhatsApp, Messenger) says it outright.
  if (NETWORK_DELIVERY.has(message.delivery) && !message.status) {
    return message.delivery === 'delivered' ? 'sent' : message.delivery;
  }
  if (message.status === 'waiting') {
    return 'waiting';
  }
  if (ON_THE_WAY.has(message.status)) {
    return 'sending';
  }
  if (AS_IS.has(message.status)) {
    return message.status;
  }
  const id = networkMessageId(message);
  return id !== null && readMax >= id ? 'read' : 'sent';
};

// A message still on its way (the composer's queue), shaped like a link.
const pendingMessage = (item) => ({
  id: `pending:${item.clientId}`,
  clientId: item.clientId,
  source: item.source,
  chat: item.chat,
  sender: 'me',
  body: item.text,
  timestamp: item.at,
  status: item.status,
  error: item.error ?? null,
  code: item.code ?? null,
  retryAfter: item.retryAfter ?? null,
  retryAt: item.retryAt ?? null,
  pending: true,
});

/**
 * A chat's messages, oldest first, each of ours with its `delivery`
 * status. `pending` (the composer's queue) follows, in the order sent,
 * until the network's own link for it arrives.
 */
export const chatMessages = (links = [], key, { pending = [] } = {}) => {
  const readMax = readUpTo(links, key);
  const shown = links
    .filter((l) => isShownMessage(l) && chatKey(l.source, l.chat) === key)
    .sort(byTime);
  const arrived = new Set(shown.map((m) => m.clientId).filter(Boolean));
  const queued = pending
    .filter((p) => p.key === key && !arrived.has(p.clientId))
    .map(pendingMessage);
  return [...shown, ...queued].map((m) => {
    const delivery = deliveryStatus(m, readMax);
    return delivery ? { ...m, delivery } : m;
  });
};

/** t3-style sidebar sections: today, yesterday, this week, older. */
export const dayGroup = (iso, now = Date.now()) => {
  const ms = Date.parse(String(iso ?? ''));
  if (Number.isNaN(ms)) {
    return 'older';
  }
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  if (ms >= today) {
    return 'today';
  }
  if (ms >= today - DAY_MS) {
    return 'yesterday';
  }
  return ms >= today - 6 * DAY_MS ? 'week' : 'older';
};

export const DAY_GROUPS = Object.freeze([
  'today',
  'yesterday',
  'week',
  'older',
]);

/** Chats split into the non-empty date sections, in order. */
export const groupChats = (chats, now = Date.now()) =>
  DAY_GROUPS.map((group) => ({
    group,
    chats: chats.filter((c) => dayGroup(c.last.at, now) === group),
  })).filter((g) => g.chats.length > 0);

/**
 * Who is typing: other people by name, and an automation typing on the
 * user's behalf (its typing link names it). The user's own composer is
 * not news to them, so a plain "me" link is left out.
 */
export const typingStatus = (typing = [], { names = {} } = {}) => {
  const people = typing
    .filter((t) => t.user !== 'me')
    .map((t) => names[t.user] ?? t.name ?? t.user);
  const automation =
    typing.find((t) => t.user === 'me' && t.automation)?.automationName ?? null;
  return { people, automation };
};

/** Sender id → display name from the chat's own messages. */
export const senderNames = (messages = []) =>
  Object.fromEntries(
    messages
      .filter((m) => m.senderName)
      .map((m) => [String(m.sender), m.senderName])
  );

/** Automations offered in a chat's menu. */
export const chatMenuAutomations = (automations = []) =>
  automations.filter(
    (a) => !a.invalid && (a.triggers ?? []).some((t) => t.kind === 'chat-menu')
  );

/** Initials and a stable hue for an avatar. */
export const avatarFor = (name) => {
  const text = String(name ?? '?').trim() || '?';
  const initials = text
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0].toLocaleUpperCase())
    .join('');
  let hash = 0;
  for (const ch of text) {
    hash = (hash * 31 + ch.codePointAt(0)) % 360;
  }
  return { initials: initials || '?', hue: hash };
};

/**
 * Where the "Unread messages" line goes: before the first incoming
 * message newer than `after` (how far the chat was read when it was
 * opened), or null when there is none.
 */
export const firstUnreadId = (messages = [], after = 0) =>
  after > 0
    ? (messages.find(
        (m) =>
          m.sender !== 'me' && !m.pending && (networkMessageId(m) ?? 0) > after
      )?.id ?? null)
    : null;
