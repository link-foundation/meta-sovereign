/**
 * Node local-server transport for raw mail protocols.
 *
 * Browser code must not import this module. It exists for the local
 * server and CLI fallback path where TCP/TLS sockets are available.
 */

import { Buffer } from 'node:buffer';
import net from 'node:net';
import tls from 'node:tls';

import { buildRfc822, parseAddressList, parseRfc822Message } from './email.js';

const DEFAULT_PORTS = {
  imap: 993,
  pop3: 995,
  smtp: 465,
};

const env = (name) => globalThis.process?.env?.[name] ?? null;

const pick = (options, config, key, envName = null) =>
  options[key] ?? config[key] ?? (envName ? env(envName) : null);

const boolOption = (value, fallback = true) => {
  if (value === undefined || value === null) {
    return fallback;
  }
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
};

const asPort = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const connectSocket = ({ host, port, secure = true, timeout = 30000 }) =>
  new Promise((resolve, reject) => {
    if (!host) {
      reject(new Error('email host is required for raw mail transport'));
      return;
    }
    const socket = secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    const timer = globalThis.setTimeout(() => {
      socket.destroy(new Error('email socket connection timed out'));
    }, timeout);
    const cleanup = () => {
      globalThis.clearTimeout(timer);
      socket.off('error', onError);
      socket.off('connect', onConnect);
      socket.off('secureConnect', onConnect);
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onConnect = () => {
      cleanup();
      socket.setNoDelay(true);
      resolve(socket);
    };
    socket.once('error', onError);
    socket.once(secure ? 'secureConnect' : 'connect', onConnect);
  });

class MailSocket {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
    this.ended = false;
    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
      this.drain();
    });
    socket.on('error', (err) => this.fail(err));
    socket.on('end', () => {
      this.ended = true;
      this.drain();
    });
  }

  fail(err) {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) {
      waiter.reject(err);
    }
  }

  drain() {
    for (const waiter of [...this.waiters]) {
      if (waiter.kind === 'line') {
        const idx = this.buffer.indexOf(10);
        if (idx < 0) {
          continue;
        }
        const raw = this.buffer.subarray(0, idx + 1);
        this.buffer = this.buffer.subarray(idx + 1);
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(raw.toString('utf8').replace(/\r?\n$/, ''));
        continue;
      }
      if (this.buffer.length >= waiter.length) {
        const raw = this.buffer.subarray(0, waiter.length);
        this.buffer = this.buffer.subarray(waiter.length);
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(raw.toString('utf8'));
      }
    }
    if (this.ended && this.waiters.length > 0) {
      this.fail(new Error('email socket closed before response completed'));
    }
  }

  readLine() {
    return new Promise((resolve, reject) => {
      this.waiters.push({ kind: 'line', resolve, reject });
      this.drain();
    });
  }

  readBytes(length) {
    return new Promise((resolve, reject) => {
      this.waiters.push({ kind: 'bytes', length, resolve, reject });
      this.drain();
    });
  }

  writeLine(line = '') {
    this.socket.write(`${line}\r\n`);
  }

  writeRaw(text) {
    this.socket.write(text);
  }

  close() {
    this.socket.end();
  }
}

const openClient = async (config, options, protocol) => {
  const host = pick(options, config, 'host', 'EMAIL_HOST');
  const secure = boolOption(
    pick(options, config, 'secure', `${protocol.toUpperCase()}_SECURE`),
    true
  );
  const port = asPort(
    pick(options, config, 'port', `${protocol.toUpperCase()}_PORT`),
    DEFAULT_PORTS[protocol]
  );
  const timeout = asPort(pick(options, config, 'timeout'), 30000);
  return new MailSocket(await connectSocket({ host, port, secure, timeout }));
};

const credentials = (config, options) => ({
  username:
    pick(options, config, 'username', 'EMAIL_USERNAME') ??
    pick(options, config, 'user', 'EMAIL_USER'),
  password:
    pick(options, config, 'password', 'EMAIL_PASSWORD') ??
    options.token ??
    config.token,
});

const expectPrefix = async (client, prefix, context) => {
  const line = await client.readLine();
  if (!line.startsWith(prefix)) {
    throw new Error(`${context} failed: ${line}`);
  }
  return line;
};

const readDotBlock = async (client) => {
  const lines = [];
  for (;;) {
    const line = await client.readLine();
    if (line === '.') {
      return lines.join('\r\n');
    }
    lines.push(line.startsWith('..') ? line.slice(1) : line);
  }
};

const sendPop = async (client, command) => {
  client.writeLine(command);
  return expectPrefix(client, '+OK', command.split(' ')[0]);
};

const pullPop3 = async (config, options) => {
  const client = await openClient(config, options, 'pop3');
  try {
    await expectPrefix(client, '+OK', 'POP3 greeting');
    const { username, password } = credentials(config, options);
    if (username) {
      await sendPop(client, `USER ${username}`);
    }
    if (password) {
      await sendPop(client, `PASS ${password}`);
    }
    const stat = await sendPop(client, 'STAT');
    const count = Number(stat.split(/\s+/)[1] ?? 0);
    const limit = asPort(options.limit ?? config.limit, 20);
    const start = Math.max(1, count - limit + 1);
    const links = [];
    for (let id = start; id <= count; id += 1) {
      await sendPop(client, `RETR ${id}`);
      links.push(parseRfc822Message(await readDotBlock(client), `pop3-${id}`));
    }
    await sendPop(client, 'QUIT').catch(() => null);
    return { links, rawCount: count, nextOffset: null };
  } finally {
    client.close();
  }
};

