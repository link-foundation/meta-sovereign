/**
 * Email source adapter (issue #3).
 *
 * Browser-capable mail APIs (JMAP, Gmail, Microsoft Graph) are plain
 * HTTP fetches and can run directly in the SPA when CORS allows them.
 * Raw mail protocols (IMAP, POP3, SMTP) need a local server transport
 * because browsers cannot open arbitrary TCP/TLS sockets.
 */

import { buildMessageLink } from './link.js';
import { authHeaders, envValue, requestJson } from './http.js';

const SOURCE = 'email';

export const EMAIL_PROTOCOLS = [
  'jmap',
  'gmail',
  'microsoft-graph',
  'imap',
  'pop3',
  'smtp',
];

const stripHtml = (text) =>
  String(text ?? '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stableHash = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
};

const cleanMessageId = (value) =>
  String(value ?? '')
    .trim()
    .replace(/^<|>$/g, '');

const bytesToBase64 = (bytes) => {
  if (globalThis.Buffer) {
    return globalThis.Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary);
};

const base64ToBytes = (encoded) => {
  const padded = String(encoded ?? '').padEnd(
    Math.ceil(String(encoded ?? '').length / 4) * 4,
    '='
  );
  if (globalThis.Buffer) {
    return new Uint8Array(globalThis.Buffer.from(padded, 'base64'));
  }
  return Uint8Array.from(globalThis.atob(padded), (c) => c.charCodeAt(0));
};

const utf8Encoder = () => new globalThis.TextEncoder();
const utf8Decoder = (label = 'utf-8') => new globalThis.TextDecoder(label);

