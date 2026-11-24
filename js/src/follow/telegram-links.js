// Recognition only. A candidate still needs provider resolution before joining.
const HOSTS = new Set(['t.me', 'telegram.me', 'telegram.dog']);
const RESERVED = new Set(
  'addemoji addlist addstickers addtheme bg boost c confirmphone contact giftcode invoice iv joinchat login m nft passport premium_offer proxy setlanguage share socks s'.split(
    ' '
  )
);
const USERNAME = /^[a-z][a-z\d_]{3,31}$/iu;
const INVITE = /^[a-z\d_-]{8,64}$/iu;
const NUMBER = /^[1-9]\d{0,15}$/u;
const CANDIDATE =
  /(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\/[^\s<>"'`),;]+|tg:\/\/(?:join|resolve)\?[^\s<>"'`),;]+|@[a-z][a-z\d_]{3,31}/giu;

const publicTarget = (username) => {
  const name = username.toLowerCase();
  return USERNAME.test(name) && !RESERVED.has(name)
    ? { kind: 'public', username: name, url: `https://t.me/${name}` }
    : null;
};
const inviteTarget = (hash) =>
  INVITE.test(hash) && !/^\d+$/u.test(hash)
    ? { kind: 'invite', invite: hash, url: `https://t.me/+${hash}` }
    : null;

const messageTarget = (parts) => {
  if (
    parts[0] === 'c' &&
    parts.length === 3 &&
    parts.slice(1).every((v) => NUMBER.test(v))
  ) {
    return {
      kind: 'private-message',
      channel: parts[1],
      message: parts[2],
      url: `https://t.me/c/${parts[1]}/${parts[2]}`,
    };
  }
  const target = publicTarget(parts[0]);
  if (target && parts.length === 2 && NUMBER.test(parts[1])) {
    return {
      ...target,
      kind: 'message',
      message: parts[1],
      url: `${target.url}/${parts[1]}`,
    };
  }
  return null;
};

const nativeTarget = (url) => {
  if (url.pathname && url.pathname !== '/') {
    return null;
  }
  return url.hostname === 'join'
    ? inviteTarget(url.searchParams.get('invite') ?? '')
    : url.hostname === 'resolve'
      ? publicTarget(url.searchParams.get('domain') ?? '')
      : null;
};

const webTarget = (url) => {
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    !HOSTS.has(url.hostname.replace(/^www\./u, ''))
  ) {
    return null;
  }
  const parts = url.pathname.replace(/\/$/u, '').slice(1).split('/');
  if (parts.length === 1) {
    return parts[0].startsWith('+')
      ? inviteTarget(parts[0].slice(1))
      : publicTarget(parts[0]);
  }
  if (parts[0] === 'joinchat' && parts.length === 2) {
    return inviteTarget(parts[1]);
  }
  return messageTarget(parts[0] === 's' ? parts.slice(1) : parts);
};

export const parseTelegramLink = (value) => {
  if (typeof value !== 'string' || value.length > 2048) {
    return null;
  }
  const text = value.trim().replace(/[.,;!?)\]}]+$/u, '');
  if (text.startsWith('@')) {
    return publicTarget(text.slice(1));
  }
  let url;
  try {
    url = new URL(/^(?:https?:|tg:)/iu.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.username || url.password || url.port) {
    return null;
  }
  return url.protocol === 'tg:' ? nativeTarget(url) : webTarget(url);
};

// Keep archive scans bounded even when an imported record has enormous fields.
export const extractTelegramLinks = (fields) => {
  const found = new Map();
  let limited = false;
  let count = 0;
  for (const value of fields) {
    if (++count > 128) {
      limited = true;
      break;
    }
    if (typeof value !== 'string') {
      continue;
    }
    const text = value.slice(0, 65536);
    limited ||= text.length !== value.length;
    let candidates = 0;
    for (const match of text.matchAll(CANDIDATE)) {
      if (++candidates > 256 || found.size >= 128) {
        limited = true;
        break;
      }
      const before = text[match.index - 1] ?? '';
      const after = text[match.index + match[0].length] ?? '';
      if (
        /[\p{L}\p{N}_@./-]/u.test(before) ||
        (match[0][0] === '@' && /[\p{L}\p{N}_]/u.test(after))
      ) {
        continue;
      }
      const target = parseTelegramLink(match[0]);
      if (target) {
        found.set(target.url, target);
      }
    }
  }
  return { links: [...found.values()], limited };
};

export function* messageLinkFields(message) {
  yield message.body;
  yield message.raw?.text;
  yield message.raw?.message;
  for (const attachment of Array.isArray(message.attachments)
    ? message.attachments
    : []) {
    yield attachment?.url;
  }
  for (const attachment of Array.isArray(message.raw?.attachments)
    ? message.raw.attachments
    : []) {
    yield attachment?.link?.url;
  }
  for (const entity of Array.isArray(message.raw?.entities)
    ? message.raw.entities
    : []) {
    yield entity?.url;
  }
}
