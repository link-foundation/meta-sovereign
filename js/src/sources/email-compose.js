/**
 * Writing an outgoing mail (R-Z5; RFC 5322, 2045 and 2047, learned,
 * never copied).
 *
 * The message that goes out is plain ASCII on the wire: a non-ASCII
 * subject or display name is an encoded word, the body is 7bit when it
 * can be and base64 UTF-8 when not, and every header value has its line
 * breaks removed (a subject of `x\r\nBcc: evil@x` cannot add a header).
 * A blind copy is never written into the message: it is an envelope
 * recipient only (`envelopeRecipients`). `Date` and `Message-ID` are
 * always set, and a reply carries `In-Reply-To` and `References`.
 */

import { bytesToBase64, normalizeAddress, utf8Bytes } from './email-mime.js';

const coded = (message, code) => Object.assign(new Error(message), { code });

// What a header may hold: no line breaks or other control characters.
export const headerText = (value) =>
  String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();

const ADDRESS = /^[^\s<>()[\]\\,;:"@]+@[^\s<>()[\]\\,;:"@]+$/;

/** The bare address, or a thrown `bad-address` error. */
export const checkedAddress = (value) => {
  const text = String(value ?? '').trim();
  if (!ADDRESS.test(text)) {
    throw coded(
      `not a valid email address: ${headerText(text)}`,
      'bad-address'
    );
  }
  return text;
};

const isAscii = (text) => /^[\u0020-\u007e]*$/.test(text);

/** RFC 2047 encoded words (UTF-8, base64) for `text`, folded under 75 chars. */
export const encodeWords = (text) => {
  const clean = headerText(text);
  if (isAscii(clean)) {
    return clean;
  }
  const words = [];
  let current = '';
  for (const char of clean) {
    if (utf8Bytes(current + char).length > 42) {
      words.push(current);
      current = '';
    }
    current += char;
  }
  words.push(current);
  return words
    .map((w) => `=?UTF-8?B?${bytesToBase64(utf8Bytes(w))}?=`)
    .join('\r\n ');
};

const SPECIALS = /[()<>[\]:;@\\,."]/;

const displayName = (name) => {
  const clean = headerText(name);
  if (!clean) {
    return '';
  }
  if (!isAscii(clean)) {
    return encodeWords(clean);
  }
  return SPECIALS.test(clean)
    ? `"${clean.replace(/(["\\])/g, '\\$1')}"`
    : clean;
};

const formatMailbox = ({ name, address }) => {
  const addr = checkedAddress(address);
  const shown = displayName(name);
  return shown ? `${shown} <${addr}>` : addr;
};

// An address typed as text may not hold a line break at all: that is how a
// header is smuggled in.
const addressesOf = (value) => {
  for (const item of [value].flat(2)) {
    if (typeof item === 'string' && /[\r\n]/.test(item)) {
      throw coded('an email address cannot hold a line break', 'bad-address');
    }
  }
  return normalizeAddress(value);
};

const mailboxes = (value) => addressesOf(value).map(formatMailbox);

/** Every address the mail goes to: To, Cc and Bcc (the envelope). */
export const envelopeRecipients = (content) => [
  ...new Set(
    [content.to, content.cc, content.bcc]
      .flatMap((v) => addressesOf(v))
      .map((r) => checkedAddress(r.address))
  ),
];

const pad = (n) => String(n).padStart(2, '0');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** RFC 5322 date, in UTC: `Sat, 24 Oct 2026 10:00:00 +0000`. */
export const rfc5322Date = (when = new Date()) => {
  const d = new Date(when);
  return `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`;
};

const randomId = () =>
  globalThis.crypto?.randomUUID?.().replace(/-/g, '') ??
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

/** A new `Message-ID` (with brackets) on the sender's own domain. */
export const newMessageId = (from) => {
  const domain = String(from ?? '').match(/@([A-Za-z0-9.-]+)>?\s*$/)?.[1];
  return `<${randomId()}@${domain || 'localhost'}>`;
};

const bracket = (id) => `<${String(id).replace(/^<|>$/g, '')}>`;

const ids = (value) =>
  (Array.isArray(value) ? value : [value])
    .flatMap((v) => String(v ?? '').match(/[^\s<>,]+/g) ?? [])
    .map(bracket);

const printable = (text) =>
  [...text].every((c) => {
    const n = c.charCodeAt(0);
    return n === 9 || n === 10 || n === 13 || (n >= 32 && n <= 126);
  });

const body = (text) => {
  const crlf = String(text ?? '').replace(/\r\n|\r|\n/g, '\r\n');
  const plain =
    printable(crlf) && crlf.split('\r\n').every((line) => line.length <= 900);
  if (plain) {
    return { encoding: '7bit', text: crlf };
  }
  const b64 = bytesToBase64(utf8Bytes(crlf));
  return {
    encoding: 'base64',
    text: b64.replace(/(.{76})/g, '$1\r\n'),
  };
};

// In-Reply-To and References, for a reply.
const threadLines = (content) => {
  const inReplyTo = ids(content.inReplyTo)[0];
  const references = ids([content.references ?? [], content.inReplyTo ?? []]);
  return [
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references.length > 0
      ? `References: ${[...new Set(references)].join('\r\n ')}`
      : null,
  ];
};

/**
 * The message and its id: `{ raw, messageId, recipients }`. `recipients`
 * is the envelope (To, Cc, Bcc); `raw` never names the Bcc.
 */
export const composeMessage = (content, options = {}) => {
  const to = mailboxes(content.to);
  if (to.length === 0) {
    throw new Error('email message requires at least one recipient');
  }
  const from = content.from ? mailboxes(content.from).join(', ') : '';
  const messageId = bracket(
    headerText(content.messageId || newMessageId(from))
  );
  const text = body(content.text ?? content.body ?? '');
  const cc = mailboxes(content.cc);
  const lines = [
    from ? `From: ${from}` : null,
    `To: ${to.join(',\r\n ')}`,
    cc.length > 0 ? `Cc: ${cc.join(',\r\n ')}` : null,
    `Subject: ${encodeWords(content.subject ?? '')}`,
    `Date: ${rfc5322Date(content.date ?? options.now ?? new Date())}`,
    `Message-ID: ${messageId}`,
    ...threadLines(content),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    `Content-Transfer-Encoding: ${text.encoding}`,
    '',
    text.text,
  ].filter((line) => line !== null);
  return {
    raw: lines.join('\r\n'),
    messageId,
    recipients: envelopeRecipients(content),
  };
};

export const buildRfc822 = (content, options) =>
  composeMessage(content, options).raw;
