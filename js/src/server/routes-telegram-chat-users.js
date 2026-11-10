// Account-owned, one-use previews bind the exact people and privacy options.
import {
  scanOptions,
  contactOptions,
} from '../sources/telegram-chat-users-shape.js';
import { exportTarget } from '../sources/telegram-export-target.js';

const route =
  (method, valid) =>
  async (account, body = {}) => {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !valid(body)
    ) {
      return [400, { ok: false, code: 'bad-request' }];
    }
    if (typeof account[method] !== 'function') {
      return [501, { ok: false, supported: false, code: 'not-supported' }];
    }
    return [200, await account[method](body)];
  };
export const CHAT_USERS_POSTS = {
  'chat-users-start': route('chatUsersStart', (body) =>
    Boolean(exportTarget(body.chat) && scanOptions(body))
  ),
  'chat-users-status': route(
    'chatUsersStatus',
    (body) =>
      (body.offset === undefined ||
        (Number.isInteger(body.offset) && body.offset >= 0)) &&
      (body.limit === undefined ||
        (Number.isInteger(body.limit) && body.limit >= 1 && body.limit <= 500))
  ),
  'chat-users-cancel': route('chatUsersCancel', () => true),
  'chat-users-contacts-preview': route(
    'chatUsersContactsPreview',
    (body) => typeof body.jobId === 'string' && Boolean(contactOptions(body))
  ),
  'chat-users-contacts-apply': route(
    'chatUsersContactsApply',
    (body) => body.confirm === true && typeof body.planId === 'string'
  ),
};
