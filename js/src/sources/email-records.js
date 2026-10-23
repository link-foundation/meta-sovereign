/**
 * Email records as message links (issue #3; R-Z5).
 *
 * Mail arrives as raw RFC 822 text or bytes (IMAP, POP3, `.eml`,
 * `.mbox`, Gmail `format=raw`) or as the JSON of Gmail, Microsoft Graph
 * and JMAP. Each is read into one link shape (`buildEmailMessageLink`):
 * the plain text, a safe tree of the HTML (never HTML itself), the
 * attachments' name, size and type, and the ids that put a mail into
 * its conversation: Message-ID, In-Reply-To and References (see
 * ./email-mime.js `threadKey`). The network side is ./email-live.js.
 */

import { buildMessageLink } from './link.js';
import { htmlToSafe } from './email-html.js';
import {
  base64ToBytes,
  baseSubject,
  bytesToBase64,
  cleanMessageId,
  decodeCharset,
  decodeHeaderValue,
  emptyBody,
  finishBody,
  firstHeader,
  headerObject,
  mergeAlternative,
  mergeSequence,
  messageBinary,
  messageIds,
  normalizeAddress,
  parseAddressList,
  parseStructured,
  readBody,
  readMessage,
  splitMbox,
  threadKey,
  utf8Bytes,
} from './email-mime.js';

export { parseAddressList };

export const SOURCE = 'email';

const stableHash = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
};

export const utf8ToBase64Url = (text) =>
  bytesToBase64(utf8Bytes(text))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const base64UrlToBytes = (encoded) =>
  base64ToBytes(
    String(encoded ?? '')
      .replace(/-/g, '+')
      .replace(/_/g, '/')
  );

// A date as ISO time when it can be read (the chat orders by it), else as given.
const isoTime = (value) => {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? String(value) : new Date(parsed).toISOString();
};

const idsOf = (headers, name) =>
  (headers.get(name) ?? []).flatMap((value) => messageIds(value));

const rawId = (input) => `raw-${stableHash(messageBinary(input))}`;

const addressesOf = (headers) => ({
  from: parseAddressList(
    firstHeader(headers, 'from') ?? firstHeader(headers, 'sender') ?? 'unknown'
  ),
  to: parseAddressList(firstHeader(headers, 'to') ?? ''),
  cc: parseAddressList(firstHeader(headers, 'cc') ?? ''),
});

// The ids that put a mail into its conversation.
const threadingOf = (headers, subject, ownId) => {
  const references = idsOf(headers, 'references');
  const inReplyTo = idsOf(headers, 'in-reply-to')[0] ?? null;
  return {
    references,
    inReplyTo,
    key: threadKey({ references, inReplyTo, messageId: ownId, subject }),
    parent: inReplyTo ?? references.at(-1) ?? null,
  };
};

/**
 * Read one raw message (bytes, or text already decoded; `binary: true`
 * for a string that holds one char per byte, as an mbox read from bytes).
 */
export const parseRfc822Message = (input, fallbackId = null, options = {}) => {
  const {
    headers,
    body: rawBody,
    textual,
  } = readMessage(input, options.binary);
  const content = readBody(headers, rawBody, textual);
  const ownId = cleanMessageId(firstHeader(headers, 'message-id'));
  const messageId = ownId || fallbackId || rawId(input);
  const { from, to, cc } = addressesOf(headers);
  const subject = decodeHeaderValue(firstHeader(headers, 'subject') ?? '');
  const thread = threadingOf(headers, subject, ownId);
  const timestamp = isoTime(firstHeader(headers, 'date'));
  return buildEmailMessageLink({
    externalId: messageId,
    sender: from[0]?.address ?? 'unknown',
    chat: thread.key ?? messageId,
    body: content.text,
    timestamp,
    subject,
    from,
    to,
    cc,
    rawHeaders: headerObject(headers),
    protocol: 'rfc822',
    provider: 'archive',
    replyTo: thread.parent,
    senderName: from[0]?.name ?? null,
    chatName: baseSubject(subject) || null,
    attachments: content.files.length > 0 ? content.files : null,
    messageId: ownId || null,
    references: thread.references,
    inReplyTo: thread.inReplyTo,
    bodyTree: content.tree,
    raw: { messageId, subject, from: from[0]?.address, date: timestamp },
  });
};