const quoteImap = (value) =>
  `"${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')}"`;

const readImapTagged = async (client, tag) => {
  const lines = [];
  const literals = [];
  for (;;) {
    const line = await client.readLine();
    lines.push(line);
    const literal = line.match(/\{(\d+)\}$/);
    if (literal) {
      literals.push(await client.readBytes(Number(literal[1])));
    }
    if (line.startsWith(`${tag} `)) {
      if (!line.includes(' OK')) {
        throw new Error(`IMAP command failed: ${line}`);
      }
      return { lines, literals };
    }
  }
};

const imapCommand = async (client, state, command) => {
  state.count += 1;
  const tag = `A${String(state.count).padStart(3, '0')}`;
  client.writeLine(`${tag} ${command}`);
  return readImapTagged(client, tag);
};

const pullImap = async (config, options) => {
  const client = await openClient(config, options, 'imap');
  try {
    await expectPrefix(client, '* OK', 'IMAP greeting');
    const state = { count: 0 };
    const { username, password } = credentials(config, options);
    if (username && password) {
      await imapCommand(
        client,
        state,
        `LOGIN ${quoteImap(username)} ${quoteImap(password)}`
      );
    }
    await imapCommand(
      client,
      state,
      `SELECT ${quoteImap(options.mailbox ?? config.mailbox ?? 'INBOX')}`
    );
    const searched = await imapCommand(client, state, 'UID SEARCH ALL');
    const ids =
      searched.lines
        .find((line) => line.startsWith('* SEARCH'))
        ?.split(/\s+/)
        .slice(2)
        .filter(Boolean) ?? [];
    const limit = asPort(options.limit ?? config.limit, 20);
    const selected = ids.slice(-limit);
    if (selected.length === 0) {
      return { links: [], rawCount: 0, nextOffset: null };
    }
    const fetched = await imapCommand(
      client,
      state,
      `UID FETCH ${selected.join(',')} (BODY.PEEK[])`
    );
    await imapCommand(client, state, 'LOGOUT').catch(() => null);
    return {
      links: fetched.literals.map((raw, index) =>
        parseRfc822Message(raw, `imap-${selected[index] ?? index}`)
      ),
      rawCount: ids.length,
      nextOffset: null,
    };
  } finally {
    client.close();
  }
};

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
    throw new Error(`${context} failed: ${lines.join(' | ')}`);
  }
  return lines;
};

const sendSmtp = async (client, command, expected, context = command) => {
  client.writeLine(command);
  return readSmtp(client, expected, context);
};

const base64 = (value) =>
  Buffer.from(String(value ?? ''), 'utf8').toString('base64');

const recipientEmails = (...values) =>
  values
    .flatMap((value) =>
      Array.isArray(value)
        ? value.flatMap((entry) => recipientEmails(entry))
        : [value]
    )
    .filter(Boolean)
    .flatMap((value) =>
      typeof value === 'string'
        ? parseAddressList(value).map((entry) => entry.address)
        : [value.address ?? value.email ?? value.emailAddress?.address]
    )
    .filter(Boolean);

const dotStuff = (text) =>
  String(text ?? '')
    .replace(/\r?\n/g, '\r\n')
    .replace(/^\./gm, '..');

const postSmtp = async (config, content, options) => {
  const client = await openClient(config, options, 'smtp');
  try {
    await readSmtp(client, [220], 'SMTP greeting');
    await sendSmtp(
      client,
      `EHLO ${options.hello ?? config.hello ?? 'localhost'}`,
      [250]
    );
    const { username, password } = credentials(config, options);
    if (username && password) {
      await sendSmtp(client, 'AUTH LOGIN', [334]);
      await sendSmtp(client, base64(username), [334], 'SMTP username');
      await sendSmtp(client, base64(password), [235], 'SMTP password');
    }
    const from = content.from ?? username;
    const recipients = recipientEmails(content.to, content.cc, content.bcc);
    await sendSmtp(client, `MAIL FROM:<${from}>`, [250]);
    for (const to of recipients) {
      await sendSmtp(client, `RCPT TO:<${to}>`, [250, 251]);
    }
    await sendSmtp(client, 'DATA', [354]);
    client.writeRaw(`${dotStuff(buildRfc822({ ...content, from }))}\r\n.\r\n`);
    const response = await readSmtp(client, [250], 'SMTP DATA');
    await sendSmtp(client, 'QUIT', [221]).catch(() => null);
    return { accepted: recipients, response };
  } finally {
    client.close();
  }
};

export const createNodeEmailTransport = (config = {}) => ({
  async pullMessages(options = {}) {
    const protocol = String(
      options.protocol ?? config.protocol ?? 'imap'
    ).toLowerCase();
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
    const protocol = String(
      options.protocol ?? config.protocol ?? 'smtp'
    ).toLowerCase();
    if (protocol === 'smtp') {
      return postSmtp(config, content, options);
    }
    throw new Error(
      `${protocol} does not support sending through raw mail transport`
    );
  },
});
