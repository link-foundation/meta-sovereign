// What the chat screen shows, computed from links (issue #31 / PR #34):
// the conversation list with names, previews and t3-style date sections,
// one chat's messages, who is typing, and which automations the chat
// menu offers. Pure, so it is tested without React or a browser.

import { isPersonalChatType } from '../crm/reengage.js';

const DAY_MS = 86_400_000;

export const chatKey = (source, chat) => `${source}:${chat}`;

const fold = (text) => String(text ?? '').toLocaleLowerCase();

const byTime = (a, b) =>
  String(a.timestamp ?? '').localeCompare(String(b.timestamp ?? ''));

const isMine = (message, self) => self.includes(String(message.sender));

const chatTitle = (messages, self) => {
  const named = messages.find((m) => m.chatName)?.chatName;
  if (named) {
    return named;
  }
  const other = messages.find((m) => !isMine(m, self));
  return other?.senderName ?? other?.sender ?? null;
};

const summarize = (key, messages, self) => {
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
    people: [...people],
    count: sorted.length,
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

/**
 * One row per conversation, newest first. `query` matches the name, the
 * chat id, the network and any message in it.
 */
export const summarizeChats = (
  links = [],
  { query = '', self = ['me'] } = {}
) => {
  const groups = new Map();
  for (const link of links) {
    if (!link?.id?.startsWith('msg:') || link.chat === undefined) {
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
    .map(([key, messages]) => summarize(key, messages, self))
    .filter((c) => words.every((w) => c.search.includes(w)))
    .sort((a, b) => String(b.last.at).localeCompare(String(a.last.at)));
};

/** A chat's messages, oldest first. */
export const chatMessages = (links = [], key) =>
  links
    .filter(
      (l) => l?.id?.startsWith('msg:') && chatKey(l.source, l.chat) === key
    )
    .sort(byTime);

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
    .map((t) => names[t.user] ?? t.user);
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
