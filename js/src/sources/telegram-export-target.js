// Exact usernames/links and signed peer IDs; free-text titles never pick a chat.
const ID = /^-?[1-9]\d{0,19}$/;
const USERNAME = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/;

export const exportTarget = (input) => {
  if (typeof input !== 'string' && typeof input !== 'number') {
    return null;
  }
  if (typeof input === 'number' && !Number.isSafeInteger(input)) {
    return null;
  }
  const text = String(input).trim();
  if (ID.test(text)) {
    return text;
  }
  const username = text.replace(/^@/, '');
  if (USERNAME.test(username)) {
    return `@${username}`;
  }
  const link =
    /^(?:https?:\/\/)?t\.me\/(?:c\/([1-9]\d{0,15})|([a-zA-Z][a-zA-Z0-9_]{3,31}))(?:\/[1-9]\d*)?\/?$/.exec(
      text
    );
  return link ? (link[1] ? `-100${link[1]}` : `@${link[2]}`) : null;
};

export const resolveExportTarget = async (client, value) => {
  if (!value.chat.startsWith('@')) {
    return value;
  }
  const entity = await client.getEntity(value.chat);
  const id = String(entity?.id?.value ?? entity?.id ?? '');
  const prefixes = { User: '', Chat: '-', Channel: '-100' };
  const prefix = Object.hasOwn(prefixes, entity?.className)
    ? prefixes[entity.className]
    : undefined;
  if (prefix === undefined || !/^[1-9]\d{0,15}$/.test(id)) {
    throw new Error('CHAT_ID_INVALID');
  }
  return {
    ...value,
    chat: `${prefix}${id}`,
    chatName: value.chatName || entity.title || entity.username || value.chat,
  };
};

export const exportWindowOptions = (body) => {
  const scope = body.scope ?? 'all';
  const gapHours = body.gapHours ?? 4;
  const maxLines = body.maxLines ?? 1500;
  const debug = body.debug ?? false;
  return ['all', 'active'].includes(scope) &&
    typeof debug === 'boolean' &&
    typeof gapHours === 'number' &&
    Number.isFinite(gapHours) &&
    gapHours >= 0.01 &&
    gapHours <= 168 &&
    Number.isInteger(maxLines) &&
    maxLines >= 32 &&
    maxLines <= 1500
    ? { scope, gapHours, maxLines, debug }
    : null;
};