const headerArrayValue = (headers, name) =>
  headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;

const gmailHeaders = (message) => message.payload?.headers ?? [];

// A Gmail text or HTML part (Gmail has undone the transfer encoding, the
// charset is still the part's own).
const gmailText = (part, type) => {
  const charset = parseStructured(
    headerArrayValue(part.headers ?? [], 'content-type') ?? ''
  ).params.charset;
  const text = decodeCharset(base64UrlToBytes(part.body.data), charset).trim();
  return type === 'text/html'
    ? { text: '', html: text, files: [] }
    : { text, html: '', files: [] };
};

const gmailFile = (part, cid) => ({
  kind: 'file',
  name: part.filename || cid || 'attachment',
  mime: part.mimeType ?? null,
  size: part.body?.size ?? null,
  ...(cid ? { cid, inline: true } : {}),
  ...(part.body?.attachmentId
    ? { remote: { attachmentId: part.body.attachmentId } }
    : {}),
});

// One Gmail part: its text or HTML, or an attachment.
const gmailLeaf = (part) => {
  const type = String(part.mimeType ?? '').toLowerCase();
  const cid = cleanMessageId(
    headerArrayValue(part.headers ?? [], 'content-id')
  );
  if (
    !part.filename &&
    (type === 'text/plain' || type === 'text/html') &&
    part.body?.data
  ) {
    return gmailText(part, type);
  }
  if (!part.filename && !part.body?.attachmentId && !cid) {
    return emptyBody();
  }
  return { text: '', html: '', files: [gmailFile(part, cid)] };
};

const gmailWalk = (part) => {
  if (!part) {
    return emptyBody();
  }
  if (part.parts?.length) {
    const kids = part.parts.map(gmailWalk);
    return (
      String(part.mimeType).toLowerCase() === 'multipart/alternative'
        ? mergeAlternative
        : mergeSequence
    )(kids);
  }
  return gmailLeaf(part);
};

const gmailTimestamp = (message, headers) =>
  message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : isoTime(headerArrayValue(headers, 'date'));

const gmailChat = (message, subject) =>
  String(message.threadId ?? subject ?? message.id);

const normalizeGmailRaw = (message) => {
  const parsed = parseRfc822Message(base64UrlToBytes(message.raw), message.id);
  return {
    ...parsed,
    externalId: message.id,
    id: `msg:${SOURCE}:${message.id}`,
    provider: 'gmail',
    protocol: 'gmail',
    chat: message.threadId ?? parsed.chat,
    raw: {
      ...parsed.raw,
      id: message.id,
      threadId: message.threadId,
      labelIds: message.labelIds,
    },
  };
};

