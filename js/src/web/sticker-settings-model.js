// The pure parts of Settings → Stickers and emoji (R-Y169; learned, never
// copied): where a set goes when moved up, down or dropped on another.

/** The list with the item at `from` moved to `to` (clamped); else as it was. */
export const moveItem = (list, from, to) => {
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (
    !Number.isInteger(from) ||
    from < 0 ||
    from >= list.length ||
    target === from
  ) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
};

/** The set ids of a list, in order, as the reorder request sends them. */
export const orderIds = (sets) => sets.map((set) => String(set.id));

/** The set count as words: "12 stickers" or "40 emoji". */
export const countKey = (set) =>
  set.emoji ? 'chat.stickerSettings.emojiCount' : 'chat.stickerSettings.count';
