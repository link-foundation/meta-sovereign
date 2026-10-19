// Turns a `msg:telegram:*` link into display parts for chat-message.js.
// Pure: no DOM, no React, no network — unit-tested in js/tests/.
//
// Stripped JPEG: Telegram sends a tiny inline preview (type 'i') as
// 3 header bytes + DCT data. We rebuild a full JPEG by wrapping it in
// a standard JFIF header the same way tweb's getPreviewURLFromBytes does
// (src/helpers/bytes/getPreviewURLFromBytes.ts, MIT reference read, no
// code copied — the algorithm is Telegram's own spec).

// Standard JFIF + Huffman table header, verbatim from Telegram's spec.
const JPEG_HEADER_HEX =
  'ffd8ffe000104a46494600010100000100010000' +
  'ffdb004300281c1e231e19282321232d2b28303c64413c37373c7b585d' +
  '4964918099968f808c8aa0b4e6c3a0aadaad8a8cc8ffcbdaeef5ffffff' +
  '9bc1fffffffaffe6fdfff8ffdb0043012b2d2d3c353c76414176f8a58c' +
  'a5f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8' +
  'f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8ffc000110800' +
  '00000003012200021101031101ffc4001f0000010501010101010100000' +
  '000000000000102030405060708090a0bffc400b5100002010303020403' +
  '050504040000017d01020300041105122131410613516107227114328191' +
  'a1082342b1c11552d1f02433627282090a161718191a25262728292a34' +
  '35363738393a434445464748494a535455565758595a636465666768696' +
  'a737475767778797a838485868788898a92939495969798999aa2a3a4a5' +
  'a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6' +
  'd7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0' +
  '100030101010101010101010000000000000102030405060708090a0bff' +
  'c400b51100020102040403040705040400010277000102031104052131' +
  '061241510761711322328108144291a1b1c109233352f0156272d10a162' +
  '434e125f11718191a262728292a35363738393a434445464748494a5354' +
  '55565758595a636465666768696a737475767778797a828384858687888' +
  '98a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9ba' +
  'c2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2' +
  'f3f4f5f6f7f8f9faffda000c03010002110311003f00';

let _jpegHeader = null;
const jpegHeader = () => {
  if (_jpegHeader) {
    return _jpegHeader;
  }
  const hex = JPEG_HEADER_HEX;
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  _jpegHeader = arr;
  return arr;
};

/**
 * Convert a base64-encoded Telegram stripped JPEG payload to a
 * `data:image/jpeg;base64,...` URL, or null when the input is invalid.
 * Works in both Node (Buffer) and browsers (Uint8Array + atob).
 */
export const strippedJpegDataUrl = (b64) => {
  if (!b64 || typeof b64 !== 'string') {
    return null;
  }
  let raw;
  try {
    // Node: Buffer exists; browsers: use atob.
    if (typeof Buffer !== 'undefined') {
      raw = Buffer.from(b64, 'base64');
    } else {
      const bin = globalThis.atob(b64);
      raw = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        raw[i] = bin.charCodeAt(i);
      }
    }
  } catch {
    return null;
  }
  if (!raw || raw.length < 3 || raw[0] !== 0x01) {
    return null;
  }
  const header = jpegHeader();
  const tail = new Uint8Array([0xff, 0xd9]);
  const body = raw.slice(3);
  const out = new Uint8Array(header.length + body.length + tail.length);
  out.set(header, 0);
  out.set(body, header.length);
  out.set(tail, header.length + body.length);
  // Patch width/height bytes (positions 164 and 166 in the header).
  out[164] = raw[1];
  out[166] = raw[2];
  let b64out;
  if (typeof Buffer !== 'undefined') {
    b64out = Buffer.from(out).toString('base64');
  } else {
    let str = '';
    for (const byte of out) {
      str += String.fromCharCode(byte);
    }
    b64out = globalThis.btoa(str);
  }
  return `data:image/jpeg;base64,${b64out}`;
};

