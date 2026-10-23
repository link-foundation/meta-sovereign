/**
 * 0001 — email threads and dates as R-Z5 writes them (R-Z17).
 *
 * Mail read from raw RFC 822 text (IMAP, POP3, `.eml`, `.mbox`) was stored
 * with the chat (conversation) taken from the whole References header,
 * else In-Reply-To, else the subject, and with the `Date:` header as it
 * came. R-Z5 keys a conversation by the FIRST id of References (the root),
 * else In-Reply-To, else the mail's own Message-ID, else the base subject;
 * stores `timestamp` as ISO time; and keeps `messageId`, `references` and
 * `inReplyTo` on the link. Everything needed is in the stored link
 * (`rawHeaders`, `subject`, `timestamp`), so each mail is recomputed
 * without the network and without the original bytes.
 *
 * Not recoverable from what is stored (left as it is, still readable):
 * the decoded subject of a mail whose subject was an encoded word (the
 * stored one is what the old reader decoded), and the `raw-<hash>` id of a
 * mail with no Message-ID. Gmail, Graph and JMAP mail kept their provider
 * thread ids and only get the ISO time.
 *
 * Idempotent: it computes the target shape from the stored fields and
 * writes only what differs.
 */

export const id = '0001-email-threads';
export const from = 0;
export const to = 1;
export const description =
  'Email: conversation key from References/In-Reply-To/Message-ID, dates as ISO time, messageId/references/inReplyTo on the link.';

const ids = (value) => {
  const text = String(value ?? '');
  const bracketed = [...text.matchAll(/<([^<>\s]+)>/g)].map((m) => m[1]);
  return bracketed.length > 0
    ? bracketed
    : text
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter(Boolean);
};

const headerIds = (headers, name) =>
  (headers?.[name] ?? []).flatMap((value) => ids(value));

const SUBJECT_PREFIX =
  /^\s*(?:(?:re|fwd?|aw|wg|sv|vs|r|antw|odp)(?:\[\d+\])?\s*:\s*)+/i;
const baseSubject = (subject) =>
  String(subject ?? '')
    .replace(SUBJECT_PREFIX, '')
    .trim();

const isoTime = (value) => {
  if (typeof value !== 'string' || value === '') {
    return value;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
};

const isEmail = (link) =>
  link?.source === 'email' && String(link.id).startsWith('msg:email:');

// The conversation fields R-Z5 derives from the stored headers.
const threading = (link) => {
  const headers = link.rawHeaders;
  const references = headerIds(headers, 'references');
  const inReplyTo = headerIds(headers, 'in-reply-to')[0] ?? null;
  const own = headerIds(headers, 'message-id')[0] ?? null;
  const key =
    references[0] ||
    inReplyTo ||
    own ||
    baseSubject(link.subject).toLowerCase() ||
    null;
  return {
    references,
    inReplyTo,
    messageId: own,
    key,
    parent: inReplyTo ?? references.at(-1) ?? null,
  };
};

const childrenOf = (link, source, chat, parent) => {
  const kept = (link.children ?? []).filter(
    (c) =>
      !c.startsWith(`chat:${source}:`) && !c.startsWith(`replyto:${source}:`)
  );
  const at = kept.findIndex((c) => c.startsWith(`body:${source}:`));
  const chatChild = `chat:${source}:${chat}`;
  const out =
    at < 0
      ? [...kept, chatChild]
      : [...kept.slice(0, at), chatChild, ...kept.slice(at)];
  return parent ? [...out, `replyto:${source}:${parent}`] : out;
};

/** The upgraded link, or null when it is already in the new shape. */
export const upgradeEmailLink = (link) => {
  const next = { ...link };
  if (typeof link.timestamp === 'string') {
    next.timestamp = isoTime(link.timestamp);
  }
  if (link.raw && typeof link.raw === 'object' && 'date' in link.raw) {
    next.raw = { ...link.raw, date: isoTime(link.raw.date) };
  }
  if (link.protocol === 'rfc822' && link.rawHeaders) {
    const t = threading(link);
    if (t.key) {
      next.chat = t.key;
      const name = baseSubject(link.subject);
      if (name || 'chatName' in link) {
        next.chatName = name || null;
      }
      next.replyTo = t.parent;
      next.children = childrenOf(link, link.source, t.key, t.parent);
    }
    if (t.messageId) {
      next.messageId = t.messageId;
    }
    if (t.references.length > 0) {
      next.references = t.references;
    }
    if (t.inReplyTo) {
      next.inReplyTo = t.inReplyTo;
    }
  }
  return JSON.stringify(next) === JSON.stringify(link) ? null : next;
};

export const up = async (ctx) => {
  await ctx.scan({ prefix: 'msg:email:', where: isEmail }, async (batch) => {
    await ctx.putMany(batch.map(upgradeEmailLink).filter(Boolean));
  });
};
