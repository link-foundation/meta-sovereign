/**
 * Node local-server transport for raw mail protocols (R-Z5).
 *
 * Browser code must not import this module. It exists for the local
 * server and CLI path where TCP/TLS sockets are available:
 *
 * - IMAP and POP3 read mail, SMTP sends it. Implicit TLS, STARTTLS and
 *   (named, loopback only) plain are in ./email-node-socket.js; the
 *   certificate is always checked.
 * - A password logs in with LOGIN / AUTH PLAIN / AUTH LOGIN; an OAuth
 *   token (no password) with XOAUTH2.
 * - A pull is incremental: IMAP remembers UIDVALIDITY and the last UID,
 *   POP3 the UIDLs it has seen (`options.since` in, `state` out); a
 *   message above the size cap is skipped, not loaded into memory.
 * - IMAP can mark mail read and move it to the Trash folder.
 * - A send never writes the Bcc into the message (it is a RCPT only),
 *   and a failure after the message left is `send-unknown`, never retried.
 */

import { Buffer } from 'node:buffer';

import { composeMessage, checkedAddress } from './email-compose.js';
import { setEmailTransportFactory } from './email-live.js';
import { parseAddressList } from './email-mime.js';
import { parseRfc822Message } from './email-records.js';
import {
  MailSocket,
  connectSocket,
  guardCleartext,
  securityOf,
  tlsOptionsOf,
} from './email-node-socket.js';

const DEFAULT_PORTS = { imap: 993, pop3: 995, smtp: 465 };
const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;
const FETCH_CHUNK = 10;
const INCREMENTAL_CAP = 200;
const POP_SEEN_CAP = 5000;

const env = (name) => globalThis.process?.env?.[name] ?? null;

const coded = (message, code, extra = {}) =>
  Object.assign(new Error(message), { code, ...extra });

const pick = (options, config, key, envName = null) =>
  options[key] ?? config[key] ?? (envName ? env(envName) : null);

const asNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const credentials = (config, options) => ({
  username:
    pick(options, config, 'username', 'EMAIL_USERNAME') ??
    pick(options, config, 'user', 'EMAIL_USER'),
  password: pick(options, config, 'password', 'EMAIL_PASSWORD'),
  // A token with no password is an OAuth access token (XOAUTH2).
  token: options.token ?? config.token ?? null,
});

const xoauth2 = ({ username, token }) =>
  Buffer.from(
    `user=${username}\u0001auth=Bearer ${token}\u0001\u0001`
  ).toString('base64');

const openClient = async (config, options, protocol) => {
  const host = pick(options, config, 'host', 'EMAIL_HOST');
  const prefix = protocol.toUpperCase();
  const port = asNumber(
    pick(options, config, 'port', `${prefix}_PORT`),
    DEFAULT_PORTS[protocol]
  );
  const mode = securityOf({
    security: pick(options, config, 'security', `${prefix}_SECURITY`),
    secure: pick(options, config, 'secure', `${prefix}_SECURE`),
    port: pick(options, config, 'port', `${prefix}_PORT`) ?? port,
  });
  const creds = credentials(config, options);
  guardCleartext({
    mode,
    host,
    hasCredentials: Boolean(creds.password || creds.token),
    allow: pick(options, config, 'allowInsecure'),
  });
  const tlsOptions = tlsOptionsOf({
    host,
    ca: pick(options, config, 'ca'),
    rejectUnauthorized: pick(options, config, 'rejectUnauthorized'),
  });
  const timeout = asNumber(pick(options, config, 'timeout'), 30000);
  const socket = await connectSocket({
    host,
    port,
    implicitTls: mode === 'tls',
    tlsOptions,
    timeout,
  });
  return {
    client: new MailSocket(socket),
    mode,
    host,
    creds,
    tlsOptions,
    timeout,
  };
};

const expectPrefix = async (client, prefix, context) => {
  const line = await client.readLine();
  if (!line.startsWith(prefix)) {
    throw new Error(`${context} failed: ${line}`);
  }
  return line;
};

// ---- POP3 -------------------------------------------------------------------

const readDotBlock = async (client) => {
  const lines = [];
  for (;;) {
    const line = await client.readLineBytes();
    if (line.length === 1 && line[0] === 46) {
      return Buffer.concat(lines.flatMap((l) => [l, Buffer.from('\r\n')]));
    }
    lines.push(line[0] === 46 && line[1] === 46 ? line.subarray(1) : line);
  }
};

