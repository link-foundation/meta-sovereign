/**
 * Sticker payloads shared by adapters that can send them (issue #35).
 *
 * Outgoing content may carry `sticker` as a bare id or as an object
 * `{id, url}`: `id` is the network's own identifier (VK `sticker_id`,
 * Telegram `file_id`, WhatsApp media id, Zalo `attachment_id`) and
 * `url` a public file link for networks that accept one (WhatsApp,
 * Telegram). Normalising here keeps every adapter's `post` small.
 */

export const contentSticker = (content) => {
  if (!content || typeof content !== 'object' || !content.sticker) {
    return null;
  }
  const { sticker } = content;
  if (typeof sticker !== 'object') {
    return { id: String(sticker), url: null };
  }
  const id = sticker.id ?? sticker.fileId ?? null;
  const url = sticker.url ?? sticker.link ?? null;
  if (!id && !url) {
    return null;
  }
  return { id: id === null ? null : String(id), url };
};
