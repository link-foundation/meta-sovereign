const long = (value) => String(value?.value ?? value ?? '');
const LONG = /^-?\d{1,20}$/;
const ID = /^[1-9]\d{0,19}$/;
export const GREETING_STICKER_CACHE = 'telegram:greeting-stickers:v1';
export const GREETING_STICKER_TTL = 10 * 60_000;
export const greetingAlt = (value) =>
  /\b(?:hi|hello)\b|👋/i.test(String(value));
export const stickerRefreshOptions = (body = {}) => {
  const maxSets = body.maxSets ?? 1000;
  const maxDocuments = body.maxDocuments ?? 10_000;
  return Number.isInteger(maxSets) &&
    maxSets >= 1 &&
    maxSets <= 10_000 &&
    Number.isInteger(maxDocuments) &&
    maxDocuments >= 1 &&
    maxDocuments <= 50_000
    ? { maxSets, maxDocuments }
    : null;
};
export const stickerPageOptions = (body = {}) => {
  const offset = body.offset ?? 0;
  const limit = body.limit ?? 100;
  const greetingsOnly = body.greetingsOnly ?? true;
  return Number.isInteger(offset) &&
    offset >= 0 &&
    offset <= 50_000 &&
    Number.isInteger(limit) &&
    limit >= 1 &&
    limit <= 500 &&
    typeof greetingsOnly === 'boolean'
    ? { offset, limit, greetingsOnly }
    : null;
};
const stickerRecord = (doc, attr, origin) => ({
  id: long(doc.id),
  accessHash: long(doc.accessHash),
  fileReference: Buffer.from(doc.fileReference).toString('base64'),
  emoji: String(attr.alt ?? '').slice(0, 128),
  mimeType: String(doc.mimeType ?? '').slice(0, 80),
  size: Number(doc.size) || 0,
  dcId: Number(doc.dcId) || 0,
  origin,
});
export const cacheSticker = (item, origin) => {
  const doc = item?.document ?? item;
  const attr =
    Array.isArray(doc?.attributes) &&
    doc.attributes.find((a) => a?.className === 'DocumentAttributeSticker');
  const reference = doc?.fileReference;
  if (
    doc?.className !== 'Document' ||
    !ID.test(long(doc.id)) ||
    !LONG.test(long(doc.accessHash)) ||
    !(reference instanceof Uint8Array) ||
    reference.length < 1 ||
    reference.length > 1024 ||
    !attr
  ) {
    return null;
  }
  return normalizeCachedSticker(stickerRecord(doc, attr, origin));
};
const normalizeOrigin = (origin) => {
  if (['recent', 'faved'].includes(origin?.kind)) {
    return { kind: origin.kind };
  }
  if (origin?.kind !== 'set') {
    return null;
  }
  const shortName =
    typeof origin.shortName === 'string' &&
    /^[A-Za-z0-9_]{1,64}$/.test(origin.shortName)
      ? origin.shortName
      : '';
  if (!LONG.test(origin.id) || !LONG.test(origin.accessHash)) {
    return shortName ? { kind: 'set', shortName } : null;
  }
  return {
    kind: 'set',
    id: String(origin.id),
    accessHash: String(origin.accessHash),
    shortName,
  };
};
const metadataValid = (saved) =>
  typeof saved.emoji === 'string' &&
  saved.emoji.length <= 128 &&
  typeof saved.mimeType === 'string' &&
  saved.mimeType.length <= 80 &&
  Number.isSafeInteger(saved.size) &&
  saved.size >= 0 &&
  Number.isInteger(saved.dcId) &&
  saved.dcId >= 0 &&
  saved.dcId <= 2147483647;
export const normalizeCachedSticker = (saved) => {
  if (
    !saved ||
    !ID.test(saved.id) ||
    !LONG.test(saved.accessHash) ||
    typeof saved.fileReference !== 'string' ||
    saved.fileReference.length > 1368 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(saved.fileReference)
  ) {
    return null;
  }
  const reference = Buffer.from(saved.fileReference, 'base64');
  const origin = normalizeOrigin(saved.origin);
  if (
    !reference.length ||
    reference.length > 1024 ||
    !origin ||
    !metadataValid(saved)
  ) {
    return null;
  }
  return {
    id: String(saved.id),
    accessHash: String(saved.accessHash),
    fileReference: reference.toString('base64'),
    emoji: saved.emoji,
    mimeType: saved.mimeType,
    size: saved.size,
    dcId: saved.dcId,
    origin,
    greeting: greetingAlt(saved.emoji),
  };
};
export const restoreSticker = (item) => {
  const saved = normalizeCachedSticker(item);
  if (!saved) {
    return null;
  }
  return {
    className: 'Document',
    id: saved.id,
    accessHash: saved.accessHash,
    fileReference: Buffer.from(saved.fileReference, 'base64'),
    mimeType: saved.mimeType,
    dcId: saved.dcId,
    size: saved.size,
    attributes: [{ className: 'DocumentAttributeSticker', alt: saved.emoji }],
  };
};
export const stickerSummary = (item) => ({
  id: item.id,
  network: 'telegram',
  emoji: item.emoji,
  format: item.mimeType,
  greeting: item.greeting,
  origin: item.origin.kind,
});
export const stickerReadCode = (error) =>
  String(error?.errorMessage ?? '').match(/^[A-Z_0-9]{1,80}$/)?.[0] ??
  'read-failed';
