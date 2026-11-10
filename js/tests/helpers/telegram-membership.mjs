import { createMemoryStore } from '../../src/storage/universal.js';
import { createInvites } from '../../src/sources/telegram-invite.js';
import { createSimilarChannels } from '../../src/sources/telegram-similar-channels.js';
import { createDialogActions } from '../../src/sources/telegram-dialogs.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields, { className });
    }
  };
const methods = (namespace, names) =>
  Object.fromEntries(
    names.map((name) => [name, named(`${namespace}.${name}`)])
  );
export const membershipFixture = async (reply) => {
  const store = createMemoryStore();
  const calls = [];
  const applied = [];
  const client = {
    invoke: async (request) => {
      calls.push(request);
      return reply(request);
    },
    getInputEntity: async (peer) => peer,
  };
  const Api = {
    messages: methods('messages', ['CheckChatInvite', 'ImportChatInvite']),
    channels: methods('channels', ['JoinChannel']),
    account: methods('account', ['UpdateNotifySettings']),
    folders: methods('folders', ['EditPeerFolders']),
    InputNotifyPeer: named('InputNotifyPeer'),
    InputPeerNotifySettings: named('InputPeerNotifySettings'),
    InputFolderPeer: named('InputFolderPeer'),
  };
  const env = {
    store,
    importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
    connection: {
      withPeer: async (_c, chat, use) =>
        use({ className: 'InputPeerChannel', channelId: chat.slice(4) }),
    },
    live: { handle: async (_c, update) => applied.push(update) },
  };
  const context = {
    userClient: async () => client,
    apply: async (_c, updates) => applied.push(updates),
  };
  return {
    store,
    calls,
    applied,
    actions: {
      ...createInvites(env, context),
      ...createSimilarChannels(env, context),
      ...createDialogActions(env, context),
    },
  };
};

export const memberUpdates = (id = 7n) => ({
  className: 'Updates',
  updates: [],
  users: [],
  chats: [{ className: 'Channel', id, title: 'Study circle', megagroup: true }],
});