const sendPop = async (client, command) => {
  client.writeLine(command);
  return expectPrefix(client, '+OK', command.split(' ')[0]);
};

const popLogin = async (session) => {
  const { client, creds } = session;
  if (session.mode === 'starttls') {
    await sendPop(client, 'STLS');
    await client.upgrade(session.tlsOptions, session.timeout);
  }
  if (creds.username && creds.password) {
    await sendPop(client, `USER ${creds.username}`);
    await sendPop(client, `PASS ${creds.password}`);
  } else if (creds.username && creds.token) {
    await sendPop(client, `AUTH XOAUTH2 ${xoauth2(creds)}`);
  } else if (creds.username) {
    await sendPop(client, `USER ${creds.username}`);
  }
};

// `n value` lines of UIDL or LIST, as a Map n -> value.
const popListing = async (client, command) => {
  try {
    await sendPop(client, command);
  } catch {
    return null;
  }
  const block = (await readDotBlock(client)).toString('latin1');
  return new Map(
    block
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .filter((p) => p.length >= 2)
      .map(([n, value]) => [Number(n), value])
  );
};

const pullPop3 = async (config, options) => {
  const session = await openClient(config, options, 'pop3');
  const { client } = session;
  try {
    await expectPrefix(client, '+OK', 'POP3 greeting');
    await popLogin(session);
    const stat = await sendPop(client, 'STAT');
    const count = Number(stat.split(/\s+/)[1] ?? 0);
    const limit = asNumber(options.limit ?? config.limit, 20);
    const uidl = await popListing(client, 'UIDL');
    const sizes = (await popListing(client, 'LIST')) ?? new Map();
    const seen = new Set(options.since?.seen ?? []);
    // Without UIDL the newest `limit` are read, as before.
    const wanted = uidl
      ? [...uidl.keys()].filter((n) => !seen.has(uidl.get(n)))
      : Array.from(
          { length: Math.min(limit, count) },
          (_, i) => count - i
        ).reverse();
    const take =
      options.since && uidl
        ? wanted.slice(0, INCREMENTAL_CAP)
        : wanted.slice(-limit);
    const links = [];
    for (const id of take) {
      if (Number(sizes.get(id)) > MAX_MESSAGE_BYTES) {
        continue;
      }
      await sendPop(client, `RETR ${id}`);
      links.push(parseRfc822Message(await readDotBlock(client), `pop3-${id}`));
    }
    await sendPop(client, 'QUIT').catch(() => null);
    return {
      links,
      rawCount: count,
      nextOffset: null,
      state: uidl
        ? { seen: [...uidl.values()].slice(-POP_SEEN_CAP) }
        : undefined,
    };
  } finally {
    client.close();
  }
};

// ---- IMAP -------------------------------------------------------------------

const quoteImap = (value) => {
  const text = String(value ?? '');
  if (/[\r\n]/.test(text)) {
    throw coded('a mail command cannot hold a line break', 'bad-command');
  }
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
};

const readImapTagged = async (client, tag) => {
  const lines = [];
  const entries = [];
  for (;;) {
    const line = await client.readLine();
    lines.push(line);
    if (line === '+' || line.startsWith('+ ')) {
      // A refused XOAUTH2 login asks for an empty line before it says why.
      client.writeLine('');
      continue;
    }
    const prior = entries.at(-1);
    if (prior && prior.tail === null) {
      prior.tail = line;
    }
    const literal = line.match(/\{(\d+)\}$/);
    if (literal) {
      entries.push({
        head: line,
        data: await client.readBytes(Number(literal[1])),
        tail: null,
      });
    }
    if (line.startsWith(`${tag} `)) {
      if (!/^\S+ OK/i.test(line)) {
        throw coded(`IMAP command failed: ${line}`, 'imap-failed');
      }
      return { lines, entries, literals: entries.map((e) => e.data) };
    }
  }
};

const imapCommand = async (session, command) => {
  session.count += 1;
  const tag = `A${String(session.count).padStart(3, '0')}`;
  session.client.writeLine(`${tag} ${command}`);
  return readImapTagged(session.client, tag);
};

