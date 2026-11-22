import { createActions } from '../../src/sources/telegram-actions.js';
import { createTelegramLive } from '../../src/sources/telegram-account-live.js';
import { telegramDialogLinks } from '../../src/sources/telegram-account.js';
import { importTelegram } from '../../src/sources/telegram-layer.js';
import { createMemoryStore } from '../../src/storage/universal.js';

export const PUBLIC = '-100741';
export const PRIVATE = '-100742';
export const ME = '17';
const names = { [PUBLIC]: 'Public Workshop', [PRIVATE]: 'Private Workshop' };
const peerOf = (chat) => ({ channelId: Number(chat.slice(4)) });
const dialogOf = (chat) => ({ id: chat, title: names[chat], isGroup: true });

export const ownMessage = (chat, id, message, extra) => ({
  className: 'Message',
  id,
  out: true,
  fromId: { userId: ME },
  peerId: peerOf(chat),
  date: Math.floor(Date.now() / 1000),
  message,
  ...extra,
});

// Real TL requests and update handling with an in-memory provider history.
export const continuationFixture = async () => {
  const { Api, helpers } = await importTelegram();
  const store = createMemoryStore();
  const history = new Map();
  const dialogs = new Map(
    [PUBLIC, PRIVATE].map((chat) => [chat, dialogOf(chat)])
  );
  const live = createTelegramLive({
    store,
    toLinks: telegramDialogLinks,
    chats: dialogs,
  });
  const state = {
    kind: 'user',
    limit: 4096,
    channel: {},
    fullChat: {},
    forum: null,
  };
  const calls = [];
  const posts = [];
  const edits = [];
  const client = {
    async invoke(request) {
      calls.push(request);
      const peer = request.peer ?? request.channel;
      const chat = peer && `-100${peer.channelId}`;
      switch (request.className) {
        case 'channels.GetFullChannel':
          return {
            chats: [
              {
                className: 'Channel',
                id: peer.channelId,
                megagroup: true,
                username: chat === PUBLIC ? 'public_workshop' : null,
                ...state.channel,
              },
            ],
            fullChat: state.fullChat,
          };
        case 'messages.GetHistory':
          request.getBytes();
          return { messages: history.get(chat)?.slice(-1) ?? [] };
        case 'messages.GetForumTopicsByID':
          request.getBytes();
          return state.forum;
        case 'help.GetConfig':
          return { messageLengthMax: state.limit };
        case 'messages.EditMessage': {
          request.getBytes();
          edits.push(request);
          await state.onEdit?.(request);
          const list = history.get(chat);
          const i = list.findIndex((item) => item.id === request.id);
          const message = {
            ...list[i],
            message: request.message,
            entities: request.entities,
            editDate: Math.floor(Date.now() / 1000),
          };
          list[i] = message;
          return {
            className: 'Updates',
            updates: [{ className: 'UpdateEditChannelMessage', message }],
          };
        }
        case 'messages.SaveDraft':
          return true;
        default:
          throw new Error(`Unexpected request ${request.className}`);
      }
    },
  };
  const actions = () =>
    createActions(
      {
        store,
        live,
        now: Date.now,
        importer: async () => ({ Api, helpers }),
        queue: { run: (_key, _priority, task) => task() },
        connection: {
          open: async () => ({ client, me: { id: ME } }),
          withPeer: (_client, chat, use) =>
            use(
              new Api.InputPeerChannel({
                channelId: helpers.returnBigInt(chat.slice(4)),
                accessHash: helpers.returnBigInt(0),
              })
            ),
        },
      },
      { credentials: async () => ({ kind: state.kind }) }
    );

  const note = async (chat, message, { cached = true } = {}) => {
    history.set(chat, [...(history.get(chat) ?? []), message]);
    const [link] = telegramDialogLinks(dialogOf(chat), [message]);
    if (cached && link) {
      await store.put(link);
    }
    return link;
  };
  const send = async (draft) => {
    posts.push(draft);
    const { chat, text } = draft;
    const id = (history.get(chat)?.at(-1)?.id ?? 0) + 1;
    const link = await note(chat, ownMessage(chat, id, text));
    return { via: 'api', links: [link] };
  };
  return {
    actions,
    Api,
    store,
    state,
    calls,
    posts,
    edits,
    history,
    note,
    send,
  };
};
