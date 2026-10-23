// Fakes for "Export Telegram data" and Change phone number (R-Y212): a
// GramJS-like client that serves a takeout session, a chat list, contacts
// and each chat's history, and records every request it gets (the ones
// wrapped in invokeWithTakeout apart from the rest). Nothing reaches a
// network.

import { promises as fs } from 'node:fs';
import { named } from './telegram-route.js';
import { Api as ExportApi, helpers, localDate } from './export-fakes.mjs';

export { helpers };

export const Api = {
  ...ExportApi,
  InvokeWithTakeout: named('InvokeWithTakeout'),
  InputUserSelf: named('InputUserSelf'),
  InputPeerEmpty: named('InputPeerEmpty'),
  CodeSettings: named('CodeSettings'),
  account: {
    InitTakeoutSession: named('account.InitTakeoutSession'),
    FinishTakeoutSession: named('account.FinishTakeoutSession'),
    SendChangePhoneCode: named('account.SendChangePhoneCode'),
    ChangePhone: named('account.ChangePhone'),
  },
  users: { GetFullUser: named('users.GetFullUser') },
  contacts: { GetContacts: named('contacts.GetContacts') },
  messages: {
    GetHistory: named('messages.GetHistory'),
    GetDialogs: named('messages.GetDialogs'),
  },
};

const user = (id, extra = {}) => ({
  className: 'User',
  id: String(id),
  firstName: `User${id}`,
  ...extra,
});

export const USERS = [
  user(1, { self: true, firstName: 'Me', phone: '15550001' }),
  user(7, { firstName: 'Alice', lastName: 'Liddell', phone: '15550007' }),
  user(8, { firstName: 'Helper', bot: true, username: 'helper_bot' }),
];
export const CHATS = [
  { className: 'Chat', id: '5', title: 'Family' },
  { className: 'Channel', id: '9', title: 'News', username: 'news' },
  { className: 'Channel', id: '10', title: 'Secret club', megagroup: true },
  { className: 'Channel', id: '11', title: 'Private news' },
];

const dialog = (peer, id) => ({ peer, topMessage: id });
export const DIALOGS = [
  dialog({ className: 'PeerUser', userId: '7' }, 1),
  dialog({ className: 'PeerUser', userId: '8' }, 2),
  dialog({ className: 'PeerChat', chatId: '5' }, 3),
  dialog({ className: 'PeerChannel', channelId: '9' }, 4),
  dialog({ className: 'PeerChannel', channelId: '10' }, 5),
  dialog({ className: 'PeerChannel', channelId: '11' }, 6),
];

/** A text message of a chat, on a January day. */
export const text = (id, day, body) => ({
  className: 'Message',
  id,
  date: localDate(day),
  message: body,
  fromId: { className: 'PeerUser', userId: '7' },
  peerId: { className: 'PeerUser', userId: '7' },
});

export const HISTORY = {
  7: [text(1, 1, 'hi Alice'), text(2, 2, 'second')],
  8: [text(1, 1, 'bot hello')],
  '-5': [text(1, 3, 'family dinner')],
  '-1009': [text(1, 4, 'news post')],
  '-10010': [text(1, 5, 'secret talk')],
  '-10011': [text(1, 6, 'private post')],
};

const pageOf = (all, request) => {
  const sorted = [...all].sort((a, b) => a.id - b.id);
  const list = request.offsetId
    ? sorted.filter((m) => m.id >= request.offsetId)
    : sorted.filter((m) => m.date >= request.offsetDate);
  return {
    className: 'messages.MessagesSlice',
    messages: list.slice(0, request.limit).reverse(),
    users: USERS,
    chats: CHATS,
    count: sorted.length,
  };
};

/**
 * `{ client, log }`: `log.init` the takeout requests, `log.wrapped` the
 * inner requests that came inside invokeWithTakeout, `log.bare` those that
 * did not, `log.finished` the finish requests. `hooks.initError` makes
 * account.initTakeoutSession fail; `hooks.onHistory` runs before a page;
 * `hooks.phone` answers the phone-change requests.
 */
export const takeoutFake = (hooks = {}) => {
  const log = { init: [], wrapped: [], bare: [], finished: [], phone: [] };
  const answer = async (request, takeoutId) => {
    const name = request.className;
    if (name === 'account.FinishTakeoutSession') {
      log.finished.push({ takeoutId, success: request.success });
      return true;
    }
    log.wrapped.push({ name, takeoutId });
    if (name === 'users.GetFullUser') {
      return {
        fullUser: { about: 'my bio' },
        users: [USERS[0]],
      };
    }
    if (name === 'contacts.GetContacts') {
      return {
        className: 'contacts.Contacts',
        contacts: [{ userId: '7' }],
        users: USERS,
      };
    }
    if (name === 'messages.GetDialogs') {
      const first = request.folderId === undefined;
      return {
        className: 'messages.Dialogs',
        dialogs: first ? DIALOGS : [],
        messages: [],
        users: USERS,
        chats: CHATS,
      };
    }
    if (name === 'messages.GetHistory') {
      await hooks.onHistory?.(request, log);
      return pageOf(HISTORY[request.peer.chat] ?? [], request);
    }
    throw new Error(`unexpected request ${name}`);
  };
  const client = {
    getInputEntity: async (id) => ({ id }),
    invoke: async (request) => {
      const name = request.className;
      if (name === 'account.InitTakeoutSession') {
        log.init.push(request);
        if (hooks.initError) {
          throw hooks.initError;
        }
        return { id: '555' };
      }
      if (name === 'account.SendChangePhoneCode') {
        log.phone.push(request);
        if (hooks.phoneError) {
          throw hooks.phoneError;
        }
        return { phoneCodeHash: 'hash1', type: { length: 5 }, timeout: 60 };
      }
      if (name === 'account.ChangePhone') {
        log.phone.push(request);
        if (hooks.changeError) {
          throw hooks.changeError;
        }
        return { phone: request.phoneNumber.replace(/^\+/, '') };
      }
      if (name === 'InvokeWithTakeout') {
        return answer(request.query, request.takeoutId);
      }
      log.bare.push(name);
      throw new Error(`request outside the takeout: ${name}`);
    },
    downloadFile: async (_location, options) => {
      await fs.writeFile(options.outputFile, Buffer.alloc(8, 1));
    },
  };
  return { client, log };
};

export const rpcError = (message, extra = {}) =>
  Object.assign(new Error(message), { errorMessage: message, ...extra });
