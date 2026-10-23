/**
 * Facebook / Messenger and Instagram "Download your information" threads
 * (R-Z10): `messages/inbox/<thread>/message_N.json` (and `.html`) turned
 * into message links.
 *
 * Ids are `<thread folder>:<timestamp ms>:<sender digest>:<n>` where n
 * counts messages of the same sender in the same millisecond, so two
 * messages never collide and importing the same archive again lands on
 * the same ids (no duplicates). The thread id is the folder name.
 * Learned from Meta's documented export layout, never from real data.
 */

import { buildMessageLink } from '../link.js';
import { withLegacy } from './legacy.js';
import {
  fixDeep,
  baseName,
  extName,
  fixMojibake,
  findAll,
  hasClass,
  isoOf,
  parseHtml,
  shortHash,
  textOf,
} from './text.js';

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
};

// JSON key → attachment kind (a list of items, except `sticker`).
const ATTACHMENT_KEYS = [
  ['photos', 'photo'],
  ['videos', 'video'],
  ['audio_files', 'audio'],
  ['files', 'file'],
  ['gifs', 'gif'],
  ['sticker', 'sticker'],
];

const attachmentOf = async (ctx, network, kind, item) => {
  const uri = typeof item === 'string' ? item : item?.uri;
  if (!uri) {
    return null;
  }
  const name = baseName(uri);
  const mime = MIME[extName(name)];
  const copy = await ctx.media(uri, network);
  return {
    kind,
    name,
    ...(mime ? { mime } : {}),
    ...(copy ? { path: copy.path, sha256: copy.sha256, size: copy.size } : {}),
  };
};

const attachmentsOf = async (ctx, network, message) => {
  const out = [];
  for (const [key, kind] of ATTACHMENT_KEYS) {
    const value = message[key];
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      const att = await attachmentOf(ctx, network, kind, item);
      if (att) {
        out.push(att);
      }
    }
  }
  if (message.share?.link) {
    out.push({
      kind: 'link',
      url: message.share.link,
      caption: message.share.share_text ?? null,
    });
  }
  return out;
};

// [{reaction, actor}] → [{emoji, count, by}] (one row per emoji).
const reactionsOf = (list) => {
  const byEmoji = new Map();
  for (const r of Array.isArray(list) ? list : []) {
    if (r?.reaction) {
      const row = byEmoji.get(r.reaction) ?? {
        emoji: r.reaction,
        count: 0,
        by: [],
      };
      row.count += 1;
      if (r.actor) {
        row.by.push(r.actor);
      }
      byEmoji.set(r.reaction, row);
    }
  }
  return [...byEmoji.values()];
};

/** The thread id: the folder holding the message files. */
export const threadIdOf = (entryName, obj) => {
  const parts = String(entryName ?? '')
    .split(/[\\/]/)
    .filter(Boolean);
  const folder = parts.length >= 2 ? parts.at(-2) : null;
  const fromPath = String(obj?.thread_path ?? '')
    .split('/')
    .filter(Boolean)
    .at(-1);
  return folder || fromPath || obj?.title || 'unknown';
};

const chatTypeOf = (participants) => {
  if (participants.length === 0) {
    return null;
  }
  return participants.length > 2 ? 'group' : 'private';
};

const linkOf = async ({ network, ctx, thread, header, message }) => {
  const sender = message.sender_name ?? 'unknown';
  const ts = message.timestamp_ms ?? message.timestamp ?? 'nots';
  const n = ctx.ordinal(`${thread}|${ts}|${sender}`);
  const link = buildMessageLink({
    source: network,
    externalId: `${thread}:${ts}:${shortHash(sender)}:${n}`,
    sender,
    chat: thread,
    body: typeof message.content === 'string' ? message.content : '',
    timestamp: isoOf(message.timestamp_ms ?? message.timestamp),
    senderName: sender,
    chatName: header.title,
    chatType: chatTypeOf(header.participants),
    participants: header.participants,
    attachments: await attachmentsOf(ctx, network, message),
    reactions: reactionsOf(message.reactions),
    deleted: message.is_unsent === true ? true : null,
  });
  // What an older build called it: `<ms>` or `<sender>-<seconds>`.
  const old =
    message.timestamp_ms ?? `${message.sender_name}-${message.timestamp}`;
  return withLegacy(link, { id: `msg:facebook:${old}`, sender, chat: thread });
};

