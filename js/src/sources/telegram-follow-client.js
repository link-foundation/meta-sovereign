import { connect } from './telegram-stickers.js';
import { invokeTelegramWrite } from './telegram-membership-receipt.js';
import { backlinkError } from '../follow/backlink-shape.js';
import {
  followEntity,
  followFailure,
  followKind,
  followPeerChat,
  followText,
} from './telegram-follow-shape.js';

const markedPeer = (peer) =>
  followPeerChat(peer) ??
  (followKind(peer) === 'InputPeerUser' ? followText(peer.userId) : null);
const peerFrom = (c, entity) => {
  const id = c.helpers.returnBigInt(followText(entity.id));
  if (followKind(entity) === 'Chat') {
    return new c.Api.InputPeerChat({ chatId: id });
  }
  if (
    !['Channel', 'User'].includes(followKind(entity)) ||
    entity.accessHash === undefined
  ) {
    throw followFailure('target-unavailable');
  }
  const accessHash = c.helpers.returnBigInt(followText(entity.accessHash));
  return followKind(entity) === 'Channel'
    ? new c.Api.InputPeerChannel({ channelId: id, accessHash })
    : new c.Api.InputPeerUser({ userId: id, accessHash });
};
const cachedPeer = async (c, chat) => {
  try {
    const peer = await c.client.session?.getInputEntity(
      c.helpers.returnBigInt(chat)
    );
    return markedPeer(peer) === chat ? peer : null;
  } catch {
    // This is a local cache lookup. Provider failures below must propagate.
    return null;
  }
};
const exactEntity = (entities, chat) => {
  if (
    !Array.isArray(entities) ||
    entities.length !== 1 ||
    followEntity(entities[0]).chat !== chat
  ) {
    throw followFailure('target-changed');
  }
  return entities[0];
};
const entityById = async (c, chat) => {
  if (!chat.startsWith('-100')) {
    return exactEntity(
      (
        await c.invoke(
          new c.Api.messages.GetChats({
            id: [c.helpers.returnBigInt(chat.slice(1))],
          })
        )
      )?.chats,
      chat
    );
  }
  const cached = await cachedPeer(c, chat);
  const answer = await c.invoke(
    new c.Api.channels.GetChannels({
      id: [
        new c.Api.InputChannel({
          channelId: c.helpers.returnBigInt(chat.slice(4)),
          accessHash: cached?.accessHash ?? c.zero,
        }),
      ],
    })
  );
  return exactEntity(answer?.chats, chat);
};
const entityByName = async (c, username) => {
  const answer = await c.invoke(
    new c.Api.contacts.ResolveUsername({ username })
  );
  const chat = followPeerChat(answer?.peer);
  const entity = answer?.chats?.find((row) => {
    const kind = followKind(row);
    return (
      ['Chat', 'Channel'].includes(kind) &&
      `${kind === 'Channel' ? '-100' : '-'}${followText(row.id)}` === chat
    );
  });
  if (!chat || !entity) {
    throw followFailure('target-unavailable');
  }
  return entity;
};

// High-level SDK entity helpers can retry internally and can swallow a lookup
// error. Use typed, single-call requests without mutating the shared client.
export const connectFollowTelegram = async (
  env,
  context,
  read = (use) => use()
) => {
  const c = await connect(env, context.userClient);
  if (!c) {
    throw followFailure('user-account-required');
  }
  c.invoke = (request) =>
    read(async () => {
      try {
        return await invokeTelegramWrite(c.client, request);
      } catch (error) {
        if (process.env.MS_FOLLOW_DEBUG === '1') {
          env.log?.({
            level: 'debug',
            event: 'telegram_follow_read_failed',
            method: request.className,
            ...backlinkError(error),
          });
        }
        throw error;
      }
    });
  c.entity = (selector) =>
    selector.kind === 'id' || selector.kind === 'private-message'
      ? entityById(c, selector.chat ?? `-100${selector.channel}`)
      : entityByName(c, selector.username);
  c.peerFrom = (entity) => peerFrom(c, entity);
  c.peer = async (chat) => {
    const cached = await cachedPeer(c, chat);
    if (cached) {
      return cached;
    }
    if (chat.startsWith('-')) {
      return peerFrom(c, await entityById(c, chat));
    }
    const users = await c.invoke(
      new c.Api.users.GetUsers({
        id: [
          new c.Api.InputUser({
            userId: c.helpers.returnBigInt(chat),
            accessHash: c.zero,
          }),
        ],
      })
    );
    if (
      users?.length !== 1 ||
      followText(users[0]?.id) !== chat ||
      followKind(users[0]) !== 'User'
    ) {
      throw followFailure('target-unavailable');
    }
    return peerFrom(c, users[0]);
  };
  return c;
};
export const readFollowTelegramOwner = async (c) => {
  const users = await c.invoke(
    new c.Api.users.GetUsers({ id: [new c.Api.InputUserSelf()] })
  );
  const me = users?.length === 1 ? users[0] : null;
  const owner = followText(me?.id);
  if (
    followKind(me) !== 'User' ||
    !/^[1-9]\d{0,19}$/u.test(owner) ||
    me.bot ||
    me.deleted
  ) {
    throw followFailure('user-account-required');
  }
  return owner;
};
