/**
 * 0002 — stable WhatsApp chat ids (R-Z9, R-Z17).
 *
 * Before R-Z9 a WhatsApp chat was named by whatever the reader had: the
 * typed number in any format ("+49 170 123 4567"), the digits of a title,
 * the page's title, or `unknown` for an export. R-Z9 names it by the
 * E.164 number, the group JID, the linked-id JID, or (export of a saved
 * contact, no number in the file) `name:<hash>`.
 *
 * Recomputed only from stored fields (`chat`, `chatName`, `via`):
 *   - a chat that parses as a number or JID gets that id;
 *   - an export chat (no `via: 'browser'`) with a name (`chatName`, or the
 *     chat text itself) gets `name:<hash>`;
 *   - a chat read from a page by its title has no number stored, and an
 *     export chat that was `unknown` without a name has nothing to
 *     recompute from: both stay as they are, still readable, and are
 *     counted in the log line `whatsapp_chat_ids_unresolved`.
 * A page-read message moves to `msg:whatsapp:<new chat>:<key>` (its old id
 * stays resolvable through `alias:`); a key that is a participant JID (the
 * old group `data-id` pattern) is not a message id, so such a message and
 * the counter-numbered export messages keep their ids and only get the new
 * chat. Idempotent: ids already in the new form are fixed points.
 */

import { chatIdOf, archiveChatId } from '../../sources/whatsapp-ids.js';

export const id = '0002-whatsapp-chat-ids';
export const from = 1;
export const to = 2;
export const description =
  'WhatsApp: chats named by E.164 number / group JID / name hash instead of typed number or title; messages and chat references follow.';

const MSG = 'msg:whatsapp:';
const CHAT = 'chat:whatsapp:';
const PARTICIPANT = /^\d+(?:-\d+)?@(?:c\.us|s\.whatsapp\.net|lid|g\.us)$/;

const isWhatsApp = (link) =>
  link?.source === 'whatsapp' && String(link.id).startsWith(MSG);

/** The stable id for a stored chat, or null when it cannot be computed. */
export const newChatId = (chat, { via, chatName } = {}) => {
  const text = String(chat ?? '').trim();
  if (!text || text.startsWith('name:')) {
    return null;
  }
  const known = chatIdOf(text);
  if (known) {
    return known;
  }
  if (via === 'browser') {
    return null;
  }
  if (text === 'unknown') {
    return chatName ? archiveChatId(chatName) : null;
  }
  return archiveChatId(chatName || text);
};

const keyOf = (link) =>
  link.via === 'browser' && link.id.startsWith(`${MSG}${link.chat}:`)
    ? link.id.slice(`${MSG}${link.chat}:`.length)
    : null;

const withChat = (link, next) => ({
  ...link,
  chat: next,
  ...(Array.isArray(link.tokens)
    ? { tokens: link.tokens.map((t) => (t === link.chat ? next : t)) }
    : {}),
  ...(Array.isArray(link.children)
    ? {
        children: link.children.map((c) =>
          c === `${CHAT}${link.chat}` ? `${CHAT}${next}` : c
        ),
      }
    : {}),
});

export const up = async (ctx) => {
  const table = new Map(); // old chat -> new chat id (never `unknown`)
  const pairs = [];
  const unresolved = { chats: new Set(), messages: 0 };
  const kept = { participantKeys: 0 };
  await ctx.scan({ prefix: MSG, where: isWhatsApp }, async (batch) => {
    for (const link of batch) {
      const next = newChatId(link.chat, link);
      if (!next) {
        if (link.chat) {
          unresolved.chats.add(`${link.via}|${link.chat}`);
          unresolved.messages += 1;
        }
        continue;
      }
      if (next === link.chat) {
        continue;
      }
      // `unknown` stands for many chats: it is resolved message by message.
      if (link.chat !== 'unknown') {
        table.set(link.chat, next);
      }
      const key = keyOf(link);
      if (key === null) {
        continue;
      }
      if (PARTICIPANT.test(key)) {
        kept.participantKeys += 1;
      } else {
        pairs.push([link.id, `${MSG}${next}:${key}`]);
      }
    }
  });
  const byChat = table;
  const chatPairs = [];
  await ctx.scan({ prefix: CHAT }, async (batch) => {
    for (const link of batch) {
      const next = byChat.get(link.id.slice(CHAT.length));
      if (next && `${CHAT}${next}` !== link.id) {
        chatPairs.push([link.id, `${CHAT}${next}`]);
      }
    }
  });
  const refMap = (text) => {
    const next =
      typeof text === 'string' && text.startsWith(CHAT)
        ? byChat.get(text.slice(CHAT.length))
        : undefined;
    return next ? `${CHAT}${next}` : undefined;
  };
  const moved = await ctx.rekeyMany([...pairs, ...chatPairs], { refMap });
  // The `chat` field of every WhatsApp message (moved or not), only for
  // links of this source so other networks' ids are never touched.
  await ctx.scan({ prefix: MSG, where: isWhatsApp }, async (batch) => {
    await ctx.putMany(
      batch
        .map((link) => {
          const next = newChatId(link.chat, link);
          return next && next !== link.chat ? withChat(link, next) : null;
        })
        .filter(Boolean)
    );
  });
  ctx.log('whatsapp_chat_ids_unresolved', {
    chats: unresolved.chats.size,
    messages: unresolved.messages,
    participantKeys: kept.participantKeys,
    moved,
  });
};
