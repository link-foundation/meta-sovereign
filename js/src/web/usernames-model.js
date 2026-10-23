// The pure parts of several usernames (R-Y170; learned, never copied): the
// active ones come first, in Telegram's order, then the inactive; a move or
// a drop changes the order of the active ones only.

import { moveItem } from './sticker-settings-model.js';

/** The list with the active usernames first (each group in its order). */
export const arranged = (list) => [
  ...list.filter((u) => u.active),
  ...list.filter((u) => !u.active),
];

/** The active usernames' names, in order, as the reorder request sends. */
export const activeOrder = (list) =>
  list.filter((u) => u.active).map((u) => u.username);

/** The list with the active username at `from` moved to place `to`. */
export const movedActive = (list, from, to) => {
  const items = arranged(list);
  const count = activeOrder(items).length;
  if (from < 0 || from >= count) {
    return items;
  }
  return moveItem(items, from, Math.min(to, count - 1));
};

/** The list with one username activated or deactivated (last of its group). */
export const toggledName = (list, username, active) => {
  const one = list.find((u) => u.username === username);
  const rest = list.filter((u) => u !== one);
  return arranged(one ? [...rest, { ...one, active }] : list);
};

/** The link a username has on Telegram. */
export const linkOf = (username) =>
  `https://t.me/${encodeURIComponent(String(username))}`;

/** Whether the editor is worth showing: a username besides the editable. */
export const hasExtra = (list) =>
  Array.isArray(list) && list.some((u) => !u.editable);
