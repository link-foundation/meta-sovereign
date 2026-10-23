// An administrator's rights, as Telegram Desktop's "Admin rights" dialog
// offers them for each kind of chat (R-Y204; learned, never copied). Pure:
// the server shapes and checks with it, the page draws the checkboxes
// from it. Names are ChatAdminRights fields of layer 225.

export const RANK_MAX = 16;

/** Each kind of chat's rights, in the order the dialog lists them. */
export const ADMIN_RIGHTS = Object.freeze({
  channel: [
    'changeInfo',
    'postMessages',
    'editMessages',
    'deleteMessages',
    'inviteUsers',
    'postStories',
    'editStories',
    'deleteStories',
    'manageCall',
    'addAdmins',
  ],
  supergroup: [
    'changeInfo',
    'deleteMessages',
    'banUsers',
    'inviteUsers',
    'pinMessages',
    'manageTopics',
    'postStories',
    'editStories',
    'deleteStories',
    'manageCall',
    'addAdmins',
    'anonymous',
  ],
});

export const ALL_ADMIN_RIGHTS = Object.freeze(
  [...new Set([...ADMIN_RIGHTS.channel, ...ADMIN_RIGHTS.supergroup])].sort()
);

/** The kind of chat an id and its info make: channel, supergroup, group. */
export const kindOfChat = (chat, broadcast = false) => {
  if (!String(chat).startsWith('-100')) {
    return 'group';
  }
  return broadcast ? 'channel' : 'supergroup';
};

/** The rights the dialog lists for a kind (a basic group has none). */
export const rightsFor = (kind) => ADMIN_RIGHTS[kind] ?? [];

/** Rights as booleans for the keys of a kind, from a ChatAdminRights. */
export const shapeRights = (rights = {}, kind = 'supergroup') =>
  Object.fromEntries(
    rightsFor(kind).map((key) => [key, Boolean(rights?.[key])])
  );

/**
 * What of `wanted` the user may grant: only the rights the user has
 * (the creator has all), and only those of the kind of chat.
 */
export const grantable = (wanted, mine, kind, creator = false) =>
  Object.fromEntries(
    rightsFor(kind).map((key) => [
      key,
      Boolean(wanted?.[key]) && (creator || Boolean(mine?.[key])),
    ])
  );

/** Whether a body's rights are only known keys with boolean values. */
export const validRights = (rights) =>
  Boolean(rights) &&
  typeof rights === 'object' &&
  !Array.isArray(rights) &&
  Object.entries(rights).every(
    ([key, value]) =>
      ALL_ADMIN_RIGHTS.includes(key) && typeof value === 'boolean'
  );

/** A custom title: at most 16 characters, no line breaks. */
export const validRank = (rank) =>
  typeof rank === 'string' &&
  Array.from(rank).length <= RANK_MAX &&
  !/[\r\n]/.test(rank);

/** Whether any right is on. */
export const anyRight = (rights = {}) => Object.values(rights).some(Boolean);
