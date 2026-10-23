/**
 * Reading a raw mail message (R-Z5; learned from RFC 2045, 2046, 2047,
 * 2231 and 5322, never copied from a mail client).
 *
 * A message arrives as bytes (IMAP, POP3, `.eml`, `.mbox`) or as text
 * the page already decoded. It is read as a "binary string" (one char
 * per byte) so every part can be decoded with its own charset: koi8-r,
 * windows-1251, iso-8859-x, gb2312 and so on through `TextDecoder`.
 * Boundaries keep their case, multiparts nest, encoded-word headers
 * (Q and B, any charset) decode, attachments keep name, size and type
 * (and their bytes go to the attachment sink, when the server set one),
 * and the HTML body becomes a safe tree (./email-html.js).
 */

import { htmlToSafe } from './email-html.js';

export const bytesToBase64 = (bytes) => {
  if (globalThis.Buffer) {
    return globalThis.Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary);
};

export const base64ToBytes = (encoded) => {
  const clean = String(encoded ?? '').replace(/[^A-Za-z0-9+/]/g, '');
  const padded = clean.padEnd(Math.ceil(clean.length / 4) * 4, '=');
  if (globalThis.Buffer) {
    return new Uint8Array(globalThis.Buffer.from(padded, 'base64'));
  }
  return Uint8Array.from(globalThis.atob(padded), (c) => c.charCodeAt(0));
};

export const utf8Bytes = (text) => new globalThis.TextEncoder().encode(text);

/** `text` decoded from `bytes` as `label`; unknown labels read as UTF-8. */
export const decodeCharset = (bytes, label = 'utf-8') => {
  const name = String(label ?? 'utf-8')
    .replace(/\*.*$/, '')
    .trim()
    .replace(/^"|"$/g, '')
    .toLowerCase();
  try {
    return new globalThis.TextDecoder(name || 'utf-8').decode(bytes);
  } catch {
    return new globalThis.TextDecoder('utf-8').decode(bytes);
  }
};

const bytesToBinary = (bytes) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return out;
};

// One char per byte; a char above 255 (text the page decoded) is UTF-8.
const binaryToBytes = (text) => {
  const s = String(text ?? '');
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code > 255) {
      return utf8Bytes(s);
    }
    out[i] = code;
  }
  return out;
};

// ---- Quoted-printable and encoded words -------------------------------------

/** Bytes of quoted-printable `text` (a binary string). */
export const decodeQuotedPrintableBytes = (text, headerMode = false) => {
  const compact = String(text ?? '').replace(/=[ \t]*\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < compact.length; i += 1) {
    const hex = compact.slice(i + 1, i + 3);
    if (compact[i] === '=' && /^[0-9a-f]{2}$/i.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      i += 2;
    } else if (headerMode && compact[i] === '_') {
      bytes.push(32);
    } else if (compact.charCodeAt(i) > 255) {
      bytes.push(...utf8Bytes(compact[i]));
    } else {
      bytes.push(compact.charCodeAt(i));
    }
  }
  return new Uint8Array(bytes);
};

export const decodeQuotedPrintable = (text) =>
  decodeCharset(decodeQuotedPrintableBytes(text), 'utf-8');

const WORD = /=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g;

const wordBytes = (encoding, value) =>
  encoding.toLowerCase() === 'b'
    ? base64ToBytes(value)
    : decodeQuotedPrintableBytes(value, true);

/** `value` with every RFC 2047 encoded word decoded (any charset). */
export const decodeHeaderValue = (value) => {
  const text = String(value ?? '');
  if (!text.includes('=?')) {
    return text;
  }
  const words = [...text.matchAll(WORD)];
  let out = '';
  let at = 0;
  for (let i = 0; i < words.length;) {
    const first = words[i];
    let end = first.index + first[0].length;
    const charset = first[1].replace(/\*.*$/, '').toLowerCase();
    const chunks = [wordBytes(first[2], first[3])];
    let j = i + 1;
    // Adjacent words of one charset are one run: a character may be
    // split across them, and the space between them is not text.
    while (
      j < words.length &&
      /^\s*$/.test(text.slice(end, words[j].index)) &&
      words[j][1].replace(/\*.*$/, '').toLowerCase() === charset
    ) {
      chunks.push(wordBytes(words[j][2], words[j][3]));
      end = words[j].index + words[j][0].length;
      j += 1;
    }
    // The space between two encoded words (even of different charsets) is
    // not text (RFC 2047 6.2).
    const gap = text.slice(at, first.index);
    out += i > 0 && /^\s*$/.test(gap) ? '' : gap;
    const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let off = 0;
    for (const chunk of chunks) {
      all.set(chunk, off);
      off += chunk.length;
    }
    out += decodeCharset(all, charset);
    at = end;
    i = j;
  }
  return out + text.slice(at);
};

