// Original provenance model learned from Telegram source behavior. PeerUser
// references are identities; chat/channel IDs and display-name strings are not.
const FLAGS = [
  'self',
  'bot',
  'deleted',
  'fake',
  'scam',
  'support',
  'contact',
  'verified',
  'business',
];
export const userKey = (value) => {
  const raw = value?.userId ?? value?.id ?? value;
  const text = String(raw?.value ?? raw ?? '');
  return /^[1-9]\d{0,19}$/.test(text) ? text : null;
};
const peerUser = (peer) =>
  peer?.className === 'PeerUser' ? userKey(peer.userId) : null;
const actionUsers = (action) => {
  if (
    ['MessageActionChatAddUser', 'MessageActionChatCreate'].includes(
      action?.className
    )
  ) {
    return (action.users ?? []).map((id) => [id, 'service:members']);
  }
  return action?.className === 'MessageActionChatDeleteUser'
    ? [[action.userId, 'service:removed']]
    : [];
};
const mentionReferences = (message) => {
  const mentions = [];
  for (const entity of message.entities ?? []) {
    if (
      ['MessageEntityMentionName', 'InputMessageEntityMentionName'].includes(
        entity.className
      )
    ) {
      mentions.push([entity.userId, 'mention']);
    } else if (entity.className === 'MessageEntityMention') {
      const name = String(message.message ?? message.text ?? '').slice(
        entity.offset,
        entity.offset + entity.length
      );
      if (/^@[A-Za-z][\w]{3,31}$/.test(name)) {
        mentions.push([name, 'mention:username']);
      }
    }
  }
  return mentions;
};
export const messageUserReferences = (message) => {
  const refs = [];
  const author = message.fromId
    ? peerUser(message.fromId)
    : userKey(message.senderId);
  if (author) {
    refs.push([author, 'author']);
  }
  refs.push(...actionUsers(message.action));
  if (
    [
      'MessageActionChatJoinedByLink',
      'MessageActionChatJoinedByRequest',
    ].includes(message.action?.className) &&
    author
  ) {
    refs.push([author, 'service:joined']);
  }
  const forward = peerUser(message.fwdFrom?.fromId);
  if (forward) {
    refs.push([forward, 'forward']);
  }
  refs.push(...mentionReferences(message));
  if (message.media?.className === 'MessageMediaContact') {
    refs.push([message.media.userId, 'shared-contact']);
  }
  return refs.filter(
    ([id]) => userKey(id) || /^@[A-Za-z][\w]{3,31}$/.test(String(id))
  );
};

export const userProfile = (user) => {
  const id = userKey(user);
  if (!id || user?.className !== 'User') {
    return null;
  }
  return {
    id,
    resolved: true,
    firstName: String(user.firstName ?? '').slice(0, 64),
    lastName: String(user.lastName ?? '').slice(0, 64),
    username: String(user.username ?? '').slice(0, 32),
    phone: String(user.phone ?? '').slice(0, 32),
    ...Object.fromEntries(
      FLAGS.filter((key) => user[key] !== undefined).map((key) => [
        key,
        user[key] === true,
      ])
    ),
  };
};

export const createUserCollection = ({ maxUsers = 100_000 } = {}) => {
  const users = new Map();
  const mentions = new Map();
  const add = (value, source, messageId = null) => {
    if (
      [
        'Channel',
        'ChannelForbidden',
        'Chat',
        'ChatForbidden',
        'PeerChannel',
        'PeerChat',
      ].includes(value?.className)
    ) {
      return null;
    }
    const id = userKey(value);
    if (!id) {
      return null;
    }
    const old = users.get(id);
    if (!old && users.size >= maxUsers) {
      throw Object.assign(new Error('user-capacity'), {
        code: 'user-capacity',
      });
    }
    const profile = userProfile(value);
    const entry = old ?? { id, resolved: false, sources: [], evidence: [] };
    Object.assign(entry, profile ?? {});
    if (!entry.sources.includes(source)) {
      entry.sources.push(source);
    }
    if (
      messageId &&
      entry.evidence.length < 8 &&
      !entry.evidence.includes(messageId)
    ) {
      entry.evidence.push(messageId);
    }
    users.set(id, entry);
    return entry;
  };
  return {
    users,
    mentions,
    add,
    message(message) {
      for (const [value, source] of messageUserReferences(message)) {
        if (String(value).startsWith('@')) {
          if (!mentions.has(value)) {
            if (mentions.size >= maxUsers) {
              throw Object.assign(new Error('user-capacity'), {
                code: 'user-capacity',
              });
            }
            mentions.set(value, new Set());
          }
          mentions.get(value).add(source);
        } else {
          add(value, source, Number(message.id) || null);
        }
      }
      const sender = message.sender ?? message._sender;
      if (userProfile(sender)) {
        add(sender, 'author', Number(message.id) || null);
      }
    },
  };
};

export const contactExclusion = (
  user,
  { meId, includeExisting = false } = {}
) => {
  if (!user?.resolved) {
    return 'unresolved';
  }
  if (user.id === meId || user.self) {
    return 'self';
  }
  const flag = ['bot', 'deleted', 'fake', 'scam', 'support'].find(
    (key) => user[key]
  );
  return flag ?? (user.contact && !includeExisting ? 'already-contact' : null);
};

const integer = (value, min, max) =>
  Number.isInteger(value) && value >= min && value <= max;
export const scanOptions = (body = {}) => {
  const participantsLimit = body.participantsLimit ?? 10_000;
  const messagesLimit = body.messagesLimit ?? 100_000;
  const debug = body.debug ?? false;
  return integer(participantsLimit, 0, 1_000_000) &&
    integer(messagesLimit, 0, 10_000_000) &&
    typeof debug === 'boolean'
    ? { participantsLimit, messagesLimit, debug }
    : null;
};
export const contactOptions = (body = {}) => {
  const options = {
    limit: body.limit ?? 0,
    delayMs: body.delayMs ?? 10_000,
    sharePhone: body.sharePhone ?? false,
    includeExisting: body.includeExisting ?? false,
  };
  return integer(options.limit, 0, 100_000) &&
    integer(options.delayMs, 0, 3_600_000) &&
    ['sharePhone', 'includeExisting'].every(
      (key) => typeof options[key] === 'boolean'
    )
    ? options
    : null;
};
