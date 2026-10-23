// The saved-GIF id of a chat message (R-Y171; learned, never copied): the
// id of its document when that is an animation (Telegram's
// DocumentAttributeAnimated), else null. The ids the panel's saved list
// carries are the same strings.

/** The document id of a message's GIF as a string; null if it has none. */
export const gifIdOf = (message) => {
  const doc = message?.raw?.media?.document;
  const animated = (doc?.attributes ?? []).some(
    (a) => a?.className === 'DocumentAttributeAnimated'
  );
  if (!animated || doc.id === undefined || doc.id === null) {
    return null;
  }
  const id = String(doc.id?.value ?? doc.id);
  return /^\d{1,20}$/.test(id) ? id : null;
};