// ---- Headers ----------------------------------------------------------------

const splitHeaderBody = (text) => {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  const blank = /(?:^|\n)[ \t]*\n/.exec(normalized);
  if (!blank) {
    return { headerBlock: normalized, body: '' };
  }
  return {
    headerBlock: normalized.slice(0, blank.index),
    body: normalized.slice(blank.index + blank[0].length),
  };
};

// Header bytes that are not ASCII are UTF-8 (SMTPUTF8, or a client that
// wrote them raw), else the Windows legacy set.
const readableHeaders = (block, textual) => {
  if (textual || !/[\u0080-\u00ff]/.test(block)) {
    return block;
  }
  const bytes = binaryToBytes(block);
  try {
    return new globalThis.TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return decodeCharset(bytes, 'windows-1252');
  }
};

/** Header name (lower case) -> raw values, folded lines joined. */
export const parseHeaders = (headerBlock) => {
  const unfolded = [];
  for (const line of String(headerBlock ?? '').split('\n')) {
    if (/^[ \t]/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`;
    } else {
      unfolded.push(line);
    }
  }
  const headers = new Map();
  for (const line of unfolded) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const name = line.slice(0, idx).trim().toLowerCase();
      headers.set(name, [
        ...(headers.get(name) ?? []),
        line.slice(idx + 1).trim(),
      ]);
    }
  }
  return headers;
};

export const firstHeader = (headers, name) =>
  headers.get(name.toLowerCase())?.[0];

/** Header values decoded for display, as the link's `rawHeaders`. */
export const headerObject = (headers) =>
  Object.fromEntries(
    [...headers.entries()].map(([key, values]) => [
      key,
      values.map(decodeHeaderValue),
    ])
  );

const splitOutsideQuotes = (value, separator) => {
  const out = [];
  let current = '';
  let quoted = false;
  for (const char of String(value ?? '')) {
    if (char === '"') {
      quoted = !quoted;
    }
    if (char === separator && !quoted) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
};

const unquote = (value) => {
  const v = String(value ?? '').trim();
  return v.startsWith('"') && v.endsWith('"') && v.length >= 2
    ? v.slice(1, -1).replace(/\\(.)/g, '$1')
    : v;
};

const percentBytes = (text) => {
  const bytes = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '%' && /^[0-9a-f]{2}$/i.test(text.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(text.charCodeAt(i) & 255);
    }
  }
  return new Uint8Array(bytes);
};

// RFC 2231: `name*0*=utf-8''%D0...; name*1=...` and `name*=utf-8''...`.
const joinParams = (raw) => {
  const params = {};
  const groups = new Map();
  for (const [key, value] of raw) {
    const m = key.match(/^([^*]+)(?:\*(\d+))?(\*)?$/);
    if (!m) {
      continue;
    }
    if (m[2] === undefined && !m[3]) {
      params[m[1]] = decodeHeaderValue(value);
      continue;
    }
    const list = groups.get(m[1]) ?? [];
    list.push({ n: Number(m[2] ?? 0), star: Boolean(m[3]), value });
    groups.set(m[1], list);
  }
  for (const [name, list] of groups) {
    list.sort((a, b) => a.n - b.n);
    const head = list[0].star
      ? list[0].value.match(/^([^']*)'[^']*'(.*)$/)
      : null;
    const charset = head?.[1] || 'utf-8';
    const bytes = [];
    list.forEach((part, index) => {
      const text = index === 0 && head ? head[2] : part.value;
      bytes.push(...(part.star ? percentBytes(text) : utf8Bytes(text)));
    });
    params[name] = decodeCharset(new Uint8Array(bytes), charset);
  }
  return params;
};

/** `{ value, params }` of a structured header such as Content-Type. */
export const parseStructured = (header) => {
  const [first, ...rest] = splitOutsideQuotes(header, ';');
  const raw = [];
  for (const part of rest) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      raw.push([
        part.slice(0, idx).trim().toLowerCase(),
        unquote(part.slice(idx + 1)),
      ]);
    }
  }
  return {
    value: String(first ?? '')
      .trim()
      .toLowerCase(),
    params: joinParams(raw),
  };
};

// ---- Addresses and ids --------------------------------------------------------

export const parseAddressList = (value) =>
  splitOutsideQuotes(value, ',')
    .filter((part) => part.trim())
    .map((part) => {
      const trimmed = decodeHeaderValue(part.trim());
      const match = trimmed.match(/<([^<>@\s]+@[^<>\s]+)>/);
      const loose = trimmed.match(/([^<>\s,]+@[^<>\s,]+)/);
      const address = match?.[1] ?? loose?.[1] ?? trimmed;
      const name = trimmed
        .replace(match?.[0] ?? loose?.[0] ?? address, '')
        .replace(/^\s*"|"\s*$/g, '')
        .trim();
      return { name: name || null, address: address.trim() };
    })
    .filter((entry) => entry.address);

/** Every message id in `value` (`<a@x> <b@x>`), without the brackets. */
export const messageIds = (value) => {
  const text = String(value ?? '');
  const bracketed = [...text.matchAll(/<([^<>\s]+)>/g)].map((m) => m[1]);
  if (bracketed.length > 0) {
    return bracketed;
  }
  return text
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
};

export const cleanMessageId = (value) => messageIds(value)[0] ?? '';

const SUBJECT_PREFIX =
  /^\s*(?:(?:re|fwd?|aw|wg|sv|vs|r|antw|odp)(?:\[\d+\])?\s*:\s*)+/i;

/** A subject without its `Re:` / `Fwd:` prefixes. */
export const baseSubject = (subject) =>
  String(subject ?? '')
    .replace(SUBJECT_PREFIX, '')
    .trim();

/**
 * The conversation a message belongs to: the first id of References
 * (the root of the thread), else its In-Reply-To, else its own id; only
 * a message with no ids at all falls back to its subject.
 */
export const threadKey = ({ references, inReplyTo, messageId, subject }) =>
  references?.[0] ||
  inReplyTo ||
  messageId ||
  baseSubject(subject).toLowerCase() ||
  null;

// ---- Parts --------------------------------------------------------------------

let attachmentSink = null;

/**
 * The server sets where attachment bytes are kept: a function
 * `(bytes, { name, mime }) -> id | null`. Without one (the page) only
 * name, size and type are kept.
 */
export const setAttachmentSink = (sink) => {
  attachmentSink = typeof sink === 'function' ? sink : null;
};

const readEntity = (text, textual = true) => {
  const { headerBlock, body } = splitHeaderBody(text);
  return {
    headers: parseHeaders(readableHeaders(headerBlock, textual)),
    body,
  };
};

// The decoded bytes of a part, or its text when it was already text.
const payload = (entity, textual) => {
  const transfer = String(
    firstHeader(entity.headers, 'content-transfer-encoding') ?? ''
  )
    .trim()
    .toLowerCase();
  if (transfer === 'base64') {
    return { bytes: base64ToBytes(entity.body) };
  }
  if (transfer === 'quoted-printable') {
    return { bytes: decodeQuotedPrintableBytes(entity.body) };
  }
  return textual
    ? { text: entity.body }
    : { bytes: binaryToBytes(entity.body) };
};

const textOfPayload = (data, charset) => {
  if (data.text !== undefined) {
    return data.text.trim();
  }
  if (charset) {
    return decodeCharset(data.bytes, charset).trim();
  }
  // No charset: UTF-8 when it is valid, else the legacy Windows one.
  try {
    return new globalThis.TextDecoder('utf-8', { fatal: true })
      .decode(data.bytes)
      .trim();
  } catch {
    return decodeCharset(data.bytes, 'windows-1252').trim();
  }
};

const splitParts = (body, boundary) => {
  const parts = [];
  let current = null;
  for (const line of String(body).split('\n')) {
    const bare = line.trimEnd();
    if (bare === `--${boundary}`) {
      if (current) {
        parts.push(current.join('\n'));
      }
      current = [];
    } else if (bare === `--${boundary}--`) {
      if (current) {
        parts.push(current.join('\n'));
      }
      current = null;
      break;
    } else if (current) {
      current.push(line);
    }
  }
  if (current && current.length > 0) {
    parts.push(current.join('\n'));
  }
  return parts;
};

export const emptyBody = () => ({ text: '', html: '', files: [] });

const dispositionOf = (headers) =>
  parseStructured(firstHeader(headers, 'content-disposition') ?? '');

const fileRecord = (entity, ctype, textual) => {
  const disp = dispositionOf(entity.headers);
  const cid = cleanMessageId(firstHeader(entity.headers, 'content-id'));
  const name =
    disp.params.filename ||
    ctype.params.name ||
    cid ||
    (ctype.value === 'message/rfc822' ? 'message.eml' : 'attachment');
  const data = payload(entity, textual);
  const bytes = data.bytes ?? utf8Bytes(data.text);
  const mime = ctype.value || null;
  let file = null;
  if (attachmentSink && bytes.length > 0) {
    file = attachmentSink(bytes, { name, mime }) ?? null;
  }
  return {
    kind: 'file',
    name,
    mime,
    size: bytes.length,
    ...(cid ? { cid } : {}),
    ...(disp.value === 'inline' || (cid && !disp.value)
      ? { inline: true }
      : {}),
    ...(file ? { file } : {}),
  };
};

export const mergeSequence = (results) => ({
  text: results
    .map((r) => r.text)
    .filter(Boolean)
    .join('\n\n'),
  html: results
    .map((r) => r.html)
    .filter(Boolean)
    .join('\n'),
  files: results.flatMap((r) => r.files),
});

// Alternatives are the same content twice: the first text, the last HTML.
export const mergeAlternative = (results) => ({
  text: results.map((r) => r.text).find(Boolean) ?? '',
  html: [...results].reverse().find((r) => r.html)?.html ?? '',
  files: results.flatMap((r) => r.files),
});

const isBodyPart = (ctype, disp, hasName) =>
  (ctype.value === 'text/plain' || ctype.value === 'text/html') &&
  disp.value !== 'attachment' &&
  !hasName;

const walk = (entity, textual, depth = 0) => {
  const ctype = parseStructured(
    firstHeader(entity.headers, 'content-type') ?? 'text/plain'
  );
  if (ctype.value.startsWith('multipart/') && depth < 12) {
    const boundary = ctype.params.boundary;
    if (!boundary) {
      return emptyBody();
    }
    const children = splitParts(entity.body, boundary).map((part) =>
      walk(readEntity(part, textual), textual, depth + 1)
    );
    return (
      ctype.value === 'multipart/alternative' ? mergeAlternative : mergeSequence
    )(children);
  }
  const disp = dispositionOf(entity.headers);
  const hasName = Boolean(disp.params.filename || ctype.params.name);
  if (isBodyPart(ctype, disp, hasName)) {
    const text = textOfPayload(payload(entity, textual), ctype.params.charset);
    return ctype.value === 'text/html'
      ? { text: '', html: text, files: [] }
      : { text, html: '', files: [] };
  }
  return { text: '', html: '', files: [fileRecord(entity, ctype, textual)] };
};

/**
 * `{ text, html, tree, files }` of one message's body: its plain text
 * (made from the HTML when there is no plain part), the safe tree of the
 * HTML, and every attachment's name, size and type.
 */
export const finishBody = (found) => {
  const safe = found.html ? htmlToSafe(found.html) : null;
  return {
    text: found.text || safe?.text || '',
    tree: safe?.tree ?? null,
    files: found.files,
  };
};

export const readBody = (headers, body, textual) =>
  finishBody(walk({ headers, body }, textual));

/** A message's headers, body and whether its text was already decoded. */
export const readMessage = (input, binary = false) => {
  const textual = typeof input === 'string' && !binary;
  const text =
    typeof input === 'string' ? input : bytesToBinary(new Uint8Array(input));
  return { ...readEntity(text, textual), textual };
};

export const messageBinary = (input) =>
  typeof input === 'string' ? input : bytesToBinary(new Uint8Array(input));

// ---- Mbox -------------------------------------------------------------------

/** The messages of an mbox, as binary strings. */
export const splitMbox = (text) => {
  const lines = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const messages = [];
  let current = [];
  for (const line of lines) {
    if (/^From \S+ .+/.test(line)) {
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

/** Addresses of any shape (string, `{email}`, Graph's, arrays) as `{ name, address }`. */
export const normalizeAddress = (value) => {
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