// Extract photo sizes from raw.media.photo, in order of preference.
// Returns [{ type, w, h, size }] or null.
const extractPhotoSizes = (photo) => {
  if (!photo?.sizes) {
    return null;
  }
  return photo.sizes
    .filter(
      (s) =>
        s.className === 'PhotoSize' ||
        s.className === 'PhotoSizeProgressive' ||
        s.className === 'PhotoStrippedSize'
    )
    .map((s) => ({
      type: s.type ?? '',
      w: s.w ?? 0,
      h: s.h ?? 0,
      size: Array.isArray(s.sizes) ? Math.max(...s.sizes) : (s.size ?? 0),
      stripped: s.className === 'PhotoStrippedSize',
      bytes: s.bytes ?? null,
    }));
};

// Best aspect ratio from sizes: first PhotoSize with w+h, else 4:3.
const aspectRatioOf = (sizes) => {
  if (!Array.isArray(sizes)) {
    return 4 / 3;
  }
  const s = sizes.find((x) => x.w > 0 && x.h > 0 && !x.stripped);
  return s ? s.w / s.h : 4 / 3;
};

// Extract the stripped thumbnail bytes (base64) if present.
const strippedBytesOf = (sizes) => {
  if (!Array.isArray(sizes)) {
    return null;
  }
  const s = sizes.find((x) => x.stripped && x.bytes?.bytes);
  return s?.bytes?.bytes ?? null;
};

// Map service className → i18n key.
const SERVICE_KEYS = {
  MessageActionChatAddUser: 'service.join',
  MessageActionChatJoinedByLink: 'service.joinLink',
  MessageActionChatDeleteUser: 'service.leave',
  MessageActionChatEditTitle: 'service.titleChanged',
  MessageActionPinMessage: 'service.pin',
  MessageActionPhoneCall: 'service.call',
  MessageActionGroupCall: 'service.groupCall',
  MessageActionContactSignUp: 'service.signUp',
  MessageActionChannelCreate: 'service.channelCreate',
  MessageActionChatCreate: 'service.chatCreate',
  MessageActionChatMigrateTo: 'service.migratedTo',
  MessageActionChannelMigrateFrom: 'service.migratedFrom',
};

/** Service text i18n key + data for a service link, or null. */
export const serviceInfo = (link) => {
  if (!link?.service) {
    return null;
  }
  const key = SERVICE_KEYS[link.service] ?? 'service.unknown';
  const action = link.raw?.action ?? {};
  return {
    key: `chat.${key}`,
    title: typeof action.title === 'string' ? action.title : null,
    user: link.senderName ?? null,
  };
};

// ---- media parsing helpers -----------------------------------------------

const parsePhotoMedia = (photo) => {
  const sizes = extractPhotoSizes(photo) ?? [];
  return {
    kind: 'photo',
    photo,
    sizes,
    aspectRatio: aspectRatioOf(sizes),
    strippedB64: strippedBytesOf(sizes),
    dcId: photo.dcId ?? null,
  };
};

const parseDocumentMedia = (doc) => {
  const attrs = Array.isArray(doc.attributes) ? doc.attributes : [];
  const filename =
    attrs.find((a) => a.className === 'DocumentAttributeFilename')?.fileName ??
    null;
  const isVoice = attrs.some(
    (a) => a.className === 'DocumentAttributeAudio' && a.voice
  );
  const isVideo = attrs.some((a) => a.className === 'DocumentAttributeVideo');
  const isSticker = attrs.some(
    (a) => a.className === 'DocumentAttributeSticker'
  );
  return {
    kind: 'document',
    document: doc,
    filename,
    isVoice,
    isVideo,
    isSticker,
    mimeType: doc.mimeType ?? null,
  };
};

const parseWebpageMedia = (wp) => ({
  kind: 'webpage',
  url: wp.url ?? '',
  displayUrl: wp.displayUrl ?? wp.url ?? '',
  siteName: wp.siteName ?? null,
  title: wp.title ?? null,
  description: wp.description ?? null,
  photo: wp.photo ?? null,
});

const parseMedia = (raw) => {
  const mc = raw.media?.className;
  if (mc === 'MessageMediaPhoto' && raw.media?.photo) {
    return parsePhotoMedia(raw.media.photo);
  }
  if (mc === 'MessageMediaDocument' && raw.media?.document) {
    return parseDocumentMedia(raw.media.document);
  }
  if (mc === 'MessageMediaWebPage' && raw.media?.webpage) {
    return parseWebpageMedia(raw.media.webpage);
  }
  return null;
};

