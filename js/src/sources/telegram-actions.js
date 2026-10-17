/**
 * What the user does to messages in Chat, as Telegram's apps do it
 * (R-Y36): read some messages again, forward them, delete them, show
 * their pictures.
 *
 * - `refreshMessages({ chat, ids })` reads the messages by id (one
 *   request, by the stored peer, through the queue): an edit since is
 *   stored, and a message Telegram no longer has is marked `deleted` —
 *   so a deletion made in another app shows here even when no update
 *   about it arrived.
 * - `forwardMessages({ fromChat, ids, toChat })` and `deleteMessages({
 *   chat, ids, revoke })` change Telegram only on the user's press in
 *   Chat; Telegram's answer goes through the live handler at once (the
 *   forwarded messages appear, the deleted ones go) and moves the update
 *   counters, so the catch-up does not ask for them again.
 * - `media({ chat, id, size })` is ./telegram-media.js.
 */

import { updatesOfResult, entitiesOf } from './telegram-catchup.js';
import { randomIdOf } from './telegram-send.js';
import { createMediaReader } from './telegram-media.js';

const SOURCE = 'telegram';
const MAX_IDS = 100;

const isChannel = (chat) => String(chat).startsWith('-100');

const cleanIds = (ids) =>
  [...new Set((ids ?? []).map(Number))]
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, MAX_IDS);

/**
 * `env` is the account's (store, connection, queue, peers, live,
 * catchUp, channels, importer); `tools` brings `credentials()`,
 * `toLinks(dialog, messages)` and `writeChanged(store, links)`.
 */
export const createActions = (env, tools, { mediaDir = null } = {}) => {
  const { store } = env;

  // The connected user client and the chat's peer, else null.
  const userClient = async () => {
    const creds = await tools.credentials();
    return creds?.kind === 'user'
      ? (await env.connection.open(creds)).client
      : null;
  };

  const dialogOf = async (chat) =>
    env.live.chats?.get(chat) ?? (await env.peers.dialog(chat)) ?? { id: chat };

  // Telegram's answer to a change we asked for: its messages through the
  // live handler, then the update counters.
  const apply = async (client, result) => {
    const entities = entitiesOf(result ?? {});
    for (const update of updatesOfResult(result)) {
      if (update && typeof update === 'object') {
        update._entities = entities;
        await env.live.handle(client, update);
        await env.channels?.observe(update);
      }
    }
    env.catchUp?.observeResult(result);
  };

  const markDeleted = async (chat, ids) => {
    let marked = 0;
    for (const id of ids) {
      const link = await store.get(`msg:${SOURCE}:${chat}:${id}`);
      if (link && !link.deleted) {
        await store.put({ ...link, deleted: true });
        marked += 1;
      }
    }
    return marked;
  };

  const refreshMessages = async ({ chat, ids, priority = 'list' } = {}) => {
    const wanted = cleanIds(ids);
    const client = wanted.length > 0 && chat ? await userClient() : null;
    if (!client) {
      return { written: 0, deleted: 0 };
    }
    const target = String(chat);
    const got = await env.queue.run(
      `refresh:${target}:${wanted.join(',')}`,
      priority,
      () =>
        env.connection.withPeer(client, target, (peer) =>
          client.getMessages(peer, { ids: wanted })
        )
    );
    const list = [...(got ?? [])];
    const present = list.filter(
      (m) => m && m.id !== undefined && m.className !== 'MessageEmpty'
    );
    const written = await tools.writeChanged(
      store,
      tools.toLinks(await dialogOf(target), present)
    );
    const kept = new Set(present.map((m) => Number(m.id)));
    const deleted = await markDeleted(
      target,
      wanted.filter((id) => !kept.has(id))
    );
    return { written, deleted };
  };

  const forwardMessages = async ({ fromChat, ids, toChat } = {}) => {
    const wanted = cleanIds(ids);
    const client =
      wanted.length > 0 && fromChat && toChat ? await userClient() : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const { Api, helpers } = await env.importer();
    const fromPeer = (await env.peers.input(String(fromChat))) ?? fromChat;
    const result = await env.connection.withPeer(
      client,
      String(toChat),
      async (toPeer) =>
        client.invoke(
          new Api.messages.ForwardMessages({
            fromPeer,
            toPeer,
            id: wanted,
            randomId: wanted.map((_, i) => randomIdOf(null, i, helpers)),
          })
        )
    );
    await apply(client, result);
    return { ok: true, forwarded: wanted.length };
  };

  const deleteMessages = async ({ chat, ids, revoke = false } = {}) => {
    const wanted = cleanIds(ids);
    const client = wanted.length > 0 && chat ? await userClient() : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const { Api } = await env.importer();
    const target = String(chat);
    const affected = await env.connection.withPeer(client, target, (peer) =>
      client.invoke(
        isChannel(target)
          ? new Api.channels.DeleteMessages({ channel: peer, id: wanted })
          : new Api.messages.DeleteMessages({ id: wanted, revoke })
      )
    );
    // Telegram answers with the counter it moved; the deletion itself is
    // the update it stands for.
    if (isChannel(target)) {
      await apply(client, {
        className: 'UpdateDeleteChannelMessages',
        channelId: target.slice(4),
        messages: wanted,
        pts: affected?.pts,
        ptsCount: affected?.ptsCount,
      });
    } else {
      await markDeleted(target, wanted);
      env.catchUp?.observeResult({
        className: 'UpdateDeleteMessages',
        messages: wanted,
        pts: affected?.pts,
        ptsCount: affected?.ptsCount,
      });
    }
    return { ok: true, deleted: wanted.length };
  };

  const reader = mediaDir
    ? createMediaReader({
        store,
        dir: mediaDir,
        queue: env.queue,
        client: userClient,
        refresh: refreshMessages,
        importer: env.importer,
        log: env.log,
      })
    : null;

  const media = async (request) => (reader ? reader.read(request) : null);

  return { refreshMessages, forwardMessages, deleteMessages, media };
};
