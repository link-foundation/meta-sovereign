import { createMemoryStore } from '../../src/storage/universal.js';
import { createTelegramBacklinks } from '../../src/sources/telegram-backlinks.js';
import { createFollowBacklinks } from '../../src/follow/backlinks.js';
import { buildMessageLink } from '../../src/sources/link.js';

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
const fakeApi = () => ({
  users: methods('users', ['GetUsers']),
  messages: methods('messages', [
    'GetChats',
    'SendMessage',
    'GetMessages',
    'GetHistory',
    'DeleteMessages',
  ]),
  channels: methods('channels', ['GetChannels', 'GetMessages']),
  ...Object.fromEntries(
    [
      'InputPeerChat',
      'InputPeerChannel',
      'InputChannel',
      'InputUserSelf',
      'InputMessageID',
    ].map((name) => [name, named(name)])
  ),
});
export const telegramBacklinkInput = (extra = {}) => ({
  source: 'telegram',
  chats: ['-7'],
  backlink: 'https://t.me/study_group',
  monitorMs: 2000,
  intervalMs: 1000,
  deleteIncoming: true,
  retry: { attempts: 3, delayMs: 10, maxDelayMs: 20 },
  ...extra,
});
const entityPeer = (entity, input = false) =>
  entity.className === 'Channel'
    ? {
        className: input ? 'InputPeerChannel' : 'PeerChannel',
        channelId: entity.id,
        ...(input ? { accessHash: 10n } : {}),
      }
    : { className: input ? 'InputPeerChat' : 'PeerChat', chatId: entity.id };
const chatOf = (entity) =>
  `${entity.className === 'Channel' ? '-100' : '-'}${entity.id}`;
const message = (state, id, extra = {}) => ({
  className: 'Message',
  id,
  peerId: entityPeer(state.entity),
  out: false,
  message: `Message ${id}`,
  ...extra,
});
const createClient = (state, requests, calls, writes) => ({
  session: {
    getInputEntity: async () =>
      state.cached === false ? null : entityPeer(state.entity, true),
  },
  invoke: async (request, _sender, options) => {
    calls.push({ request, options });
    requests.push(request);
    if (
      ['messages.SendMessage', 'messages.DeleteMessages'].includes(
        request.className
      )
    ) {
      writes.push(request);
    }
    await state.before?.(request);
    const getMessages = () => ({
      messages: request.id.map(({ id }) =>
        state.deleted.has(String(id)) || state.removed
          ? { className: 'MessageEmpty', id }
          : (state.messages.get(String(id)) ?? {
              className: 'MessageEmpty',
              id,
            })
      ),
    });
    const handlers = {
      'users.GetUsers': () => [
        {
          className: 'User',
          id: state.owner,
          bot: state.bot,
          deleted: state.userDeleted,
        },
      ],
      'messages.GetChats': () => ({ chats: [state.entity] }),
      'channels.GetChannels': () => ({ chats: [state.entity] }),
      'messages.GetMessages': getMessages,
      'channels.GetMessages': getMessages,
      'messages.GetHistory': () => ({
        messages: [1, 2, 3, 4]
          .map((id) => state.messages.get(String(id)))
          .filter(Boolean)
          .slice(0, request.limit),
      }),
      'messages.SendMessage': () => {
        const id = state.nextId++;
        state.messages.set(
          String(id),
          message(state, id, { out: true, message: request.message })
        );
        return { className: 'UpdateShortSentMessage', id, out: true };
      },
      'messages.DeleteMessages': () => {
        for (const id of request.id) {
          if (!state.deleteOnly || state.deleteOnly.includes(String(id))) {
            state.deleted.add(String(id));
          }
        }
        return {
          className: 'messages.AffectedMessages',
          pts: 10,
          ptsCount: request.id.length,
        };
      },
    };
    if (!handlers[request.className]) {
      throw new Error(`Unexpected fixture method ${request.className}`);
    }
    const answer = handlers[request.className]();
    const override = await state.response?.(request, answer);
    return override === undefined ? answer : override;
  },
});
export const telegramBacklinksFixture = async ({
  store = createMemoryStore(),
  queue,
} = {}) => {
  const state = {
    owner: 7n,
    now: 100000,
    nextId: 100,
    cached: true,
    entity: { className: 'Chat', id: 7n, title: 'Telegram study circle' },
    messages: new Map(),
    deleted: new Set(),
    removed: false,
  };
  const requests = [];
  const calls = [];
  const writes = [];
  const sleeps = [];
  const applied = [];
  const seed = async () => {
    const rows = [
      message(state, 1),
      message(state, 2, { out: true }),
      message(state, 3, {
        className: 'MessageService',
        action: { className: 'MessageActionChatEditTitle' },
      }),
      message(state, 4),
    ];
    for (const row of rows) {
      state.messages.set(String(row.id), row);
      await store.put(
        buildMessageLink({
          source: 'telegram',
          externalId: String(row.id),
          sender: row.out ? '7' : '8',
          chat: chatOf(state.entity),
          body: row.message ?? '',
          timestamp: '2026-11-10T00:00:00Z',
          outgoing: row.out,
          service: Boolean(row.action),
          raw: row,
        })
      );
    }
  };
  await seed();
  const Api = fakeApi();
  const client = createClient(state, requests, calls, writes);
  const context = {
    userClient: async () => {
      await state.connect?.();
      return state.clientOverride ?? client;
    },
    apply: async (_client, answer) => {
      applied.push(answer);
      await state.apply?.();
    },
  };
  const env = {
    store,
    queue,
    importer: async () => ({
      Api,
      helpers: {
        returnBigInt: BigInt,
        readBigIntFromBuffer: (buffer) => buffer.readBigInt64LE(),
      },
    }),
  };
  const actions = createTelegramBacklinks(env, context);
  const account = {
    ...actions,
    status: async () => ({ connected: true, kind: 'user' }),
    callsList: async () => ({ ok: true, calls: [], next: null }),
    stop: async () => env.followBacklinkStop(),
  };
  const options = {
    store,
    telegramAccount: account,
    now: () => state.now,
    sleep: async (ms, signal) => {
      sleeps.push(ms);
      await state.sleep?.(ms, signal);
      state.now += ms;
    },
  };
  const service = createFollowBacklinks(options);
  const post = async (extra) => {
    const preview = await service.preview(telegramBacklinkInput(extra));
    const job = await service.apply({ planId: preview.planId, confirm: true });
    await service.idle();
    return service.status({ jobId: job.id });
  };
  const close = async () => {
    await service.stop();
    await account.stop();
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
    options,
    service,
    post,
    requests,
    calls,
    writes,
    sleeps,
    applied,
    seed,
    close,
  };
};
