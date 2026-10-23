/**
 * A Telegram message as one entry of the JSON export (R-Y186). The field
 * names are those of Telegram Desktop's documented machine-readable
 * export (`name`, `type`, `id`, `messages[]` with `id`, `type`, `date`,
 * `date_unixtime`, `from`, `from_id`, `text`, `text_entities`,
 * `reply_to_message_id`, …); the code is our own, working on the plain
 * message the store keeps (`rawMessage`, ./telegram-history.js).
 */

import { localIso } from './telegram-export-paths.js';

const ENTITY_TYPES = Object.freeze({
  MessageEntityBold: 'bold',
  MessageEntityItalic: 'italic',
  MessageEntityUnderline: 'underline',
  MessageEntityStrike: 'strikethrough',
  MessageEntityCode: 'code',
  MessageEntityPre: 'pre',
  MessageEntityTextUrl: 'text_link',
  MessageEntityUrl: 'link',
  MessageEntityMention: 'mention',
  MessageEntityMentionName: 'mention_name',
  MessageEntityHashtag: 'hashtag',
  MessageEntityCashtag: 'cashtag',
  MessageEntityBotCommand: 'bot_command',
  MessageEntityEmail: 'email',
  MessageEntityPhone: 'phone',
  MessageEntitySpoiler: 'spoiler',
  MessageEntityBlockquote: 'blockquote',
  MessageEntityCustomEmoji: 'custom_emoji',
  MessageEntityBankCard: 'bank_card',
});

// What an entity says besides its kind.
const extrasOf = (entity) => {
  switch (entity.type) {
    case 'pre':
      return entity.language ? { language: entity.language } : {};
    case 'text_link':
      return { href: entity.url ?? '' };
    case 'mention_name':
      return { user_id: Number(entity.userId) };
    case 'custom_emoji':
      return { document_id: String(entity.documentId ?? '') };
    default:
      return {};
  }
};

/** The message's entities as `{ type, offset, length, … }`, known kinds only. */
export const entitiesOf = (raw) =>
  (raw?.entities ?? [])
    .filter((e) => ENTITY_TYPES[e?.className] && Number(e.length) > 0)
    .map((e) => {
      const entity = {
        type: ENTITY_TYPES[e.className],
        offset: Number(e.offset),
        length: Number(e.length),
        language: e.language,
        url: e.url,
        userId: e.userId,
        documentId: e.documentId,
      };
      return { ...entity, extras: extrasOf(entity) };
    })
    .sort((a, b) => a.offset - b.offset || b.length - a.length);

/**
 * The text cut where an entity starts or ends: `[{ text, covers }]`,
 * `covers` the entities over that piece (the outermost first).
 */
export const segmentsOf = (text, entities) => {
  const whole = String(text ?? '');
  const clamp = (n) => Math.max(0, Math.min(whole.length, n));
  const cuts = new Set([0, whole.length]);
  for (const e of entities) {
    cuts.add(clamp(e.offset));
    cuts.add(clamp(e.offset + e.length));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const pieces = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const [from, to] = [points[i], points[i + 1]];
    const covers = entities.filter(
      (e) => e.offset <= from && e.offset + e.length >= to
    );
    const last = pieces.at(-1);
    const same =
      last &&
      last.covers.length === covers.length &&
      last.covers.every((e, n) => e === covers[n]);
    if (same) {
      last.text += whole.slice(from, to);
    } else {
      pieces.push({ text: whole.slice(from, to), covers });
    }
  }
  return pieces;
};

/** `{ text, text_entities }` as Desktop writes them. */
export const textFieldsOf = (raw) => {
  const text = String(raw?.message ?? '');
  const entities = entitiesOf(raw);
  const pieces = segmentsOf(text, entities).filter((p) => p.text !== '');
  const parts = pieces.map((p) =>
    p.covers.length > 0
      ? { type: p.covers[0].type, text: p.text, ...p.covers[0].extras }
      : { type: 'plain', text: p.text }
  );
  const plain = parts.every((p) => p.type === 'plain');
  return {
    text: plain ? text : parts.map((p) => (p.type === 'plain' ? p.text : p)),
    text_entities: parts,
  };
};

const unixOf = (value) => {
  if (typeof value === 'string') {
    return Math.floor(Date.parse(value) / 1000) || 0;
  }
  return Number(value) || 0;
};