const imapLogin = async (session) => {
  const { creds } = session;
  if (session.mode === 'starttls') {
    await imapCommand(session, 'STARTTLS');
    await session.client.upgrade(session.tlsOptions, session.timeout);
  }
  if (creds.username && creds.password) {
    await imapCommand(
      session,
      `LOGIN ${quoteImap(creds.username)} ${quoteImap(creds.password)}`
    );
  } else if (creds.username && creds.token) {
    await imapCommand(session, `AUTHENTICATE XOAUTH2 ${xoauth2(creds)}`);
  }
};

const imapSession = async (config, options, use) => {
  const session = await openClient(config, options, 'imap');
  session.count = 0;
  try {
    await expectPrefix(session.client, '* ', 'IMAP greeting');
    await imapLogin(session);
    const mailbox = options.mailbox ?? config.mailbox ?? 'INBOX';
    const selected = await imapCommand(session, `SELECT ${quoteImap(mailbox)}`);
    const text = selected.lines.join('\n');
    session.mailbox = mailbox;
    session.uidValidity =
      Number(text.match(/\[UIDVALIDITY (\d+)\]/i)?.[1]) || null;
    session.uidNext = Number(text.match(/\[UIDNEXT (\d+)\]/i)?.[1]) || null;
    const result = await use(session);
    await imapCommand(session, 'LOGOUT').catch(() => null);
    return result;
  } finally {
    session.client.close();
  }
};

const searchedUids = (response) =>
  (response.lines.find((line) => line.startsWith('* SEARCH')) ?? '')
    .split(/\s+/)
    .slice(2)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

// Which UIDs to read: all new ones after the last pull, else the newest.
// `last` is where the next pull starts after.
const uidsToRead = async (session, options, limit) => {
  const since = options.since;
  const same =
    since?.lastUid &&
    session.uidValidity &&
    since.uidValidity === session.uidValidity;
  const command = same
    ? `UID SEARCH UID ${since.lastUid + 1}:*`
    : 'UID SEARCH ALL';
  const found = searchedUids(await imapCommand(session, command));
  const fresh = (
    same ? found.filter((uid) => uid > since.lastUid) : found
  ).sort((a, b) => a - b);
  if (same) {
    const take = fresh.slice(0, INCREMENTAL_CAP);
    return { take, last: take.at(-1) ?? since.lastUid };
  }
  return {
    take: fresh.slice(-limit),
    last: fresh.at(-1) ?? Math.max((session.uidNext ?? 1) - 1, 0),
  };
};

// Sizes first, so a huge mail is skipped instead of held in memory.
const sizesOf = async (session, uids) => {
  const sizes = new Map();
  const response = await imapCommand(
    session,
    `UID FETCH ${uids.join(',')} (UID RFC822.SIZE)`
  );
  for (const line of response.lines) {
    const uid = line.match(/UID (\d+)/)?.[1];
    const size = line.match(/RFC822\.SIZE (\d+)/)?.[1];
    if (uid && size) {
      sizes.set(Number(uid), Number(size));
    }
  }
  return sizes;
};

const fetchOne = async (session, uids) => {
  const response = await imapCommand(
    session,
    `UID FETCH ${uids.join(',')} (UID BODY.PEEK[])`
  );
  return response.entries.map((entry, index) => {
    const uid =
      Number((entry.head + (entry.tail ?? '')).match(/UID (\d+)/)?.[1]) ||
      uids[index];
    const link = parseRfc822Message(entry.data, `imap-${uid}`);
    return {
      ...link,
      raw: {
        ...link.raw,
        uid,
        mailbox: session.mailbox,
        uidValidity: session.uidValidity,
      },
    };
  });
};

const pullImap = (config, options) =>
  imapSession(config, options, async (session) => {
    const limit = asNumber(options.limit ?? config.limit, 20);
    const { take, last } = await uidsToRead(session, options, limit);
    const state = session.uidValidity
      ? { uidValidity: session.uidValidity, lastUid: last }
      : undefined;
    if (take.length === 0) {
      return { links: [], rawCount: 0, nextOffset: null, state };
    }
    const sizes = await sizesOf(session, take);
    const readable = take.filter(
      (uid) => (sizes.get(uid) ?? 0) <= MAX_MESSAGE_BYTES
    );
    const links = [];
    for (let i = 0; i < readable.length; i += FETCH_CHUNK) {
      links.push(
        ...(await fetchOne(session, readable.slice(i, i + FETCH_CHUNK)))
      );
    }
    return {
      links,
      rawCount: take.length,
      skipped: take.length - readable.length,
      nextOffset: null,
      state,
    };
  });

