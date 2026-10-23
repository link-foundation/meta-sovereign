// A group's permissions, slow mode and recent actions (R-Y133): the
// routes of the POSTS table in routes-telegram.js, each validated
// strictly before the account is asked.

import { RIGHT_KEYS, SLOW_MODES } from '../sources/telegram-admin.js';

const GROUP_CHAT = /^-\d{1,20}$/;

// Rights: only the known keys, each a boolean.
const validRightsBody = (rights) =>
  Boolean(rights) &&
  typeof rights === 'object' &&
  !Array.isArray(rights) &&
  Object.keys(rights).length > 0 &&
  Object.entries(rights).every(
    ([k, v]) => RIGHT_KEYS.includes(k) && typeof v === 'boolean'
  );

export const ADMIN_POSTS = {
  'chat-permissions': async (account, body) =>
    GROUP_CHAT.test(String(body.chat ?? '')) &&
    typeof account.chatPermissions === 'function'
      ? [200, await account.chatPermissions({ chat: body.chat })]
      : [400, { error: 'chat required', code: 'bad-request' }],
  'chat-permissions-set': async (account, body) =>
    GROUP_CHAT.test(String(body.chat ?? '')) &&
    validRightsBody(body.rights) &&
    typeof account.setPermissions === 'function'
      ? [
          200,
          await account.setPermissions({
            chat: body.chat,
            rights: body.rights,
          }),
        ]
      : [400, { error: 'chat and rights required', code: 'bad-request' }],
  'slow-mode': async (account, body) =>
    GROUP_CHAT.test(String(body.chat ?? '')) &&
    SLOW_MODES.includes(body.seconds) &&
    typeof account.setSlowMode === 'function'
      ? [
          200,
          await account.setSlowMode({
            chat: body.chat,
            seconds: body.seconds,
          }),
        ]
      : [400, { error: 'chat and seconds required', code: 'bad-request' }],
  'admin-log': async (account, body) =>
    GROUP_CHAT.test(String(body.chat ?? '')) &&
    (body.maxId === undefined || /^\d{1,20}$/.test(String(body.maxId))) &&
    typeof account.adminLog === 'function'
      ? [
          200,
          await account.adminLog({
            chat: body.chat,
            ...(body.maxId === undefined ? {} : { maxId: String(body.maxId) }),
          }),
        ]
      : [400, { error: 'chat required', code: 'bad-request' }],
};
