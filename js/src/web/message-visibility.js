// Resolve authors from the adapter's address, never from the display name,
// a forward, or a channel's signature. WhatsApp text exports only name
// participants, so require the Cloud API sender when matching that source.
const numeric = /^[1-9]\d{0,19}$/;
const authorFormats = {
  telegram: numeric,
  vk: numeric,
  facebook: numeric,
  x: numeric,
  whatsapp: numeric,
  linkedin:
    /^(?:https:\/\/(?:[\w-]+\.)?linkedin\.com\/in\/[\w%-]+\/?|urn:li:person:[\w-]+)$/i,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};

const validAddress = (source, id) =>
  typeof id === 'string' &&
  id.length <= 320 &&
  Object.hasOwn(authorFormats, source) &&
  authorFormats[source].test(id);

const isIncomingMessage = (message) =>
  message &&
  !message.outgoing &&
  !message.raw?.out &&
  !message.raw?.is_echo &&
  !message.pending &&
  !message.service;

const isTelegramChatSender = (raw) =>
  Boolean(raw?.sender_chat || raw?.fromId?.channelId || raw?.fromId?.chatId);

const authorAddress = (message) => {
  const { source, raw } = message;
  const sender = String(message.sender ?? '');
  // Telegram Desktop's JSON archive prefixes user identifiers with "user".
  const id =
    source === 'telegram' ? sender.replace(/^user(?=\d+$)/, '') : sender;
  if (source === 'telegram' && isTelegramChatSender(raw)) {
    return null;
  }
  if (source === 'whatsapp' && String(raw?.from ?? '') !== id) {
    return null;
  }
  return validAddress(source, id) ? id : null;
};

export const messageAuthor = (message) => {
  const id = isIncomingMessage(message) ? authorAddress(message) : null;
  return id
    ? { source: message.source, id, name: message.senderName || id }
    : null;
};

export const telegramAuthor = (chat) => {
  const id = String(chat?.chat ?? '');
  return chat?.source === 'telegram' && numeric.test(id)
    ? { source: 'telegram', id, name: chat.name || id }
    : null;
};

export const authorKey = ({ source, id }) => JSON.stringify([source, id]);

export const storedAuthor = (record) =>
  validAddress(record?.source, record?.id) &&
  typeof record.name === 'string' &&
  Number.isInteger(record.slot) &&
  record.slot >= 1 &&
  record.slot <= 5;

export const authorSlot = (source, slot) => (source === 'telegram' ? slot : 1);

export const messageVisibility = (records, slot) => {
  const authors = new Set();
  const sources = new Set();
  for (const record of records) {
    if (record.slot === authorSlot(record.source, slot)) {
      authors.add(authorKey(record));
      sources.add(record.source);
    }
  }
  const hidesAuthor = (author) =>
    Boolean(author && authors.has(authorKey(author)));
  const hides = (message) => {
    if (!sources.has(message?.source)) {
      return false;
    }
    return hidesAuthor(messageAuthor(message));
  };
  return {
    has: (source) => sources.has(source),
    hides,
    hidesAuthor,
    show: (messages) =>
      authors.size ? messages.filter((message) => !hides(message)) : messages,
    lookup: (known) =>
      authors.size
        ? {
            get(id) {
              const message = known.get(id);
              return hides(message) ? { hidden: true } : message;
            },
            hideUnresolved: (source) => sources.has(source),
          }
        : known,
  };
};