// The UIDs of links that were read from this mailbox.
const uidsOfLinks = (params, session) => {
  const links = params.links ?? (params.link ? [params.link] : []);
  const uids = links.map((l) => l.raw?.uid);
  if (links.length === 0 || uids.some((uid) => !uid)) {
    throw coded('these mails have no IMAP UID to act on', 'no-uid');
  }
  const stale = links.find(
    (l) =>
      l.raw.uidValidity &&
      session.uidValidity &&
      l.raw.uidValidity !== session.uidValidity
  );
  if (stale) {
    throw coded(
      'the mailbox was renumbered; pull the mail again first',
      'uidvalidity-changed'
    );
  }
  return uids;
};

const markReadImap = (config, params, options) =>
  imapSession(
    {
      ...config,
      mailbox:
        (params.links ?? [params.link])[0]?.raw?.mailbox ?? config.mailbox,
    },
    options,
    async (session) => {
      const uids = uidsOfLinks(params, session);
      await imapCommand(
        session,
        `UID STORE ${uids.join(',')} +FLAGS.SILENT (\\Seen)`
      );
      return { ok: true, read: uids.length };
    }
  );

// The Trash folder: the one the server flags \Trash.
const trashFolderOf = async (session) => {
  const listed = await imapCommand(session, 'LIST "" "*"');
  for (const line of listed.lines) {
    const m = line.match(
      /^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (?:"((?:[^"\\]|\\.)*)"|(\S+))/i
    );
    if (m && /\\Trash/i.test(m[1])) {
      return (m[2] ?? m[3]).replace(/\\(.)/g, '$1');
    }
  }
  return null;
};

const deleteImap = (config, params, options) =>
  imapSession(
    {
      ...config,
      mailbox:
        (params.links ?? [params.link])[0]?.raw?.mailbox ?? config.mailbox,
    },
    options,
    async (session) => {
      const uids = uidsOfLinks(params, session);
      const trash = await trashFolderOf(session);
      if (!trash) {
        throw coded(
          'this mailbox has no Trash folder to move mail to',
          'no-trash-folder'
        );
      }
      const set = uids.join(',');
      const caps = (await imapCommand(session, 'CAPABILITY')).lines.join(' ');
      if (/\bMOVE\b/i.test(caps)) {
        await imapCommand(session, `UID MOVE ${set} ${quoteImap(trash)}`);
      } else {
        await imapCommand(session, `UID COPY ${set} ${quoteImap(trash)}`);
        await imapCommand(
          session,
          `UID STORE ${set} +FLAGS.SILENT (\\Deleted)`
        );
        if (/\bUIDPLUS\b/i.test(caps)) {
          await imapCommand(session, `UID EXPUNGE ${set}`);
        }
      }
      return { ok: true, deleted: uids.length };
    }
  );

// ---- SMTP -------------------------------------------------------------------

const readSmtp = async (client, expected, context) => {
  const lines = [];
  for (;;) {
    const line = await client.readLine();
    lines.push(line);
    if (!/^\d{3}-/.test(line)) {
      break;
    }
  }
  const code = Number(lines.at(-1)?.slice(0, 3));
  if (!expected.includes(code)) {
    throw coded(`${context} failed: ${lines.join(' | ')}`, 'smtp-refused', {
      smtpCode: code,
    });
  }
  return lines;
};

const sendSmtp = async (client, command, expected, context = command) => {
  client.writeLine(command);
  return readSmtp(client, expected, context);
};

const base64 = (value) =>
  Buffer.from(String(value ?? ''), 'utf8').toString('base64');

const dotStuff = (text) =>
  String(text ?? '')
    .replace(/\r?\n/g, '\r\n')
    .replace(/^\./gm, '..');

const smtpAuth = async (client, creds, ehlo) => {
  const advertised = ehlo.join(' ').toUpperCase();
  if (creds.username && creds.password) {
    if (
      /AUTH[^\n]*\bLOGIN\b/.test(advertised) ||
      !/AUTH[^\n]*\bPLAIN\b/.test(advertised)
    ) {
      await sendSmtp(client, 'AUTH LOGIN', [334]);
      await sendSmtp(client, base64(creds.username), [334], 'SMTP username');
      await sendSmtp(client, base64(creds.password), [235], 'SMTP password');
    } else {
      await sendSmtp(
        client,
        `AUTH PLAIN ${base64(`\u0000${creds.username}\u0000${creds.password}`)}`,
        [235],
        'SMTP password'
      );
    }
  } else if (creds.username && creds.token) {
    client.writeLine(`AUTH XOAUTH2 ${xoauth2(creds)}`);
    const lines = await readSmtp(client, [235, 334], 'SMTP XOAUTH2');
    if (lines.at(-1).startsWith('334')) {
      // The server explains the refusal after an empty line.
      await sendSmtp(client, '', [235], 'SMTP XOAUTH2');
    }
  }
};