const utf8ToBase64Url = (text) =>
  bytesToBase64(utf8Encoder().encode(text))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const base64UrlToUtf8 = (encoded) => {
  const normalized = String(encoded ?? '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return utf8Decoder().decode(base64ToBytes(normalized));
};

const decodeQuotedPrintable = (text) => {
  const compact = String(text ?? '').replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < compact.length; i += 1) {
    if (
      compact[i] === '=' &&
      /^[0-9a-f]{2}$/i.test(compact.slice(i + 1, i + 3))
    ) {
      bytes.push(Number.parseInt(compact.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(compact.charCodeAt(i));
    }
  }
  return utf8Decoder().decode(new Uint8Array(bytes));
};

const decodeHeaderWord = (_match, charset, encoding, value) => {
  const enc = encoding.toLowerCase();
  const label = charset.toLowerCase();
  try {
    const bytes =
      enc === 'b'
        ? base64ToBytes(value)
        : new Uint8Array(
            decodeQuotedPrintable(value.replace(/_/g, ' '))
              .split('')
              .map((c) => c.charCodeAt(0))
          );
    return utf8Decoder(label).decode(bytes);
  } catch {
    return value;
  }
};

const decodeHeaderValue = (value) =>
  String(value ?? '').replace(
    /=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g,
    decodeHeaderWord
  );

const splitHeaderBody = (text) => {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  const idx = normalized.search(/\n\s*\n/);
  if (idx < 0) {
    return { headerBlock: normalized, body: '' };
  }
  return {
    headerBlock: normalized.slice(0, idx),
    body: normalized.slice(normalized.indexOf('\n', idx) + 1),
  };
};

const parseHeaders = (headerBlock) => {
  const lines = String(headerBlock ?? '').split('\n');
  const unfolded = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`;
    } else {
      unfolded.push(line);
    }
  }
  const headers = new Map();
  for (const line of unfolded) {
    const idx = line.indexOf(':');
    if (idx <= 0) {
      continue;
    }
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = decodeHeaderValue(line.slice(idx + 1).trim());
    headers.set(name, [...(headers.get(name) ?? []), value]);
  }
  return headers;
};

const firstHeader = (headers, name) => headers.get(name.toLowerCase())?.[0];

const headerObject = (headers) =>
  Object.fromEntries(
    [...headers.entries()].map(([key, values]) => [key, values])
  );

const splitAddresses = (value) => {
  const out = [];
  let current = '';
  let quoted = false;
  for (const char of String(value ?? '')) {
    if (char === '"') {
      quoted = !quoted;
    }
    if (char === ',' && !quoted) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    out.push(current);
  }
  return out;
};

export const parseAddressList = (value) =>
  splitAddresses(value)
    .map((part) => {
      const trimmed = decodeHeaderValue(part.trim());
      const match = trimmed.match(/<([^<>@\s]+@[^<>\s]+)>/);
      const loose = trimmed.match(/([^<>\s,]+@[^<>\s,]+)/);
      const address = match?.[1] ?? loose?.[1] ?? trimmed;
      const name = trimmed
        .replace(match?.[0] ?? loose?.[0] ?? address, '')
        .replace(/^"|"$/g, '')
        .trim();
      return { name: name || null, address: address.trim() };
    })
    .filter((entry) => entry.address);

const decodeBody = (body, encoding) => {
  const transfer = String(encoding ?? '').toLowerCase();
  if (transfer === 'base64') {
    return utf8Decoder().decode(
      base64ToBytes(String(body).replace(/\s+/g, ''))
    );
  }
  if (transfer === 'quoted-printable') {
    return decodeQuotedPrintable(body);
  }
  return String(body ?? '').trim();
};

const contentType = (headers) =>
  String(firstHeader(headers, 'content-type') ?? 'text/plain').toLowerCase();

const boundaryFrom = (type) =>
  type.match(/boundary="?([^";]+)"?/i)?.[1] ?? null;

const extractTextBody = (headers, body) => {
  const type = contentType(headers);
  const transfer = firstHeader(headers, 'content-transfer-encoding');
  if (type.startsWith('multipart/')) {
    const boundary = boundaryFrom(type);
    if (!boundary) {
      return decodeBody(body, transfer);
    }
    const parts = String(body).split(`--${boundary}`);
    const parsed = parts
      .filter((part) => part.trim() && !part.trim().startsWith('--'))
      .map((part) => parseRfc822Part(part));
    const text = parsed.find((part) =>
      contentType(part.headers).startsWith('text/plain')
    );
    const fallback = text ?? parsed.find((part) => part.body.trim());
    return fallback ? extractTextBody(fallback.headers, fallback.body) : '';
  }
  const decoded = decodeBody(body, transfer);
  return type.startsWith('text/html') ? stripHtml(decoded) : decoded;
};

const parseRfc822Part = (text) => {
  const { headerBlock, body } = splitHeaderBody(text);
  return { headers: parseHeaders(headerBlock), body };
};

export const parseRfc822Message = (text, fallbackId = null) => {
  const { headers, body: rawBody } = parseRfc822Part(text);
  const messageId =
    cleanMessageId(firstHeader(headers, 'message-id')) ||
    fallbackId ||
    `raw-${stableHash(text)}`;
  const from = parseAddressList(
    firstHeader(headers, 'from') ?? firstHeader(headers, 'sender') ?? 'unknown'
  );
  const to = parseAddressList(firstHeader(headers, 'to') ?? '');
  const cc = parseAddressList(firstHeader(headers, 'cc') ?? '');
  const subject = firstHeader(headers, 'subject') ?? '';
  const timestamp = firstHeader(headers, 'date') ?? null;
  return buildEmailMessageLink({
    externalId: messageId,
    sender: from[0]?.address ?? 'unknown',
    chat:
      cleanMessageId(firstHeader(headers, 'references')) ||
      cleanMessageId(firstHeader(headers, 'in-reply-to')) ||
      subject ||
      messageId,
    body: extractTextBody(headers, rawBody),
    timestamp,
    subject,
    from,
    to,
    cc,
    rawHeaders: headerObject(headers),
    protocol: 'rfc822',
    provider: 'archive',
  });
};

const splitMbox = (text) => {
  const lines = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const messages = [];
  let current = [];
  for (const line of lines) {
    if (/^From [^\s]+ .+/.test(line)) {
      if (current.length > 0) {
        messages.push(current.join('\n').trimEnd());
      }
      current = [];
      continue;
    }
    current.push(line.replace(/^>From /, 'From '));
  }
  if (current.length > 0) {
    messages.push(current.join('\n').trimEnd());
  }
  return messages.filter((message) => message.trim());
};

const normalizeAddress = (value) => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(normalizeAddress);
  }
  if (typeof value === 'string') {
    return parseAddressList(value);
  }
  const email =
    value.email ??
    value.address ??
    value.emailAddress?.address ??
    value.mail ??
    null;
  if (!email) {
    return [];
  }
  return [
    {
      name: value.name ?? value.emailAddress?.name ?? null,
      address: email,
    },
  ];
};

const headerArrayValue = (headers, name) =>
  headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;

const gmailHeaders = (message) => message.payload?.headers ?? [];

const gmailPartText = (part) => {
  if (!part) {
    return '';
  }
  const type = String(part.mimeType ?? '').toLowerCase();
  if (type.startsWith('text/plain') && part.body?.data) {
    return base64UrlToUtf8(part.body.data).trim();
  }
  for (const child of part.parts ?? []) {
    const text = gmailPartText(child);
    if (text) {
      return text;
    }
  }
  if (part.body?.data) {
    const decoded = base64UrlToUtf8(part.body.data);
    return type.startsWith('text/html') ? stripHtml(decoded) : decoded.trim();
  }
  return '';
};

const normalizeGmailMessage = (message) => {
  if (message.raw) {
    const parsed = parseRfc822Message(base64UrlToUtf8(message.raw), message.id);
    return {
      ...parsed,
      externalId: message.id,
      id: `msg:${SOURCE}:${message.id}`,
      provider: 'gmail',
      protocol: 'gmail',
      chat: message.threadId ?? parsed.chat,
    };
  }
  const headers = gmailHeaders(message);
  const from = normalizeAddress(headerArrayValue(headers, 'from'));
  const to = normalizeAddress(headerArrayValue(headers, 'to'));
  const cc = normalizeAddress(headerArrayValue(headers, 'cc'));
  const subject = headerArrayValue(headers, 'subject') ?? '';
  return buildEmailMessageLink({
    externalId: String(message.id),
    sender: from[0]?.address ?? 'unknown',
    chat: String(message.threadId ?? subject ?? message.id),
    body: gmailPartText(message.payload) || message.snippet || '',
    timestamp: message.internalDate
      ? new Date(Number(message.internalDate)).toISOString()
      : (headerArrayValue(headers, 'date') ?? null),
    subject,
    from,
    to,
    cc,
    rawHeaders: Object.fromEntries(
      headers.map((h) => [h.name?.toLowerCase(), [h.value]])
    ),
    provider: 'gmail',
    protocol: 'gmail',
  });
};

const graphExternalId = (message) =>
  String(
    message.id ||
      cleanMessageId(message.internetMessageId) ||
      recordFallbackId('graph', message)
  );

const graphSender = (message) =>
  normalizeAddress(message.sender ?? message.from)[0]?.address ?? 'unknown';

const graphBody = (message) => {
  const content = message.body?.content ?? message.bodyPreview ?? '';
  return message.body?.contentType?.toLowerCase() === 'html'
    ? stripHtml(content)
    : content;
};

const normalizeGraphMessage = (message) =>
  buildEmailMessageLink({
    externalId: graphExternalId(message),
    sender: graphSender(message),
    chat: String(message.conversationId ?? message.threadId ?? message.id),
    body: graphBody(message),
    timestamp: message.receivedDateTime ?? message.sentDateTime ?? null,
    subject: message.subject ?? '',
    from: normalizeAddress(message.from ?? message.sender),
    to: normalizeAddress(message.toRecipients),
    cc: normalizeAddress(message.ccRecipients),
    bcc: normalizeAddress(message.bccRecipients),
    provider: 'microsoft-graph',
    protocol: 'microsoft-graph',
  });

const jmapBody = (message) => {
  const textPart = message.textBody?.[0];
  const htmlPart = message.htmlBody?.[0];
  const textValue = textPart
    ? message.bodyValues?.[textPart.partId]?.value
    : null;
  const htmlValue = htmlPart
    ? message.bodyValues?.[htmlPart.partId]?.value
    : null;
  return textValue || stripHtml(htmlValue ?? '') || message.preview || '';
};

const recordFallbackId = (prefix, message) =>
  `${prefix}-${stableHash(JSON.stringify(message))}`;

const normalizeJmapMessage = (message) =>
  buildEmailMessageLink({
    externalId: String(
      message.id ||
        cleanMessageId(message.messageId?.[0]) ||
        recordFallbackId('jmap', message)
    ),
    sender:
      normalizeAddress(message.from ?? message.sender)[0]?.address ?? 'unknown',
    chat: String(message.threadId ?? message.id),
    body: jmapBody(message) || message.preview || '',
    timestamp: message.receivedAt ?? message.sentAt ?? null,
    subject: message.subject ?? '',
    from: normalizeAddress(message.from ?? message.sender),
    to: normalizeAddress(message.to),
    cc: normalizeAddress(message.cc),
    bcc: normalizeAddress(message.bcc),
    provider: 'jmap',
    protocol: 'jmap',
  });

const genericExternalId = (message) =>
  String(
    message.id ||
      cleanMessageId(message.messageId ?? message['message-id']) ||
      recordFallbackId('json', message)
  );

const genericSender = (message) =>
  normalizeAddress(message.from ?? message.sender)[0]?.address ?? 'unknown';

const genericChat = (message) =>
  String(
    message.threadId ??
      message.conversationId ??
      message.subject ??
      message.id ??
      genericExternalId(message)
  );

const genericBody = (message) =>
  message.text ?? message.body ?? message.preview ?? message.snippet ?? '';

const genericTimestamp = (message) =>
  message.timestamp ??
  message.date ??
  message.receivedAt ??
  message.sentAt ??
  null;

const normalizeGenericMessage = (message) =>
  buildEmailMessageLink({
    externalId: genericExternalId(message),
    sender: genericSender(message),
    chat: genericChat(message),
    body: genericBody(message),
    timestamp: genericTimestamp(message),
    subject: message.subject ?? '',
    from: normalizeAddress(message.from ?? message.sender),
    to: normalizeAddress(message.to),
    cc: normalizeAddress(message.cc),
    bcc: normalizeAddress(message.bcc),
    provider: message.provider ?? 'generic',
    protocol: message.protocol ?? 'json',
  });

export const buildEmailMessageLink = ({
  externalId,
  sender,
  chat,
  body,
  timestamp,
  subject = '',
  from = [],
  to = [],
  cc = [],
  bcc = [],
  provider = 'generic',
  protocol = 'json',
  rawHeaders = null,
}) => ({
  ...buildMessageLink({
    source: SOURCE,
    externalId,
    sender,
    chat,
    body,
    timestamp,
  }),
  subject,
  from,
  to,
  cc,
  bcc,
  provider,
  protocol,
  ...(rawHeaders ? { rawHeaders } : {}),
});

const isGmailRecord = (record) => record?.payload?.headers || record?.raw;

const isGraphRecord = (record) =>
  record?.sender?.emailAddress ||
  record?.toRecipients ||
  record?.conversationId;

const isJmapRecord = (record) =>
  Array.isArray(record?.from) || record?.receivedAt || record?.bodyValues;

const EMAIL_RECORD_NORMALIZERS = [
  [isGmailRecord, normalizeGmailMessage],
  [isGraphRecord, normalizeGraphMessage],
  [isJmapRecord, normalizeJmapMessage],
];

export const normalizeEmailRecord = (record) => {
  if (typeof record === 'string') {
    return parseRfc822Message(record);
  }
  const match = EMAIL_RECORD_NORMALIZERS.find(([matches]) => matches(record));
  return (match?.[1] ?? normalizeGenericMessage)(record);
};

export const parseEmailArchive = async (archive) => {
  if (typeof archive === 'string') {
    const messages = /^From [^\s]+ .+/m.test(archive)
      ? splitMbox(archive)
      : [archive];
    return messages.map((message, index) =>
      parseRfc822Message(message, `eml-${index}`)
    );
  }
  if (Array.isArray(archive)) {
    return archive.map(normalizeEmailRecord);
  }
  const records =
    archive?.messages ??
    archive?.value ??
    archive?.list ??
    archive?.emails ??
    archive?.items ??
    [];
  return records.map(normalizeEmailRecord);
};

const tokenFor = (protocol, override, configured) => {
  const envNames = {
    gmail: 'GMAIL_ACCESS_TOKEN',
    'microsoft-graph': 'MICROSOFT_GRAPH_ACCESS_TOKEN',
    jmap: 'JMAP_ACCESS_TOKEN',
    imap: 'EMAIL_ACCESS_TOKEN',
    pop3: 'EMAIL_ACCESS_TOKEN',
    smtp: 'EMAIL_ACCESS_TOKEN',
  };
  const token =
    override ??
    configured ??
    envValue(envNames[protocol]) ??
    envValue('EMAIL_ACCESS_TOKEN');
  if (!token) {
    throw new Error(`${protocol} email access token is required`);
  }
  return token;
};

const requireFetch = (fetchImpl, protocol) => {
  if (!fetchImpl) {
    throw new Error(`${protocol} email API requires fetch`);
  }
};

const localServerRequired = (protocol, method) => {
  const err = new Error(
    `${protocol} ${method} requires a local server transport; browsers cannot open raw mail TCP/TLS sockets`
  );
  err.code = 'LOCAL_SERVER_REQUIRED';
  err.protocol = protocol;
  return err;
};

export const buildRfc822 = ({
  from = '',
  to,
  cc = null,
  bcc = null,
  subject = '',
  text,
  body,
}) => {
  const recipients = normalizeAddress(to);
  if (recipients.length === 0) {
    throw new Error('email message requires at least one recipient');
  }
  const lines = [
    from ? `From: ${from}` : null,
    `To: ${recipients.map((r) => r.address).join(', ')}`,
    cc
      ? `Cc: ${normalizeAddress(cc)
          .map((r) => r.address)
          .join(', ')}`
      : null,
    bcc
      ? `Bcc: ${normalizeAddress(bcc)
          .map((r) => r.address)
          .join(', ')}`
      : null,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text ?? body ?? '',
  ].filter((line) => line !== null);
  return lines.join('\r\n');
};

const graphRecipients = (value) =>
  normalizeAddress(value).map((entry) => ({
    emailAddress: {
      ...(entry.name ? { name: entry.name } : {}),
      address: entry.address,
    },
  }));

const graphMessage = (content) => ({
  message: {
    subject: content.subject ?? '',
    body: {
      contentType: content.html ? 'HTML' : 'Text',
      content: content.html ?? content.text ?? content.body ?? '',
    },
    toRecipients: graphRecipients(content.to),
    ...(content.cc ? { ccRecipients: graphRecipients(content.cc) } : {}),
    ...(content.bcc ? { bccRecipients: graphRecipients(content.bcc) } : {}),
  },
  saveToSentItems: content.saveToSentItems ?? true,
});

const rootUrl = (baseUrl, fallback) =>
  String(baseUrl ?? fallback).replace(/\/+$/, '');

const createEmailContext = ({
  protocol = 'jmap',
  provider = protocol,
  token = null,
  fetchImpl = globalThis.fetch,
  baseUrl = null,
  accountId = null,
  userId = 'me',
  transport = null,
} = {}) => ({
  protocol: String(protocol).toLowerCase(),
  provider,
  token,
  fetchImpl,
  baseUrl,
  accountId,
  userId,
  transport,
});

const pullGmailEmail = async (ctx, options = {}) => {
  requireFetch(ctx.fetchImpl, 'gmail');
  const root = rootUrl(ctx.baseUrl, 'https://gmail.googleapis.com');
  const auth = authHeaders(tokenFor('gmail', options.token, ctx.token));
  const user = options.userId ?? ctx.userId;
  const listed = await requestJson(
    ctx.fetchImpl,
    `${root}/gmail/v1/users/${user}/messages`,
    {
      headers: auth,
      search: {
        maxResults: options.limit ?? 20,
        pageToken: options.offset,
        labelIds: options.label ?? options.mailbox ?? 'INBOX',
        q: options.query,
      },
    }
  );
  const messages = [];
  for (const item of listed.messages ?? []) {
    messages.push(
      await requestJson(
        ctx.fetchImpl,
        `${root}/gmail/v1/users/${user}/messages/${item.id}`,
        {
          headers: auth,
          search: { format: options.format ?? 'full' },
        }
      )
    );
  }
  const links = messages.map(normalizeGmailMessage);
  return {
    links,
    rawCount: listed.messages?.length ?? links.length,
    nextOffset: listed.nextPageToken ?? null,
    raw: listed,
  };
};

const graphSelectFields = [
  'id',
  'conversationId',
  'internetMessageId',
  'subject',
  'sender',
  'from',
  'toRecipients',
  'ccRecipients',
  'body',
  'bodyPreview',
  'receivedDateTime',
  'sentDateTime',
];

const graphSearchParams = (target, root, options) =>
  target === `${root}/me/messages`
    ? {
        $top: options.limit ?? 20,
        $select: options.select ?? graphSelectFields.join(','),
      }
    : null;

const pullGraphEmail = async (ctx, options = {}) => {
  requireFetch(ctx.fetchImpl, 'microsoft-graph');
  const root = rootUrl(ctx.baseUrl, 'https://graph.microsoft.com/v1.0');
  const target = options.nextUrl ?? options.offset ?? `${root}/me/messages`;
  const raw = await requestJson(ctx.fetchImpl, target, {
    headers: {
      ...authHeaders(tokenFor('microsoft-graph', options.token, ctx.token)),
      Prefer: 'outlook.body-content-type="text"',
    },
    search: graphSearchParams(target, root, options),
  });
  const links = (raw.value ?? []).map(normalizeGraphMessage);
  return {
    links,
    rawCount: raw.value?.length ?? links.length,
    nextOffset: raw['@odata.nextLink'] ?? null,
    raw,
  };
};

const jmapEmailCall = async (ctx, methodCalls, options = {}) => {
  requireFetch(ctx.fetchImpl, 'jmap');
  const root = rootUrl(
    ctx.baseUrl,
    options.apiUrl ?? 'https://jmap.example.invalid/jmap'
  );
  return requestJson(ctx.fetchImpl, root, {
    method: 'POST',
    headers: {
      ...authHeaders(tokenFor('jmap', options.token, ctx.token)),
      Accept: 'application/json',
    },
    body: {
      using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
      methodCalls,
    },
  });
};

const jmapQueryCalls = (account, options) => [
  [
    'Email/query',
    {
      accountId: account,
      limit: options.limit ?? 20,
      position: options.offset ?? 0,
      filter: options.mailboxId ? { inMailbox: options.mailboxId } : undefined,
      sort: [{ property: 'receivedAt', isAscending: false }],
    },
    'q',
  ],
  [
    'Email/get',
    {
      accountId: account,
      '#ids': {
        resultOf: 'q',
        name: 'Email/query',
        path: '/ids',
      },
      properties: [
        'id',
        'threadId',
        'messageId',
        'from',
        'to',
        'cc',
        'bcc',
        'subject',
        'receivedAt',
        'sentAt',
        'preview',
        'textBody',
        'htmlBody',
        'bodyValues',
      ],
      fetchTextBodyValues: true,
      fetchHTMLBodyValues: true,
    },
    'g',
  ],
];

const requireJmapAccount = (ctx, options) => {
  const account = options.accountId ?? ctx.accountId;
  if (!account) {
    throw new Error('jmap accountId is required');
  }
  return account;
};

const pullJmapEmail = async (ctx, options = {}) => {
  const account = requireJmapAccount(ctx, options);
  const raw = await jmapEmailCall(
    ctx,
    jmapQueryCalls(account, options),
    options
  );
  const got = raw.methodResponses?.find(([name]) => name === 'Email/get')?.[1];
  const links = (got?.list ?? []).map(normalizeJmapMessage);
  return { links, rawCount: links.length, nextOffset: null, raw };
};

const pullEmailViaTransport = async (ctx, options = {}) => {
  if (!ctx.transport?.pullMessages) {
    throw localServerRequired(ctx.protocol, 'pull');
  }
  const result = await ctx.transport.pullMessages({
    ...options,
    protocol: ctx.protocol,
    provider: ctx.provider,
  });
  const links =
    result.links ??
    (result.records ?? result.messages ?? []).map(normalizeEmailRecord);
  return {
    ...result,
    links,
    rawCount: result.rawCount ?? links.length,
    nextOffset: result.nextOffset ?? null,
  };
};

const postGmailEmail = async (ctx, content, options = {}) => {
  requireFetch(ctx.fetchImpl, 'gmail');
  const root = rootUrl(ctx.baseUrl, 'https://gmail.googleapis.com');
  const user = options.userId ?? ctx.userId;
  return requestJson(
    ctx.fetchImpl,
    `${root}/gmail/v1/users/${user}/messages/send`,
    {
      method: 'POST',
      headers: authHeaders(tokenFor('gmail', options.token, ctx.token)),
      body: { raw: utf8ToBase64Url(buildRfc822(content)) },
    }
  );
};

const postGraphEmail = async (ctx, content, options = {}) => {
  requireFetch(ctx.fetchImpl, 'microsoft-graph');
  const root = rootUrl(ctx.baseUrl, 'https://graph.microsoft.com/v1.0');
  return requestJson(ctx.fetchImpl, `${root}/me/sendMail`, {
    method: 'POST',
    headers: authHeaders(tokenFor('microsoft-graph', options.token, ctx.token)),
    body: graphMessage(content),
  });
};

const jmapDraft = (content, options) => ({
  mailboxIds: content.mailboxIds ?? {
    [options.draftsMailboxId ?? 'drafts']: true,
  },
  keywords: { $draft: true },
  from: normalizeAddress(content.from),
  to: normalizeAddress(content.to),
  cc: normalizeAddress(content.cc),
  bcc: normalizeAddress(content.bcc),
  subject: content.subject ?? '',
  textBody: [{ partId: 'text' }],
  bodyValues: {
    text: { value: content.text ?? content.body ?? '' },
  },
});

const jmapSubmitCalls = (account, content, options) => [
  [
    'Email/set',
    {
      accountId: account,
      create: { draft: jmapDraft(content, options) },
    },
    'd',
  ],
  [
    'EmailSubmission/set',
    {
      accountId: account,
      create: {
        send: {
          emailId: '#draft',
          identityId: options.identityId ?? content.identityId ?? 'default',
        },
      },
    },
    's',
  ],
];

const postJmapEmail = async (ctx, content, options = {}) => {
  const account = requireJmapAccount(ctx, options);
  return jmapEmailCall(
    ctx,
    jmapSubmitCalls(account, content, options),
    options
  );
};

const postEmailViaTransport = async (ctx, content, options = {}) => {
  if (!ctx.transport?.post) {
    throw localServerRequired(ctx.protocol, 'send');
  }
  return ctx.transport.post(content, {
    ...options,
    protocol: ctx.protocol,
    provider: ctx.provider,
  });
};

const EMAIL_PULLERS = {
  gmail: pullGmailEmail,
  'microsoft-graph': pullGraphEmail,
  jmap: pullJmapEmail,
};

const EMAIL_POSTERS = {
  gmail: postGmailEmail,
  'microsoft-graph': postGraphEmail,
  jmap: postJmapEmail,
};

export const createEmailLive = (config = {}) => {
  const ctx = createEmailContext(config);
  return {
    pullMessages: (options = {}) =>
      (EMAIL_PULLERS[ctx.protocol] ?? pullEmailViaTransport)(ctx, options),
    post: (content, options = {}) =>
      (EMAIL_POSTERS[ctx.protocol] ?? postEmailViaTransport)(
        ctx,
        content,
        options
      ),
  };
};

export const emailSource = {
  name: SOURCE,
  parseArchive: parseEmailArchive,
  live: {
    pullMessages: (options = {}) =>
      createEmailLive(options).pullMessages(options),
    post: (content, options = {}) =>
      createEmailLive(options).post(content, options),
  },
};