const peerKey = (peer) => {
  if (peer?.userId !== undefined) {
    return `user${peer.userId}`;
  }
  if (peer?.channelId !== undefined) {
    return `channel${peer.channelId}`;
  }
  return peer?.chatId === undefined ? null : `chat${peer.chatId}`;
};

/**
 * Who wrote it: `{ from, from_id }`. `names` maps `user<id>`,
 * `channel<id>`, `chat<id>` to a name; a message of a personal chat has
 * no sender of its own, so `ctx.self` / `ctx.peer` (keys) stand in.
 */
export const senderOf = (raw, ctx) => {
  const own = !raw?.post && raw?.out ? ctx.self : null;
  const key = peerKey(raw?.fromId) ?? own ?? peerKey(raw?.peerId);
  const id = key ?? ctx.self ?? ctx.peer ?? null;
  return { from: ctx.names.get(id) ?? null, from_id: id };
};

const snake = (name) =>
  String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();

const namesOf = (ids, names) =>
  (ids ?? []).map((id) => names.get(`user${id}`) ?? `user${id}`);

/** What a service message (a join, a new title, a pin, a call) adds. */
export const actionFieldsOf = (action, names, raw) => {
  const kind = String(action?.className ?? '').replace('MessageAction', '');
  switch (kind) {
    case 'ChatCreate':
      return {
        action: 'create_group',
        title: action.title,
        members: namesOf(action.users, names),
      };
    case 'ChannelCreate':
      return { action: 'create_channel', title: action.title };
    case 'ChatEditTitle':
      return { action: 'edit_group_title', title: action.title };
    case 'ChatAddUser':
      return {
        action: 'invite_members',
        members: namesOf(action.users, names),
      };
    case 'ChatDeleteUser':
      return {
        action: 'remove_members',
        members: namesOf([action.userId], names),
      };
    case 'PinMessage':
      return { action: 'pin_message', message_id: raw?.replyTo?.replyToMsgId };
    case 'PhoneCall':
      return {
        action: 'phone_call',
        duration_seconds: action.duration,
        discard_reason: action.reason
          ? snake(
              String(action.reason.className).replace('PhoneCallDiscard', '')
            ).replace(/^reason_/, '')
          : undefined,
      };
    case 'TopicCreate':
      return { action: 'topic_created', title: action.title };
    default:
      return { action: snake(kind || 'unknown') };
  }
};

const compact = (object) =>
  Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined));

/** A service message: `{ id, type: 'service', date, actor, action, … }`. */
export const serviceOf = (raw, ctx) => {
  const at = unixOf(raw.date);
  const who = senderOf(raw, ctx);
  return compact({
    id: Number(raw.id),
    type: 'service',
    date: localIso(at * 1000),
    date_unixtime: String(at),
    actor: who.from,
    actor_id: who.from_id,
    ...actionFieldsOf(raw.action, ctx.names, raw),
  });
};

const forwardedFrom = (raw, names) => {
  const fwd = raw?.fwdFrom;
  if (!fwd) {
    return {};
  }
  const key = peerKey(fwd.fromId);
  return {
    forwarded_from: fwd.fromName ?? (key ? (names.get(key) ?? key) : null),
  };
};

/**
 * One message as Desktop's JSON has it. `media` is what the exporter
 * decided about its file (`photo`, `file`, `media_type`, …) and is put
 * before the text, as Desktop does.
 */
export const messageOf = (raw, ctx, media = {}) => {
  if (raw?.className === 'MessageService') {
    return serviceOf(raw, ctx);
  }
  const at = unixOf(raw.date);
  const edited = raw.editDate ? unixOf(raw.editDate) : 0;
  const who = senderOf(raw, ctx);
  const viaBot = raw.viaBotId ? ctx.names.get(`user${raw.viaBotId}`) : null;
  return compact({
    id: Number(raw.id),
    type: 'message',
    date: localIso(at * 1000),
    date_unixtime: String(at),
    edited: edited ? localIso(edited * 1000) : undefined,
    edited_unixtime: edited ? String(edited) : undefined,
    from: who.from,
    from_id: who.from_id,
    ...forwardedFrom(raw, ctx.names),
    reply_to_message_id: raw.replyTo?.replyToMsgId
      ? Number(raw.replyTo.replyToMsgId)
      : undefined,
    via_bot: viaBot ?? undefined,
    media_group_id: raw.groupedId ? String(raw.groupedId) : undefined,
    ...media,
    ...textFieldsOf(raw),
  });
};
