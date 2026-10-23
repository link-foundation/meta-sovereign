// Links to Telegram messages, opened inside the app (R-Y154; learned,
// never copied): t.me/username/123, t.me/username/10/123 (a message of
// topic 10), t.me/c/123/456, t.me/c/123/10/456 and `?thread=10`, and the
// tg:// forms of them. `parseMessageLink` is pure; a click on such a link
// in a message asks the chat screen (`openMessageLink`) to open it.

const HOSTS = /^(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)$/i;
const NAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const NUMBER = /^[1-9]\d{0,14}$/;
const MAX_ID = 2_147_483_647;
// Paths of t.me that are not a chat's username.
const RESERVED = new Set([
  'c',
  's',
  'joinchat',
  'addstickers',
  'addemoji',
  'addtheme',
  'addlist',
  'share',
  'proxy',
  'socks',
  'login',
  'boost',
  'giftcode',
  'invoice',
  'setlanguage',
  'confirmphone',
  'contact',
  'iv',
  'bg',
  'm',
]);

const messageId = (value) => {
  const text = String(value ?? '');
  const id = NUMBER.test(text) ? Number(text) : 0;
  return id > 0 && id <= MAX_ID ? id : null;
};

const link = (where, id, thread) =>
  id ? { ...where, id, thread: thread ?? null } : null;

// A path after the chat: `123` or `10/123` (the topic, then the message).
const afterChat = (rest, query) => {
  const [first, second, ...more] = rest;
  if (more.length > 0 || first === undefined) {
    return null;
  }
  if (second === undefined) {
    return { id: messageId(first), thread: messageId(query.get('thread')) };
  }
  const thread = messageId(first);
  return thread ? { id: messageId(second), thread } : null;
};

const fromPath = (segments, query) => {
  const [head, ...rest] = segments;
  if (head === 'c') {
    const [channel, ...tail] = rest;
    const parsed = NUMBER.test(channel ?? '') ? afterChat(tail, query) : null;
    return (
      parsed && link({ channel, username: null }, parsed.id, parsed.thread)
    );
  }
  if (!NAME.test(head ?? '') || RESERVED.has(head.toLowerCase())) {
    return null;
  }
  const parsed = afterChat(rest, query);
  return (
    parsed && link({ channel: null, username: head }, parsed.id, parsed.thread)
  );
};

// tg://resolve?domain=x&post=1 and tg://privatepost?channel=1&post=2.
const fromScheme = (url) => {
  const query = url.searchParams;
  const thread = messageId(query.get('thread'));
  if (url.hostname === 'resolve' && NAME.test(query.get('domain') ?? '')) {
    return link(
      { channel: null, username: query.get('domain') },
      messageId(query.get('post')),
      thread
    );
  }
  if (
    url.hostname === 'privatepost' &&
    NUMBER.test(query.get('channel') ?? '')
  ) {
    return link(
      { channel: query.get('channel'), username: null },
      messageId(query.get('post')),
      thread
    );
  }
  return null;
};

/**
 * What a link to a message names: `{ username, channel, id, thread }`
 * (`username` of a public chat, else `channel` the digits of a private
 * one's id; `thread` the topic or null), or null for anything else.
 */
export const parseMessageLink = (href) => {
  let url;
  try {
    url = new URL(String(href ?? '').trim());
  } catch {
    return null;
  }
  if (url.protocol === 'tg:') {
    return fromScheme(url);
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !HOSTS.test(url.hostname)
  ) {
    return null;
  }
  if (url.username || url.password) {
    return null;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  return fromPath(segments, url.searchParams);
};

/** The marked chat id of a private link's channel (-100…). */
export const channelChat = (channel) => `-100${channel}`;

const EVENT = 'ms-message-link';

/**
 * Asks the chat screen to open the message `href` names; true when a
 * screen took it (the click's default is then prevented by the caller),
 * false when the browser should follow the link.
 */
export const openMessageLink = (href) => {
  const parsed = parseMessageLink(href);
  if (!parsed || !globalThis.dispatchEvent) {
    return false;
  }
  const detail = { href, link: parsed, handled: false };
  globalThis.dispatchEvent(new CustomEvent(EVENT, { detail }));
  return detail.handled;
};

/** Listens for `openMessageLink`; `on(detail)` is called for each. */
export const onMessageLink = (on) => {
  const handler = (event) => {
    event.detail.handled = true;
    on(event.detail);
  };
  globalThis.addEventListener?.(EVENT, handler);
  return () => globalThis.removeEventListener?.(EVENT, handler);
};
