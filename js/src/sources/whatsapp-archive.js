/**
 * WhatsApp "Export chat" reader (R-Z9).
 *
 * Reads the `.txt` of a chat export (or the text inside the `.zip` of an
 * export with media) in the two layouts the apps write:
 *   Android  `12/10/2026, 14:32 - Alice: hi`   `10/12/26, 2:32 PM - Alice: hi`
 *   iOS      `[12/10/2026, 14:32:11] Alice: hi`   `[2026-04-30, 2:32:11 PM] ...`
 * with 12 or 24 hour clocks, a day-first, month-first or year-first date
 * (found by scanning the whole file, see `detectDateOrder`), messages that
 * run over several lines, system lines, `<Media omitted>`, `<attached: f>`
 * and `f (file attached)` lines (mapped to the files of the zip).
 *
 * An export carries no time zone: it is the phone's local clock, read in
 * THIS machine's time zone (import on a computer set to the phone's zone);
 * the stored timestamp is that instant as ISO UTC. Message ids are deterministic (chat id, timestamp,
 * sender and the index among messages sharing both), so importing a file
 * twice, or two overlapping exports of one chat, never doubles a message.
 *
 * Limits, said plainly: an unusual sender name containing ": " is read as
 * a sender plus text; AM/PM markers and "omitted" words are English only.
 */

import { buildMessageLink } from './link.js';
import {
  archiveChatId,
  chatIdOf,
  chatNameFromFile,
  stableHash,
} from './whatsapp-ids.js';

const SOURCE = 'whatsapp';
const DATE = '(\\d{1,4})[./-](\\d{1,2})[./-](\\d{1,4})';
const TIME = '(\\d{1,2})[:.](\\d{2})(?:[:.](\\d{2}))?';
const AMPM = '(?:\\s?([AaPp])\\.?\\s?[Mm]\\.?)?';
const IOS = new RegExp(`^\\[${DATE},?\\s+${TIME}${AMPM}\\]\\s?(.*)$`);
const ANDROID = new RegExp(
  `^${DATE},?\\s+${TIME}${AMPM}\\s+[-\\u2013\\u2014]\\s+(.*)$`
);
// "Sender: text"; a quote in the "sender" means a system line about a name.
const SENDER = /^([^:\n]{1,100}?):\s([\s\S]*)$/;
const OMITTED =
  /^<?\s*(?:media|image|video|audio|sticker|gif|document|contact card|voice message)\s+omitted\s*>?$/i;
const ATTACHED_IOS = /^<attached:\s*([^>]+)>$/i;
const ATTACHED_ANDROID = /^(.+?\.[A-Za-z0-9]{2,5})\s+\(file attached\)$/i;
const EDITED = /\s*<This message was edited>\s*$/i;
const DELETED = /^(?:this message was deleted|you deleted this message)\.?$/i;

// Invisible direction marks the apps put in front of lines, and the
// narrow no-break space newer iOS/Android put before AM/PM.
const BOM = new RegExp('^\\uFEFF');
const MARKS = new RegExp('[\\u200E\\u200F\\u202A-\\u202E]', 'g');
const SPACES = new RegExp('[\\u202F\\u00A0]', 'g');
const clean = (text) =>
  String(text).replace(BOM, '').replace(MARKS, '').replace(SPACES, ' ');

const headerOf = (line) => {
  const m = IOS.exec(line) ?? ANDROID.exec(line);
  if (!m) {
    return null;
  }
  const [, a, b, c, hh, mm, ss, ap, rest] = m;
  return {
    a,
    b,
    c,
    hh,
    mm,
    ss: ss ?? '0',
    ap: ap?.toLowerCase() ?? null,
    rest,
  };
};

/** Group the lines into entries: a header plus its continuation lines. */
const readEntries = (text) => {
  const entries = [];
  for (const line of clean(text).split(/\r?\n/)) {
    const header = headerOf(line);
    if (header) {
      entries.push({ ...header, lines: [header.rest] });
    } else if (entries.length > 0) {
      entries.at(-1).lines.push(line);
    }
  }
  return entries;
};

const toLocal = (y, mo, d, e) => {
  let hour = Number(e.hh);
  if (e.ap) {
    hour = (hour % 12) + (e.ap === 'p' ? 12 : 0);
  }
  // The phone wrote its own clock: read it in this machine's time zone.
  const date = new Date(y, mo - 1, d, hour, Number(e.mm), Number(e.ss));
  const valid =
    mo >= 1 && mo <= 12 && date.getMonth() === mo - 1 && date.getDate() === d;
  return valid ? date : null;
};

const yearOf = (value) =>
  value.length <= 2 ? 2000 + Number(value) : Number(value);

const stampWith = (order, e) => {
  if (e.a.length === 4) {
    return toLocal(Number(e.a), Number(e.b), Number(e.c), e);
  }
  const [day, month] = order === 'mdy' ? [e.b, e.a] : [e.a, e.b];
  return toLocal(yearOf(e.c), Number(month), Number(day), e);
};