const headerOf = (obj) => ({
  title: obj.title ?? null,
  participants: (obj.participants ?? [])
    .map((p) => (typeof p === 'string' ? p : p?.name))
    .filter(Boolean),
});

/** One `message_N.json` (object or text) → links. */
export const metaJsonToLinks = async ({ network, archive, ctx, entryName }) => {
  const obj = fixDeep(
    typeof archive === 'string' ? JSON.parse(archive) : archive
  );
  const thread = threadIdOf(entryName, obj);
  const header = headerOf(obj);
  const links = [];
  for (const message of obj.messages ?? []) {
    links.push(await linkOf({ network, ctx, thread, header, message }));
  }
  return links;
};

// ---- HTML export ---------------------------------------------------------

const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
const DATE =
  /([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i;

// "Jan 01, 2024 10:00:00 am" (English exports; the export does not say
// its zone, so it is read in this machine's time zone). Other languages fall through to Date.parse.
export const htmlDateToMs = (text) => {
  const m = DATE.exec(text ?? '');
  const month = m ? MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) : -1;
  if (!m || month < 0) {
    const parsed = Date.parse(text ?? '');
    return Number.isNaN(parsed) ? null : parsed;
  }
  let hour = Number(m[4]) % (m[7] ? 12 : 24);
  if (m[7]?.toLowerCase() === 'pm') {
    hour += 12;
  }
  return new Date(
    Number(m[3]),
    month,
    Number(m[2]),
    hour,
    Number(m[5]),
    Number(m[6] ?? 0)
  ).getTime();
};

const MESSAGE = ['_a6-g', '_3-95'];
const SENDER = ['_a6-h', '_2lek'];
const BODY = ['_a6-p', '_2let'];
const WHEN = ['_a6-o', '_2lem'];
const REACTIONS = ['_a6-q', '_tqp'];

const REACTION = /^(\P{L}+?)\s*(\p{L}.*)$/su;

const firstOf = (node, names) =>
  findAll(node, (n) => hasClass(n, names))[0] ?? null;

const htmlAttachments = async (ctx, network, body) => {
  const out = [];
  const media = findAll(body, (n) =>
    ['img', 'video', 'audio', 'source', 'a'].includes(n.tag)
  );
  const kinds = {
    img: 'photo',
    video: 'video',
    audio: 'audio',
    source: 'video',
    a: 'file',
  };
  for (const node of media) {
    const uri = node.attrs.src ?? node.attrs.href;
    if (uri && !/^[a-z]+:/i.test(uri)) {
      const att = await attachmentOf(ctx, network, kinds[node.tag], uri);
      if (att) {
        out.push(att);
      }
    }
  }
  return out;
};

const htmlMessage = async (ctx, network, node) => {
  const body = firstOf(node, BODY);
  const reactions = firstOf(body ?? node, REACTIONS);
  const likes = findAll(reactions, (n) => n.tag === 'li').map((li) => {
    const m = REACTION.exec(textOf(li).trim());
    return m ? { reaction: m[1].trim(), actor: m[2].trim() } : null;
  });
  const content = body
    ? textOf(body, (n) => hasClass(n, REACTIONS))
        .replace(/[ \t]*\n[ \t]*/g, '\n')
        .trim()
    : '';
  return {
    sender_name: textOf(firstOf(node, SENDER) ?? '').trim(),
    timestamp_ms: htmlDateToMs(textOf(firstOf(node, WHEN) ?? '').trim()),
    content,
    reactions: likes.filter(Boolean),
    _attachments: body ? await htmlAttachments(ctx, network, body) : [],
  };
};

/** One `message_N.html` → links (English dates; see htmlDateToMs). */
export const metaHtmlToLinks = async ({ network, html, ctx, entryName }) => {
  const tree = parseHtml(html);
  const title = textOf(findAll(tree, (n) => n.tag === 'title')[0] ?? '').trim();
  const thread = threadIdOf(entryName, { title });
  const header = { title: fixMojibake(title) || null, participants: [] };
  const links = [];
  for (const node of findAll(tree, (n) => hasClass(n, MESSAGE))) {
    const message = await htmlMessage(ctx, network, node);
    const link = await linkOf({ network, ctx, thread, header, message });
    const attachments = message._attachments;
    links.push(attachments.length ? { ...link, attachments } : link);
  }
  return links;
};
