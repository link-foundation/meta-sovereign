/**
 * X "Download an archive of your data" Direct Messages (R-Z10): the
 * `window.YTD.<name>.partN = [...]` scripts `direct-messages.js` (1:1)
 * and `direct-messages-group.js` (groups), `account.js` (who "me" is),
 * and the files in `direct_messages_media/` / `direct_messages_group_media/`.
 */

import { buildMessageLink } from '../link.js';
import { baseName, extName, shortHash } from './text.js';

/** The JSON inside `window.YTD.name.part0 = [ ... ]` (or plain JSON). */
export const ytdPayload = (text) => {
  const body = String(text)
    .replace(/^\uFEFF/, '')
    .trim();
  return JSON.parse(
    /^[[{]/.test(body) ? body : body.replace(/^[^=[{]*=\s*/, '')
  );
};

// X's reaction keys → emoji.
const REACTION_EMOJI = {
  like: '👍',
  funny: '😂',
  surprised: '😮',
  sad: '😢',
  excited: '🔥',
  agree: '💯',
  disagree: '👎',
  celebrate: '🎉',
};

const reactionsOf = (list) => {
  const rows = new Map();
  for (const r of Array.isArray(list) ? list : []) {
    const emoji = REACTION_EMOJI[r?.reactionKey] ?? r?.reactionKey;
    if (emoji) {
      const row = rows.get(emoji) ?? { emoji, count: 0, by: [] };
      row.count += 1;
      row.by.push(String(r.senderId));
      rows.set(emoji, row);
    }
  }
  return [...rows.values()];
};

const accountOf = (items) => {
  const account = (items[0]?.account ?? items[0]) || {};
  return {
    accountId: account.accountId ? String(account.accountId) : null,
    name: account.accountDisplayName ?? account.username ?? null,
  };
};

const participantsOf = (events) =>
  events
    .flatMap((e) => e.joinConversation?.participantsSnapshot ?? [])
    .map(String);

const conversationOf = (item, group) => {
  const conversation = item.dmConversation ?? item;
  const events = conversation.messages ?? [];
  const rename = events
    .map((e) => e.conversationNameUpdate)
    .filter(Boolean)
    .at(-1);
  const rows = [];
  for (const event of events) {
    const create = event.messageCreate;
    if (create) {
      rows.push({
        id: create.id,
        senderId: create.senderId,
        conversationId: conversation.conversationId,
        text: create.text,
        createdAt: create.createdAt,
        mediaUrls: create.mediaUrls,
        urls: create.urls,
        reactions: create.reactions,
        group,
      });
    }
  }
  return {
    rows,
    name: rename?.name ?? null,
    id: conversation.conversationId,
    participants: [...new Set(participantsOf(events))],
  };
};

/**
 * File text → what `xSource.parseArchive` takes: `{ dms, names,
 * participants }` for the DM files, `{ account }` for account.js and
 * `{ tweets }` for everything else.
 */
export const xToArchive = (name, text) => {
  const items = ytdPayload(text);
  if (/(^|\/)account(-part\d+)?\.js$/i.test(name)) {
    return { account: accountOf(items) };
  }
  if (!/direct-messages/i.test(name)) {
    return { tweets: items };
  }
  const group = /direct-messages-group/i.test(name);
  const dms = [];
  const names = {};
  const participants = {};
  for (const item of items) {
    const c = conversationOf(item, group);
    dms.push(...c.rows);
    if (c.name) {
      names[c.id] = c.name;
    }
    if (c.participants.length) {
      participants[c.id] = c.participants;
    }
  }
  return { dms, names, participants };
};

const KINDS = {
  '.jpg': 'photo',
  '.jpeg': 'photo',
  '.png': 'photo',
  '.webp': 'photo',
  '.gif': 'gif',
  '.mp4': 'video',
  '.mov': 'video',
};

const mediaAttachments = async (ctx, dm) => {
  const out = [];
  for (const url of dm.mediaUrls ?? []) {
    const base = baseName(String(url).split('?')[0]);
    const kind = KINDS[extName(base)] ?? 'file';
    const copy =
      (await ctx?.media?.(`direct_messages_media/${dm.id}-${base}`)) ??
      (await ctx?.media?.(`direct_messages_group_media/${dm.id}-${base}`));
    out.push({
      kind,
      name: base,
      ...(copy
        ? { path: copy.path, sha256: copy.sha256, size: copy.size }
        : {}),
    });
  }
  return out;
};

// t.co links in the text → where they point.
const expandUrls = (text, urls) => {
  let out = text ?? '';
  for (const u of urls ?? []) {
    if (u?.url && u.expanded) {
      out = out.split(u.url).join(u.expanded);
    }
  }
  return out;
};

const hasPair = (id) => /^\d+-\d+$/.test(String(id));

const dmLink = async ({ dm, obj, ctx, self }) => {
  const mine =
    Boolean(self?.accountId) && String(dm.senderId) === self.accountId;
  const chat = String(dm.conversationId);
  const group = dm.group ?? !hasPair(chat);
  const fallback = `${chat}-${dm.createdAt}-${shortHash(dm.text)}`;
  return buildMessageLink({
    source: 'x',
    externalId: String(dm.id ?? fallback),
    sender: String(dm.senderId),
    chat,
    body: expandUrls(dm.text, dm.urls),
    timestamp: dm.createdAt,
    senderName: mine ? self.name : null,
    chatName: obj.names?.[chat] ?? null,
    chatType: group ? 'group' : 'private',
    participants: obj.participants?.[chat],
    outgoing: self?.accountId ? mine : null,
    attachments: await mediaAttachments(ctx, dm),
    reactions: reactionsOf(dm.reactions),
    raw: { id: dm.id, conversationId: chat },
  });
};

/** Parsed DM rows → links. `ctx.state.self` (from account.js) marks my messages. */
export const xDmsToLinks = async (obj, ctx) => {
  const self = ctx?.state?.self ?? null;
  const links = [];
  for (const dm of obj.dms ?? []) {
    links.push(await dmLink({ dm, obj, ctx, self }));
  }
  return links;
};
