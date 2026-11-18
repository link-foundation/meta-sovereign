/** Bounded provider identities for exact personal-sequence history checks. */
export const personalAttachments = (rows = []) => {
  if (!Array.isArray(rows) || rows.length > 100) {
    throw new Error('Incomplete VK personal attachment evidence');
  }
  return rows.map((row) => {
    const type = row?.type;
    const value = row?.[type];
    const id = value?.sticker_id ?? value?.id;
    if (
      !/^[a-z_]{1,32}$/u.test(type ?? '') ||
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      (type !== 'sticker' &&
        (!Number.isSafeInteger(value?.owner_id) || !value.owner_id))
    ) {
      throw new Error('Incomplete VK personal attachment identity');
    }
    return type === 'sticker'
      ? `sticker${id}`
      : `${type}${value.owner_id}_${id}`;
  });
};