// How many times the dates go backwards when read in this order.
const backsteps = (entries, order) => {
  let last = -Infinity;
  let count = 0;
  for (const e of entries) {
    const at = stampWith(order, e)?.getTime();
    if (at === undefined) {
      count += 1;
    } else {
      count += at < last ? 1 : 0;
      last = Math.max(last, at);
    }
  }
  return count;
};

/**
 * `ymd`, `dmy` or `mdy` for a whole file. A field above 12 settles it;
 * when every pair is ambiguous, the order whose dates go backwards less
 * often wins (an export is in time order); a tie is day-first.
 */
export const detectDateOrder = (entries) => {
  if (entries.some((e) => e.a.length === 4)) {
    return 'ymd';
  }
  if (entries.some((e) => Number(e.a) > 12)) {
    return 'dmy';
  }
  if (entries.some((e) => Number(e.b) > 12)) {
    return 'mdy';
  }
  return backsteps(entries, 'mdy') < backsteps(entries, 'dmy') ? 'mdy' : 'dmy';
};

const KINDS = [
  ['voice', /^PTT-|\.(opus|ogg|amr)$/i],
  ['sticker', /^STK-|\.webp$/i],
  ['image', /\.(jpe?g|png|gif|heic)$/i],
  ['video', /\.(mp4|mov|3gp|mkv|webm)$/i],
  ['audio', /\.(m4a|mp3|aac|wav)$/i],
  ['contact', /\.vcf$/i],
];

const kindOf = (name) =>
  KINDS.find(([, re]) => re.test(name))?.[0] ?? 'document';

const lookupFile = (files, name) => {
  const base = (f) => String(f).split(/[\\/]/).pop();
  return (
    files.find((f) => base(f) === name) ??
    files.find((f) => base(f).toLowerCase() === name.toLowerCase()) ??
    null
  );
};

/** What a media line says: `{attachment, caption}` or null. */
const mediaOf = (body, files) => {
  const [first, ...more] = body.split('\n');
  const line = first.trim();
  if (OMITTED.test(line)) {
    return {
      attachment: { type: 'media', name: null, file: null, omitted: true },
      caption: more.join('\n').trim(),
    };
  }
  const name = (ATTACHED_IOS.exec(line) ??
    ATTACHED_ANDROID.exec(line))?.[1]?.trim();
  if (!name) {
    return null;
  }
  const file = lookupFile(files, name);
  return {
    attachment: { type: kindOf(name), name, file, omitted: false },
    caption: more.join('\n').trim(),
  };
};

const messageFields = (rest, files) => {
  const body = rest.replace(/\s+$/, '');
  const sender = SENDER.exec(body);
  if (!sender || /["“”]/.test(sender[1])) {
    return { sender: 'system', body: body.trim(), service: 'notice' };
  }
  let text = sender[2];
  const edited = EDITED.test(text);
  text = text.replace(EDITED, '');
  const media = mediaOf(text, files);
  return {
    sender: sender[1].trim(),
    body: media ? media.caption || text.split('\n')[0].trim() : text,
    ...(media ? { attachments: [media.attachment] } : {}),
    ...(edited ? { edited: true } : {}),
    ...(DELETED.test(text.trim()) ? { deleted: true } : {}),
  };
};

const GROUP_HINT = /\b(created group|added you|joined using)\b/i;

const chatInfo = (input, parsed) => {
  const people = new Set(parsed.filter((m) => !m.service).map((m) => m.sender));
  const named = input.chat
    ? String(input.chat)
    : chatNameFromFile(input.fileName);
  const chat =
    chatIdOf(input.chat) ??
    (named
      ? archiveChatId(named)
      : `name:${stableHash([...people].sort().join('\n'))}`);
  const group =
    chat.endsWith('@g.us') ||
    people.size > 2 ||
    parsed.some((m) => m.service && GROUP_HINT.test(m.body));
  return {
    chat,
    chatName: named ?? ([...people].join(', ') || null),
    chatType: group ? 'private_group' : 'personal_chat',
  };
};

/** The lines of an export as unified message links. */
export const parseWhatsAppArchive = (archive) => {
  const input =
    typeof archive === 'string' ||
    archive === null ||
    typeof archive !== 'object'
      ? { text: String(archive ?? '') }
      : { ...archive, text: String(archive.text ?? '') };
  const files = Array.isArray(input.files) ? input.files : [];
  const entries = readEntries(input.text);
  const order = detectDateOrder(entries);
  const parsed = [];
  for (const entry of entries) {
    const at = stampWith(order, entry);
    if (at) {
      parsed.push({
        ...messageFields(entry.lines.join('\n'), files),
        timestamp: at.toISOString(),
      });
    }
  }
  const info = chatInfo(input, parsed);
  const seen = new Map();
  return parsed.map(({ sender, body, timestamp, service, ...extra }) => {
    const slot = `${timestamp}\n${sender}`;
    const index = seen.get(slot) ?? 0;
    seen.set(slot, index + 1);
    return buildMessageLink({
      source: SOURCE,
      externalId: `${info.chat}:${timestamp}:${stableHash(sender)}:${index}`,
      sender,
      senderName: sender,
      chat: info.chat,
      chatName: info.chatName,
      chatType: info.chatType,
      body,
      timestamp,
      service,
      ...extra,
    });
  });
};