// Resolve reply message id from the raw TL reply header or the stored replyTo.
const replyMsgIdFrom = (raw, replyToField) => {
  if (typeof raw.replyTo?.replyToMsgId === 'number') {
    return raw.replyTo.replyToMsgId;
  }
  if (replyToField) {
    return Number(String(replyToField).split(':').pop()) || null;
  }
  return null;
};

// Telegram's message ids are per chat; the other networks' are global.
const repliedLinkId = (link, replyMsgId) => {
  if ((link.source ?? 'telegram') !== 'telegram') {
    return `msg:${link.source}:${link.replyTo}`;
  }
  const chat = link.chat ?? String(link.id ?? '').split(':')[2] ?? '';
  return `msg:telegram:${chat}:${replyMsgId}`;
};

const parseReply = (link, raw, msgById) => {
  const replyMsgId =
    (link.source ?? 'telegram') === 'telegram'
      ? replyMsgIdFrom(raw, link.replyTo ?? null)
      : (link.replyTo ?? null);
  if (!replyMsgId) {
    return null;
  }
  const repliedId = repliedLinkId(link, replyMsgId);
  const replied = msgById.get(repliedId);
  const quoteText =
    typeof raw.replyTo?.quoteText === 'string' ? raw.replyTo.quoteText : null;
  return {
    msgId: replyMsgId,
    linkId: repliedId,
    text: replied?.body ?? null,
    senderName: replied?.senderName ?? replied?.sender ?? null,
    quoteText,
  };
};

const parseFwd = (raw, link) => {
  if (!raw.fwdFrom) {
    return link?.forwardedFrom
      ? { fromName: link.forwardedFrom.name ?? null, date: null }
      : null;
  }
  return {
    fromName: raw.fwdFrom.fromName ?? raw.fwdFrom.fromId?.className ?? null,
    date: raw.fwdFrom.date ?? null,
  };
};

const parseReactions = (raw, link) =>
  raw.reactions?.results
    ? raw.reactions.results
        .filter((r) => r?.reaction?.className === 'ReactionEmoji')
        .map((r) => ({ emoticon: r.reaction.emoticon, count: r.count ?? 1 }))
    : (Array.isArray(link?.reactions) ? link.reactions : [])
        .filter((r) => r?.emoji)
        .map((r) => ({ emoticon: r.emoji, count: r.count ?? 1 }));

// A label for an attachment that is not a file (a place, a contact…).
const ATTACHMENT_LABELS = {
  location: (a) => `📍 ${a.title ?? [a.lat, a.lon].filter(Boolean).join(', ')}`,
  contact: (a) => `👤 ${a.title ?? a.name ?? ''}`,
  poll: (a) => `📊 ${a.title ?? ''}`,
};

/**
 * The first of the network-neutral `attachments` (every network but
 * Telegram's own account) as the parts the bubble draws.
 */
export const attachmentMedia = (attachments) => {
  const a = Array.isArray(attachments) ? attachments[0] : null;
  if (!a?.kind) {
    return null;
  }
  if (a.kind === 'link' && a.url) {
    return parseWebpageMedia({
      url: a.url,
      title: a.title ?? null,
      description: a.caption ?? null,
    });
  }
  const label = ATTACHMENT_LABELS[a.kind]?.(a) ?? a.name ?? a.title;
  return {
    kind: 'document',
    document: null,
    filename: label || a.kind,
    isVoice: a.kind === 'voice',
    isVideo: a.kind === 'video' || a.kind === 'gif',
    isSticker: a.kind === 'sticker',
    mimeType: a.mime ?? null,
    url: a.url ?? null,
  };
};

/**
 * Parse a message link into all display parts.
 *
 * @param {object} link — the msg:telegram:* link
 * @param {Map<string,object>} msgById — id → link, for reply lookups
 * @returns display parts object
 */
export const parseMessageParts = (link, msgById = new Map()) => {
  const raw = link?.raw ?? {};
  return {
    text: typeof link?.body === 'string' ? link.body : '',
    entities: Array.isArray(raw.entities) ? raw.entities : [],
    media: parseMedia(raw) ?? attachmentMedia(link?.attachments),
    replyRef: parseReply(link, raw, msgById),
    fwdFrom: parseFwd(raw, link),
    reactions: parseReactions(raw, link),
    edited: Boolean(raw.editDate ?? link.edited),
    album: raw.groupedId ? String(raw.groupedId) : null,
    service: serviceInfo(link),
  };
};