export const normalizeGmailMessage = (message) => {
  if (message.raw) {
    return normalizeGmailRaw(message);
  }
  const headers = gmailHeaders(message);
  const from = normalizeAddress(headerArrayValue(headers, 'from'));
  const subject = decodeHeaderValue(headerArrayValue(headers, 'subject') ?? '');
  const content = finishBody(gmailWalk(message.payload));
  const references = messageIds(headerArrayValue(headers, 'references'));
  const inReplyTo = messageIds(headerArrayValue(headers, 'in-reply-to'))[0];
  return buildEmailMessageLink({
    externalId: String(message.id),
    sender: from[0]?.address ?? 'unknown',
    chat: gmailChat(message, subject),
    body: content.text || message.snippet || '',
    timestamp: gmailTimestamp(message, headers),
    subject,
    from,
    to: normalizeAddress(headerArrayValue(headers, 'to')),
    cc: normalizeAddress(headerArrayValue(headers, 'cc')),
    rawHeaders: Object.fromEntries(
      headers.map((h) => [h.name?.toLowerCase(), [h.value]])
    ),
    provider: 'gmail',
    protocol: 'gmail',
    replyTo: inReplyTo ?? null,
    senderName: from[0]?.name ?? null,
    chatName: baseSubject(subject) || null,
    messageId: cleanMessageId(headerArrayValue(headers, 'message-id')) || null,
    references,
    inReplyTo: inReplyTo ?? null,
    bodyTree: content.tree,
    raw: {
      id: message.id,
      threadId: message.threadId,
      labelIds: message.labelIds,
    },
    attachments: content.files.length > 0 ? content.files : null,
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

// Graph's body: HTML (kept as a safe tree) or text.
const graphContent = (message) => {
  const content = message.body?.content ?? message.bodyPreview ?? '';
  if (message.body?.contentType?.toLowerCase() === 'html') {
    const safe = htmlToSafe(content);
    return { text: safe.text, tree: safe.tree };
  }
  return { text: content, tree: null };
};

const graphAttachments = (message) => {
  const list = (message.attachments ?? [])
    .filter((a) => a?.name)
    .map((a) => ({
      kind: 'file',
      name: a.name,
      mime: a.contentType ?? null,
      size: a.size ?? null,
      ...(a.contentId
        ? { cid: cleanMessageId(a.contentId), inline: true }
        : a.isInline
          ? { inline: true }
          : {}),
      ...(a.id ? { remote: { attachmentId: a.id } } : {}),
    }));
  return list.length > 0 ? list : null;
};

export const normalizeGraphMessage = (message) => {
  const content = graphContent(message);
  const sent = message.internetMessageHeaders ?? [];
  const inReplyTo = messageIds(headerArrayValue(sent, 'in-reply-to'))[0];
  return buildEmailMessageLink({
    externalId: graphExternalId(message),
    sender: graphSender(message),
    chat: String(message.conversationId ?? message.threadId ?? message.id),
    body: content.text,
    timestamp: message.receivedDateTime ?? message.sentDateTime ?? null,
    subject: message.subject ?? '',
    from: normalizeAddress(message.from ?? message.sender),
    to: normalizeAddress(message.toRecipients),
    cc: normalizeAddress(message.ccRecipients),
    bcc: normalizeAddress(message.bccRecipients),
    provider: 'microsoft-graph',
    protocol: 'microsoft-graph',
    replyTo: inReplyTo ?? null,
    senderName:
      normalizeAddress(message.from ?? message.sender)[0]?.name ?? null,
    chatName: baseSubject(message.subject) || null,
    messageId: cleanMessageId(message.internetMessageId) || null,
    references: messageIds(headerArrayValue(sent, 'references')),
    inReplyTo: inReplyTo ?? null,
    bodyTree: content.tree,
    raw: {
      id: message.id,
      conversationId: message.conversationId,
      subject: message.subject,
    },
    attachments: graphAttachments(message),
  });
};

const jmapPart = (message, part, wantHtml) => {
  if (!part) {
    return null;
  }
  const isHtml = part.type === 'text/html';
  if (isHtml !== wantHtml) {
    return null;
  }
  return message.bodyValues?.[part.partId]?.value ?? null;
};

const jmapContent = (message) => {
  const first = message.textBody?.[0];
  const text = jmapPart(message, first, false);
  // A message with no plain part lists its HTML as its text body.
  const html =
    jmapPart(message, message.htmlBody?.[0], true) ??
    jmapPart(message, first, true);
  const safe = html ? htmlToSafe(html) : null;
  return {
    text: text || safe?.text || message.preview || '',
    tree: safe?.tree ?? null,
  };
};

const recordFallbackId = (prefix, message) =>
  `${prefix}-${stableHash(JSON.stringify(message))}`;

const jmapAttachmentsFrom = (message) => {
  const list = (message.attachments ?? [])
    .map((a) => ({
      kind: 'file',
      name: a.name ?? null,
      mime: a.type ?? null,
      size: a.size ?? null,
      ...(a.cid ? { cid: a.cid, inline: true } : {}),
      ...(a.blobId ? { remote: { blobId: a.blobId } } : {}),
    }))
    .filter((a) => a.name);
  return list.length > 0 ? list : null;
};

const jmapAddrs = (message) => normalizeAddress(message.from ?? message.sender);

const jmapSenderAddr = (message) => jmapAddrs(message)[0]?.address ?? 'unknown';

const jmapSenderName = (message) => jmapAddrs(message)[0]?.name ?? null;

const jmapExternalId = (message) =>
  String(
    message.id ||
      cleanMessageId(message.messageId?.[0]) ||
      recordFallbackId('jmap', message)
  );

export const normalizeJmapMessage = (message) => {
  const content = jmapContent(message);
  const inReplyTo = message.inReplyTo?.[0] ?? null;
  return buildEmailMessageLink({
    externalId: jmapExternalId(message),
    sender: jmapSenderAddr(message),
    chat: String(message.threadId ?? message.id),
    body: content.text,
    timestamp: message.receivedAt ?? message.sentAt ?? null,
    subject: message.subject ?? '',
    from: jmapAddrs(message),
    to: normalizeAddress(message.to),
    cc: normalizeAddress(message.cc),
    bcc: normalizeAddress(message.bcc),
    provider: 'jmap',
    protocol: 'jmap',
    replyTo: inReplyTo,
    senderName: jmapSenderName(message),
    chatName: baseSubject(message.subject) || null,
    messageId: message.messageId?.[0] ?? null,
    references: message.references ?? [],
    inReplyTo,
    bodyTree: content.tree,
    raw: {
      id: message.id,
      threadId: message.threadId,
      subject: message.subject,
    },
    attachments: jmapAttachmentsFrom(message),
  });
};

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
    senderName:
      normalizeAddress(message.from ?? message.sender)[0]?.name ?? null,
    chatName: message.subject || null,
    raw: {
      id: message.id ?? genericExternalId(message),
      subject: message.subject,
    },
  });

const EMAIL_DEFAULTS = {
  subject: '',
  from: [],
  to: [],
  cc: [],
  bcc: [],
  provider: 'generic',
  protocol: 'json',
};

const given = (fields) =>
  Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

export const buildEmailMessageLink = (input) => {
  const f = { ...EMAIL_DEFAULTS, ...given(input) };
  return {
    ...buildMessageLink({
      source: SOURCE,
      externalId: f.externalId,
      sender: f.sender,
      chat: f.chat,
      body: f.body,
      timestamp: f.timestamp,
      replyTo: f.replyTo ?? null,
      senderName: f.senderName ?? null,
      chatName: f.chatName ?? null,
      attachments: f.attachments ?? null,
      raw: f.raw ?? null,
    }),
    subject: f.subject,
    from: f.from,
    to: f.to,
    cc: f.cc,
    bcc: f.bcc,
    provider: f.provider,
    protocol: f.protocol,
    ...(f.rawHeaders ? { rawHeaders: f.rawHeaders } : {}),
    ...(f.messageId ? { messageId: f.messageId } : {}),
    ...(f.references?.length ? { references: f.references } : {}),
    ...(f.inReplyTo ? { inReplyTo: f.inReplyTo } : {}),
    ...(f.bodyTree?.length ? { bodyTree: f.bodyTree } : {}),
  };
};

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

const isBytes = (value) =>
  value instanceof Uint8Array || value instanceof ArrayBuffer;

// A file read as bytes keeps every part's own charset; JSON is read as text.
const parseArchiveBytes = (bytes) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const binary = messageBinary(view);
  if (/^\s*[[{]/.test(binary.slice(0, 64))) {
    return parseEmailArchive(JSON.parse(decodeCharset(view)));
  }
  const messages = /^From \S+ .+/m.test(binary) ? splitMbox(binary) : [binary];
  return messages.map((message, index) =>
    parseRfc822Message(message, `eml-${index}`, { binary: true })
  );
};

export const parseEmailArchive = async (archive) => {
  if (isBytes(archive)) {
    return parseArchiveBytes(archive);
  }
  if (typeof archive === 'string') {
    const messages = /^From \S+ .+/m.test(archive)
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
