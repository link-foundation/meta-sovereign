// HH's current common-chat API. A fetch owns a finite read budget; its cursor
// is committed only after the caller has stored every returned message.
import { buildMessageLink } from './link.js';
import { loadPullState, savePullState } from './pull-runner.js';

const stableId = (value) =>
  typeof value === 'string' && value.trim() && value.length <= 300
    ? value
    : null;
const invalid = (detail) => {
  const error = new Error(`HH chat history: ${detail}`);
  error.code = 'invalid-history';
  error.fallback = false;
  return error;
};
const inRange = (value, min, max) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
const integer = (value, fallback, min, max) => {
  const number = value ?? fallback;
  if (!inRange(number, min, max)) {
    throw invalid(`read limit must be an integer from ${min} to ${max}`);
  }
  return number;
};
const idList = (values, max) =>
  Array.isArray(values) && values.length <= max && values.every(stableId);
const attachmentsOf = (payload) =>
  Array.isArray(payload?.attachments)
    ? payload.attachments.map((file) => ({
        kind: 'file',
        name: file.title,
        url: file.url,
        mimeType: file.content_type,
      }))
    : [];
const senderFields = (message) => {
  const display = message.sender_display_info;
  return {
    sender: stableId(message.sender_participant_id) ?? 'unknown',
    senderName: display?.name,
    ...(typeof display?.is_current_participant === 'boolean'
      ? { outgoing: display.is_current_participant }
      : {}),
    // Membership/bot/unknown types interrupt question/answer turns.
    service: message.type !== 'SIMPLE' || display?.role === 'BOT',
  };
};
const chatMetadata = (chat) => ({
  id: chat.id,
  vacancyId: chat.vacancy_id ?? null,
  unreadCount: chat.unread_message_count ?? null,
  writeAllowed: chat.chat_states?.write_message_state?.allowed ?? null,
  writeReason: chat.chat_states?.write_message_state?.reason ?? null,
});

const chatBlocked = (chat) =>
  Boolean(chat.block_reason) ||
  chat.chat_states?.write_message_state?.allowed === false;

export const hhChatMessageLink = (message, chat) => {
  const id = stableId(message?.id);
  const chatId = stableId(chat?.id);
  if (!id || !chatId) {
    throw invalid('message or chat has no stable ID');
  }
  return {
    ...buildMessageLink({
      source: 'hh',
      externalId: `chat:${chatId}:${id}`,
      chat: `chat:${chatId}`,
      chatName: chat.display?.title,
      ...senderFields(message),
      body:
        typeof message.payload?.text === 'string' ? message.payload.text : '',
      timestamp: message.creation_time ?? null,
      edited: message.last_change_time,
      bot: chat.type === 'BOT',
      blocked: chatBlocked(chat),
      attachments: attachmentsOf(message.payload),
      raw: message,
    }),
    hhChat: chatMetadata(chat),
  };
};

const freshCursor = () => ({
  page: 0,
  pending: [],
  nextPage: null,
  active: null,
  seen: [],
  messages: 0,
  chats: 0,
  limited: false,
  listChanged: false,
  expectedFound: null,
});
const validActive = (active) =>
  active === null ||
  (stableId(active?.id) &&
    (active.start === null || stableId(active.start)) &&
    idList(active.recent, 50));
const validCursor = (cursor) =>
  cursor &&
  inRange(cursor.page, 0, 50) &&
  idList(cursor.pending, 20) &&
  idList(cursor.seen, 1020) &&
  (cursor.nextPage === null || inRange(cursor.nextPage, 0, 50)) &&
  inRange(cursor.messages, 0, Number.MAX_SAFE_INTEGER) &&
  inRange(cursor.chats, 0, 1020) &&
  typeof cursor.limited === 'boolean' &&
  typeof cursor.listChanged === 'boolean' &&
  (cursor.expectedFound === null ||
    inRange(cursor.expectedFound, 0, Number.MAX_SAFE_INTEGER)) &&
  validActive(cursor.active);

const resumeCursor = async (options, accountId, origin) => {
  const stored = options.store
    ? (await loadPullState(options.store, 'hh')).hhHistory
    : null;
  const previous = options.cursor ?? stored;
  const sameAccount =
    previous?.accountId === accountId && previous.origin === origin;
  if (options.cursor && !sameAccount) {
    throw invalid('cursor belongs to another account or API host');
  }
  const resume = !options.restartHistory && sameAccount && previous.cursor;
  if (resume && !validCursor(resume)) {
    throw invalid('saved cursor is invalid; restart the history read');
  }
  return resume ? globalThis.structuredClone(resume) : freshCursor();
};

const validList = (list, page) =>
  Array.isArray(list?.items) &&
  list.page === page &&
  inRange(list.pages, 0, Number.MAX_SAFE_INTEGER) &&
  inRange(list.found, 0, Number.MAX_SAFE_INTEGER) &&
  list.items.length <= 20;
