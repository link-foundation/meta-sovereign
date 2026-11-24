import { createMemoryStore } from '../../src/storage/universal.js';
import { createFollowTelegram } from '../../src/sources/telegram-follow.js';

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
export const followUpdates = (entity, updates = []) => ({
  className: 'Updates',
  updates,
  chats: [entity],
  users: [],
});
export const followRpcError = (errorMessage, code = 400) =>
  Object.assign(new Error('private diagnostic must not leak'), {
    errorMessage,
    code,
  });
const fakeApi = () => ({
  messages: methods('messages', [
    'CheckChatInvite',
    'ImportChatInvite',
    'GetPeerDialogs',
    'GetDialogs',
    'DeleteChatUser',
    'GetChats',
  ]),
  channels: methods('channels', [
    'GetParticipant',
    'JoinChannel',
    'LeaveChannel',
    'GetChannels',
  ]),
  users: methods('users', ['GetUsers']),
  contacts: methods('contacts', ['ResolveUsername']),
  account: methods('account', ['UpdateNotifySettings']),
  folders: methods('folders', ['EditPeerFolders']),
  ...Object.fromEntries(
    [
      'InputPeerEmpty',
      'InputPeerSelf',
      'InputUserSelf',
      'InputDialogPeer',
      'InputNotifyPeer',
      'InputPeerNotifySettings',
      'InputFolderPeer',
      'InputPeerChat',
      'InputPeerChannel',
      'InputPeerUser',
      'InputChannel',
      'InputUser',
    ].map((name) => [name, named(name)])
  ),
});
const fixtureClient = (state, calls, writes) => {
  const peerOf = (entity) =>
    entity.className === 'Channel'
      ? { className: 'InputPeerChannel', channelId: entity.id, accessHash: 10n }
      : { className: 'InputPeerChat', chatId: entity.id };
  const peer = () =>
    state.entity.className === 'Channel'
      ? { className: 'PeerChannel', channelId: state.entity.id }
      : { className: 'PeerChat', chatId: state.entity.id };
  const dialog = () => ({
    className: 'Dialog',
    peer: peer(),
    topMessage: 10,
    notifySettings: { muteUntil: state.muted ? 2147483647 : 0 },
    folderId: state.archived ? 1 : 0,
  });
  const read = async (request, name) => {
    if (state.read && name !== 'GetUsers') {
      const answer = await state.read(request);
      if (answer !== undefined) {
        return answer;
      }
    }
    if (name === 'GetUsers') {
      if (request.id[0].className === 'InputUser') {
        return [
          { className: 'User', id: request.id[0].userId, accessHash: 10n },
        ];
      }
      const me = await client.getMe();
      return [{ className: 'User', ...me }];
    }
    if (['ResolveUsername', 'GetChats', 'GetChannels'].includes(name)) {
      const entity = await client.getEntity(
        name === 'ResolveUsername' ? `@${request.username}` : state.entity.id
      );
      return { chats: [entity], peer: peer() };
    }
    if (name === 'GetParticipant') {
      if (!state.member) {
        throw followRpcError('USER_NOT_PARTICIPANT');
      }
      return {
        participant: {
          className: 'ChannelParticipantSelf',
          userId: state.owner,
        },
      };
    }
    if (name === 'GetPeerDialogs') {
      return { dialogs: [dialog()] };
    }
    if (name === 'CheckChatInvite') {
      return state.member
        ? { className: 'ChatInviteAlready', chat: state.entity }
        : state.peek
          ? {
              className: 'ChatInvitePeek',
              chat: state.entity,
              expires: 2000000000,
            }
          : {
              className: 'ChatInvite',
              title: state.entity.title,
              channel: state.entity.className === 'Channel',
              megagroup: true,
            };
    }
    return {
      className: 'messages.Dialogs',
      chats: [state.entity],
      users: [],
      dialogs: [dialog()],
      messages: [{ id: 10, peerId: peer(), date: 123 }],
    };
  };
  const client = {
    getMe: async () => {
      await state.beforeMe?.();
      return { id: state.owner };
    },
    getEntity: async () => {
      await state.beforeEntity?.();
      return { ...state.entity, left: !state.member };
    },
    getInputEntity: async (entity) => {
      if (typeof entity === 'bigint') {
        const id = String(entity);
        return id.startsWith('-100')
          ? {
              className: 'InputPeerChannel',
              channelId: id.slice(4),
              accessHash: 10n,
            }
          : id.startsWith('-')
            ? { className: 'InputPeerChat', chatId: id.slice(1) }
            : { className: 'InputPeerUser', userId: id, accessHash: 10n };
      }
      return peerOf(entity);
    },
    invoke: async (request) => {
      calls.push(request);
      const name = request.className.split('.').pop();
      if (
        [
          'GetParticipant',
          'GetPeerDialogs',
          'CheckChatInvite',
          'GetDialogs',
          'GetUsers',
          'ResolveUsername',
          'GetChats',
          'GetChannels',
        ].includes(name)
      ) {
        return read(request, name);
      }
      writes.push(request);
      if (state.reply) {
        return state.reply(request);
      }
      if (['JoinChannel', 'ImportChatInvite'].includes(name)) {
        state.member = true;
        return {
          className: 'messages.ChatInviteJoinResultOk',
          updates: followUpdates(state.entity),
        };
      }
      if (['LeaveChannel', 'DeleteChatUser'].includes(name)) {
        state.member = false;
        return followUpdates({ ...state.entity, left: true });
      }
      if (name === 'UpdateNotifySettings') {
        state.muted = request.settings.muteUntil > 0;
        return true;
      }
      if (name === 'EditPeerFolders') {
        state.archived = request.folderPeers[0].folderId === 1;
        return followUpdates(state.entity);
      }
      throw new Error(`unexpected ${name}`);
    },
  };
  return client;
};
export const followTelegramFixture = ({
  store = createMemoryStore(),
  queue,
} = {}) => {
  const state = {
    owner: '1',
    member: true,
    muted: false,
    archived: false,
    now: Date.now(),
    entity: {
      className: 'Channel',
      id: 7n,
      accessHash: 10n,
      title: 'Study circle',
      username: 'study_group',
      megagroup: true,
    },
    peek: false,
    reply: null,
    read: null,
    beforeMe: null,
    beforeEntity: null,
  };
  const calls = [];
  const writes = [];
  const applied = [];
  const Api = fakeApi();
  const client = fixtureClient(state, calls, writes);
  const context = {
    userClient: async () => client,
    apply: async (_client, answer) => applied.push(answer),
  };
  const env = {
    store,
    queue,
    importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
  };
  const reopen = () =>
    createFollowTelegram(env, context, { now: () => state.now });
  const actions = reopen();
  const account = {
    ...actions,
    status: async () => ({
      connected: true,
      kind: 'user',
      account: { username: 'owner' },
    }),
    callsList: async () => ({ ok: true, calls: [], next: null }),
    stop: async () => env.followTelegramStop(),
  };
  return {
    state,
    store,
    env,
    context,
    Api,
    client,
    actions,
    account,
    reopen,
    calls,
    writes,
    applied,
  };
};