const smtpGreet = async (session, hello) => {
  const { client } = session;
  await readSmtp(client, [220], 'SMTP greeting');
  let ehlo = await sendSmtp(client, `EHLO ${hello}`, [250]);
  if (session.mode === 'starttls') {
    if (!ehlo.some((l) => /STARTTLS/i.test(l))) {
      throw coded(
        'the SMTP server does not offer STARTTLS',
        'starttls-unsupported'
      );
    }
    await sendSmtp(client, 'STARTTLS', [220]);
    await client.upgrade(session.tlsOptions, session.timeout);
    ehlo = await sendSmtp(client, `EHLO ${hello}`, [250]);
  }
  await smtpAuth(client, session.creds, ehlo);
};

// The sender of the envelope: a bare, checked address.
const envelopeSender = (content, username) => {
  const given = parseAddressList(content.from ?? '')[0]?.address ?? username;
  return checkedAddress(given);
};

// After the message started to leave, a failure may still have delivered it.
const sendData = async (client, raw) => {
  await sendSmtp(client, 'DATA', [354]);
  try {
    client.writeRaw(`${dotStuff(raw)}\r\n.\r\n`);
    return await readSmtp(client, [250], 'SMTP DATA');
  } catch (error) {
    if (error.code === 'smtp-refused' && error.smtpCode >= 500) {
      throw error;
    }
    throw coded(
      `the mail may or may not have been sent (${error.message}); check the Sent folder before sending again`,
      'send-unknown',
      { fallback: false, cause: error }
    );
  }
};

const postSmtp = async (config, content, options) => {
  const session = await openClient(config, options, 'smtp');
  const { client } = session;
  try {
    await smtpGreet(session, options.hello ?? config.hello ?? 'localhost');
    const from = envelopeSender(content, session.creds.username);
    const message = composeMessage(
      { ...content, from: content.from ?? from },
      { now: options.now }
    );
    await sendSmtp(client, `MAIL FROM:<${from}>`, [250]);
    for (const to of message.recipients) {
      await sendSmtp(client, `RCPT TO:<${to}>`, [250, 251]);
    }
    const response = await sendData(client, message.raw);
    await sendSmtp(client, 'QUIT', [221]).catch(() => null);
    return {
      accepted: message.recipients,
      response,
      messageId: message.messageId,
    };
  } finally {
    client.close();
  }
};

// ---- The transport ----------------------------------------------------------

const protocolOf = (config, options, fallback) =>
  String(options.protocol ?? config.protocol ?? fallback).toLowerCase();

export const createNodeEmailTransport = (config = {}) => ({
  async pullMessages(options = {}) {
    const protocol = protocolOf(config, options, 'imap');
    if (protocol === 'pop3') {
      return pullPop3(config, options);
    }
    if (protocol === 'imap') {
      return pullImap(config, options);
    }
    throw new Error(
      `${protocol} does not support receiving through raw mail transport`
    );
  },
  async post(content, options = {}) {
    const protocol = protocolOf(config, options, 'smtp');
    if (protocol === 'smtp') {
      return postSmtp(config, content, options);
    }
    throw new Error(
      `${protocol} does not support sending through raw mail transport`
    );
  },
  async markRead(params = {}, options = {}) {
    if (protocolOf(config, options, 'imap') !== 'imap') {
      throw coded('only IMAP can mark mail read', 'unsupported-action');
    }
    return markReadImap(config, params, options);
  },
  async deleteMessages(params = {}, options = {}) {
    if (protocolOf(config, options, 'imap') !== 'imap') {
      throw coded('only IMAP can move mail to the Trash', 'unsupported-action');
    }
    return deleteImap(config, params, options);
  },
});

// The app's `emailSource.live` finds raw mail's transport through this.
setEmailTransportFactory((config) => createNodeEmailTransport(config));