const readList = async (read, cursor) => {
  const list = await read('/common/chats', {
    page: cursor.page,
    per_page: 20,
    vacancy_status: 'all',
  });
  if (!validList(list, cursor.page)) {
    throw invalid('invalid chat-list page');
  }
  const ids = list.items.map((chat) => stableId(chat?.id));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw invalid('chat-list identities are missing or repeated');
  }
  cursor.pending = ids.filter((id) => !cursor.seen.includes(id));
  cursor.listChanged ||=
    cursor.pending.length !== ids.length ||
    (cursor.expectedFound !== null && cursor.expectedFound !== list.found);
  cursor.expectedFound ??= list.found;
  cursor.nextPage =
    cursor.page + 1 < list.pages && cursor.page < 50 ? cursor.page + 1 : null;
  cursor.limited ||= list.pages > 51 || list.found > 1020;
  if (!ids.length && cursor.nextPage !== null) {
    throw invalid('empty chat page before the end of history');
  }
};

const activateNext = (cursor) => {
  if (cursor.active) {
    return false;
  }
  if (cursor.pending.length) {
    cursor.active = { id: cursor.pending.shift(), start: null, recent: [] };
    return false;
  }
  if (cursor.nextPage === null) {
    return true;
  }
  cursor.page = cursor.nextPage;
  return false;
};
const validMessagePage = (chat, active, limit) =>
  chat?.id === active.id &&
  Array.isArray(chat.messages) &&
  chat.messages.length <= limit &&
  typeof chat.has_more === 'boolean';
const advanceMessages = (cursor, chat) => {
  const active = cursor.active;
  const last = chat.messages.at(-1)?.id;
  if (
    chat.has_more &&
    (!last || last === active.start || active.recent.includes(last))
  ) {
    throw invalid('message cursor made no progress');
  }
  // The inclusive boundary is reread to retain edits, counted only once.
  const boundary =
    active.start && chat.messages.some((message) => message.id === active.start)
      ? 1
      : 0;
  cursor.messages += chat.messages.length - boundary;
  if (chat.has_more) {
    active.start = last;
    active.recent = [...active.recent, last].slice(-50);
    return false;
  }
  cursor.seen.push(active.id);
  cursor.chats++;
  cursor.active = null;
  if (cursor.pending.length) {
    return false;
  }
  if (cursor.nextPage === null) {
    return true;
  }
  cursor.page = cursor.nextPage;
  return false;
};
const readMessages = async (read, cursor, limit, links) => {
  const active = cursor.active;
  const chat = await read(
    `/common/chats/${encodeURIComponent(active.id)}/messages`,
    {
      order: 'next',
      limit,
      start_message_id: active.start,
    }
  );
  if (!validMessagePage(chat, active, limit)) {
    throw invalid('message page does not match the requested chat');
  }
  const records = chat.messages.map((message) =>
    hhChatMessageLink(message, chat)
  );
  if (new Set(records.map((link) => link.id)).size !== records.length) {
    throw invalid('message page contains duplicate IDs');
  }
  const finished = advanceMessages(cursor, chat);
  for (const record of records) {
    links.set(record.id, record);
  }
  return finished;
};
const historyReason = (cursor, finished) => {
  if (!finished) {
    return 'budget';
  }
  if (cursor.limited) {
    return 'provider-window';
  }
  return cursor.listChanged ? 'changed-list' : null;
};
const historyOf = (cursor, finished, requests) => ({
  scope: 'available-api-history',
  status: finished
    ? cursor.limited || cursor.listChanged
      ? 'limited'
      : 'complete'
    : 'partial',
  reason: historyReason(cursor, finished),
  messagesRead: cursor.messages,
  chatsRead: cursor.chats,
  requests,
});

/** `read(path, search)` is authenticated by the adapter; no credentials in state. */
export const pullHhChats = async ({ read, options, origin }) => {
  const budget = integer(options.maxRequests, 10, 1, 50);
  const limit = integer(options.limit, 50, 2, 50);
  const me = await read('/me');
  const accountId = stableId(me?.id);
  if (!accountId) {
    throw invalid('account identity is missing');
  }
  const cursor = await resumeCursor(options, accountId, origin);
  const links = new Map();
  let requests = 0;
  let finished = false;
  while (requests < budget) {
    if (!cursor.active && !cursor.pending.length) {
      await readList(read, cursor);
      requests++;
    }
    finished = activateNext(cursor);
    if (finished) {
      break;
    }
    if (!cursor.active) {
      continue;
    }
    if (requests >= budget) {
      break;
    }
    finished = await readMessages(read, cursor, limit, links);
    requests++;
    if (finished) {
      break;
    }
  }
  if (finished && cursor.chats !== cursor.expectedFound) {
    cursor.listChanged = true;
  }
  const history = historyOf(cursor, finished, requests);
  const nextCursor = { accountId, origin, cursor: finished ? null : cursor };
  return {
    links: [...links.values()],
    rawCount: links.size,
    nextOffset: null,
    nextCursor: finished ? null : nextCursor,
    history,
    afterStore: options.store
      ? () =>
          savePullState(options.store, 'hh', { hhHistory: nextCursor, history })
      : undefined,
  };
};
