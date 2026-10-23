/**
 * What the email adapter needs from the store (R-Z5): the connection the
 * user saved on the Connections screen, what was already pulled, and the
 * thread a Chat message answers.
 *
 * The Connections screen saves `secret:email:<name>` links (token, host,
 * username, password…). `emailOptionsFrom` turns them into the `live`
 * options of ./email-live.js, with three helpers the adapter calls:
 *
 *   sync.get / sync.set   what a pull remembers (IMAP's UIDVALIDITY and
 *                         last UID, Graph's newest time), in `sync:email:*`
 *                         links, written after the mail is stored;
 *   sync.has(id)          whether a mail is stored (it is not fetched again);
 *   lookup.thread(chat)   who to answer, the ids and subject, from the
 *                         newest incoming mail of the chat;
 *   lookup.messages(chat) the chat's mails (to mark them read).
 *
 * Values never leave the server and nothing here logs them.
 */

import { parseAddressList } from './email-mime.js';

/** The saved value of a `secret:*` link. */
export const secretValue = (link) =>
  link?.token ?? link?.value ?? link?.body ?? link?.text ?? null;

// `secret:email:<key>` -> the live option it sets.
export const EMAIL_SETTINGS = {
  host: 'host',
  port: 'port',
  username: 'username',
  password: 'password',
  protocol: 'protocol',
  security: 'security',
  mailbox: 'mailbox',
  ca: 'ca',
  'smtp-host': 'smtpHost',
  'smtp-port': 'smtpPort',
  'smtp-security': 'smtpSecurity',
  'base-url': 'baseUrl',
  'account-id': 'accountId',
  'identity-id': 'identityId',
};

const lower = (value) => String(value ?? '').toLowerCase();
const tailOf = (link) => String(link.id).split(':').pop();
const byTime = (a, b) => String(a.timestamp).localeCompare(String(b.timestamp));

const chatMessages = async (store, chat) =>
  (
    await store.query(
      (l) =>
        l?.source === 'email' &&
        String(l.id).startsWith('msg:') &&
        String(l.chat) === String(chat) &&
        !l.deleted
    )
  ).sort(byTime);

// Who an answer goes to: the Reply-To, else the sender.
const answerTo = (last) => {
  const replyTo = parseAddressList(last.rawHeaders?.['reply-to']?.[0] ?? '');
  if (replyTo.length > 0) {
    return replyTo;
  }
  return last.from?.length ? last.from : [{ address: last.sender }];
};

// A mail the user wrote (their own address, or marked outgoing).
const isOwn = (link, options) =>
  Boolean(link.outgoing) ||
  [options?.username, options?.from]
    .filter(Boolean)
    .map(lower)
    .includes(lower(link.sender));

const threadOf = async (store, chat, options) => {
  const links = await chatMessages(store, chat);
  if (links.length === 0) {
    return null;
  }
  const incoming = links.filter((l) => !isOwn(l, options));
  const last = incoming.at(-1) ?? links.at(-1);
  return {
    to: incoming.length > 0 ? answerTo(last) : (last.to ?? []),
    subject: last.subject ?? '',
    messageId: last.messageId ?? last.raw?.messageId ?? null,
    references: last.references ?? [],
    providerId: last.raw?.id ?? tailOf(last),
    threadId: last.raw?.threadId ?? null,
  };
};

export const emailOptionsFrom = async (store) => {
  const options = {};
  for (const [key, name] of Object.entries(EMAIL_SETTINGS)) {
    const value = secretValue(await store.get(`secret:email:${key}`));
    if (value) {
      options[name] = value;
    }
  }
  options.sync = {
    get: async (key) => (await store.get(`sync:email:${key}`))?.state ?? null,
    set: (key, state) =>
      store.put({
        id: `sync:email:${key}`,
        source: 'email',
        kind: 'sync',
        state,
        at: Date.now(),
      }),
    has: async (id) => Boolean(await store.get(id)),
  };
  options.lookup = {
    thread: (chat, live) => threadOf(store, chat, live),
    messages: (chat) => chatMessages(store, chat),
  };
  return options;
};

/** Whether the saved connection has enough to pull or send. */
export const emailConfigured = (options) =>
  Boolean(
    options.token ||
    options.baseUrl ||
    (options.host && options.username && options.password)
  );
