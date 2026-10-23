/**
 * Re-importing an archive that an older build imported (R-Z10).
 *
 * Before R-Z10 a Facebook message was `msg:facebook:<ms>` and a LinkedIn
 * one `msg:linkedin:<conversation>-<date>`. A link built from an archive
 * row carries (under a symbol, so it is never stored) the old id it had
 * and what that old link must look like (sender, chat). The importer
 * skips a row whose old link is already in the store, under the old id or
 * under the id migration 0005 moved it to (`alias:<old id>`), so the
 * import does not double the history.
 */

import { fixMojibake } from './text.js';

export const LEGACY = Symbol('legacyArchiveId');

/** Mark `link` as the new form of the old `{ id, sender, chat }`. */
export const withLegacy = (link, legacy) => ({ ...link, [LEGACY]: legacy });

const lastPart = (chat) =>
  String(chat ?? '')
    .split('/')
    .filter(Boolean)
    .at(-1) ?? '';

// An old Facebook chat was the whole `thread_path`; the new one its folder.
const sameChat = (stored, wanted) =>
  stored === wanted || lastPart(stored) === lastPart(wanted);

const sameSender = (stored, wanted) =>
  [stored?.sender, stored?.senderName].some(
    (name) => fixMojibake(name) === wanted
  );

// The link the old id stands for, now or after migration; null if none.
const storedLegacy = async (store, id) => {
  if (typeof store.get !== 'function') {
    return null;
  }
  const alias = await store.get(`alias:${id}`);
  return (alias?.to ? await store.get(alias.to) : null) ?? store.get(id);
};

/**
 * True when `link`'s old-scheme twin is already stored. `claimed` makes
 * one old link account for one row (old ids collided, so a second row
 * with the same old id is a different message and is written).
 */
export const alreadyImported = async (store, link, claimed) => {
  const legacy = link[LEGACY];
  if (!legacy || claimed.has(legacy.id)) {
    return false;
  }
  const there = await storedLegacy(store, legacy.id);
  if (
    there &&
    sameChat(there.chat, legacy.chat) &&
    sameSender(there, legacy.sender)
  ) {
    claimed.add(legacy.id);
    return true;
  }
  return false;
};
