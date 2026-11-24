import { backlinkFailure, backlinkPeer } from '../follow/backlink-shape.js';
import {
  followEntity,
  followKind,
  followPeerChat,
  followText,
} from './telegram-follow-shape.js';

export const telegramBacklinkId = (value) => {
  const id = Number(followText(value));
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
    throw backlinkFailure('provider-response');
  }
  return String(id);
};
const inputPeer = async (env, c, chat) => {
  let peer = await env.peers?.input(chat);
  if (!peer && c.client.session?.getInputEntity) {
    try {
      peer = await c.client.session.getInputEntity(
        c.helpers.returnBigInt(chat)
      );
    } catch {
      peer = null;
    }
  }
  if (!peer && !chat.startsWith('-100')) {
    peer = new c.Api.InputPeerChat({
      chatId: c.helpers.returnBigInt(chat.slice(1)),
    });
  }
  if (followPeerChat(peer) !== chat) {
    throw backlinkFailure('target-unavailable');
  }
  return peer;
};
const canWrite = (entity, target) => {
  const elevated = entity.creator || entity.adminRights;
  const denied =
    entity.bannedRights?.sendMessages ||
    entity.bannedRights?.sendPlain ||
    (!elevated &&
      (entity.defaultBannedRights?.sendMessages ||
        entity.defaultBannedRights?.sendPlain));
  return (
    !entity.left &&
    !denied &&
    (!target.broadcast ||
      Boolean(entity.creator || entity.adminRights?.postMessages))
  );
};
export const telegramBacklinkTarget = async (env, c, value) => {
  const chat = backlinkPeer(value, 'telegram');
  const peer = await inputPeer(env, c, chat);
  const request =
    followKind(peer) === 'InputPeerChat'
      ? new c.Api.messages.GetChats({ id: [peer.chatId] })
      : new c.Api.channels.GetChannels({
          id: [
            new c.Api.InputChannel({
              channelId: peer.channelId,
              accessHash: peer.accessHash,
            }),
          ],
        });
  const result = await c.invoke(request);
  if (!Array.isArray(result?.chats) || result.chats.length !== 1) {
    throw backlinkFailure('provider-response');
  }
  const entity = result.chats[0];
  const target = followEntity(entity);
  if (target.chat !== chat || entity.migratedTo) {
    throw backlinkFailure('target-changed');
  }
  return {
    ...target,
    peer,
    canWrite: canWrite(entity, target),
    // Channel deletion has no local-only flag. Never turn this option into
    // deleting other participants' history for everyone.
    canCleanup: target.kind === 'Chat',
  };
};
export const telegramBacklinkMessages = (answer, chat, limit) => {
  if (!Array.isArray(answer?.messages) || answer.messages.length > limit) {
    throw backlinkFailure('provider-response');
  }
  const ids = new Set();
  for (const message of answer.messages) {
    const id = telegramBacklinkId(message?.id);
    const kind = followKind(message);
    if (
      ids.has(id) ||
      !['Message', 'MessageService', 'MessageEmpty'].includes(kind) ||
      (kind !== 'MessageEmpty' && followPeerChat(message.peerId) !== chat) ||
      (kind === 'MessageEmpty' &&
        message.peerId &&
        followPeerChat(message.peerId) !== chat)
    ) {
      throw backlinkFailure('provider-response');
    }
    ids.add(id);
  }
  return answer.messages;
};
export const readTelegramBacklinks = async (c, target, ids) => {
  const input = ids.map(
    (id) => new c.Api.InputMessageID({ id: Number(telegramBacklinkId(id)) })
  );
  const request =
    target.kind === 'Channel'
      ? new c.Api.channels.GetMessages({
          channel: new c.Api.InputChannel({
            channelId: target.peer.channelId,
            accessHash: target.peer.accessHash,
          }),
          id: input,
        })
      : new c.Api.messages.GetMessages({ id: input });
  const rows = telegramBacklinkMessages(
    await c.invoke(request),
    target.chat,
    ids.length
  );
  if (
    rows.length !== ids.length ||
    rows.some((row) => !ids.includes(String(row.id)))
  ) {
    throw backlinkFailure('provider-response');
  }
  return rows;
};
export const telegramBacklinkHistory = async (c, target, limit) =>
  telegramBacklinkMessages(
    await c.invoke(
      new c.Api.messages.GetHistory({
        peer: target.peer,
        offsetId: 0,
        offsetDate: 0,
        addOffset: 0,
        limit,
        maxId: 0,
        minId: 0,
        hash: c.helpers.returnBigInt(0),
      })
    ),
    target.chat,
    limit
  );
