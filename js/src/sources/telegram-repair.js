/**
 * One-time repairs of Telegram messages already in the store, each run
 * once (its marker link says it ran) when the account starts.
 *
 * `senders-v1`: a message read raw — from an update or a channel's
 * difference — was stored with its chat as its sender, because GramJS
 * fills `senderId` only for the messages it builds itself. Its author is
 * in `raw.fromId` (R-Y28 kept it): the sender is set from there, and the
 * name from that person's other messages, so a group shows who wrote
 * what again.
 */

import { unreachableChat } from './telegram-backfill.js';
import { peerChatId } from './telegram-updates.js';

const SOURCE = 'telegram';
const MARKER = 'repair:telegram:senders-v1';

const isGroupMessage = (l) =>
  l?.id?.startsWith(`msg:${SOURCE}:`) &&
  l.chatType !== 'personal_chat' &&
  l.sender !== 'me';

// Stored as the chat although `fromId` names someone else.
const misattributed = (l) => {
  if (!isGroupMessage(l) || String(l.sender) !== String(l.chat)) {
    return false;
  }
  const author = peerChatId(l.raw?.fromId);
  return Boolean(author) && author !== String(l.chat);
};

/** Each sender's name: from the address book, else their messages. */
const namesBySender = (links) => {
  const names = new Map();
  for (const l of links) {
    if (l?.id?.startsWith(`person:${SOURCE}:`) && l.name) {
      names.set(String(l.user), l.name);
    }
  }
  for (const l of links) {
    if (
      isGroupMessage(l) &&
      l.senderName &&
      String(l.sender) !== String(l.chat)
    ) {
      names.set(String(l.sender), names.get(String(l.sender)) ?? l.senderName);
    }
  }
  return names;
};

/**
 * Fix the misattributed senders in `store`; resolves to how many were
 * fixed. Runs once: later calls find the marker and do nothing.
 */
export const repairSenders = async (store, { log = () => {} } = {}) => {
  if (await store.get(MARKER)) {
    return 0;
  }
  const started = Date.now();
  const links = await store.query(
    (l) =>
      l?.id?.startsWith(`msg:${SOURCE}:`) ||
      l?.id?.startsWith(`person:${SOURCE}:`)
  );
  const wrong = links.filter(misattributed);
  const names = namesBySender(links);
  for (const link of wrong) {
    const sender = peerChatId(link.raw.fromId);
    await store.put({
      ...link,
      sender,
      senderName: names.get(sender) ?? null,
    });
  }
  await store.put({
    id: MARKER,
    fixed: wrong.length,
    at: new Date().toISOString(),
  });
  log({
    event: 'telegram_repair_senders',
    scanned: links.length,
    fixed: wrong.length,
    named: wrong.filter((l) => names.has(peerChatId(l.raw.fromId))).length,
    duration_ms: Date.now() - started,
  });
  return wrong.length;
};

// Each chat's messages, a hundred at a time: how many reads failed, and
// how many chats Telegram cannot address.
const readAgain = async (byChat, refresh, priority) => {
  let failed = 0;
  let unreachable = 0;
  for (const [chat, ids] of byChat) {
    for (let at = 0; at < ids.length; at += 100) {
      try {
        await refresh({ chat, ids: ids.slice(at, at + 100), priority });
      } catch (error) {
        if (unreachableChat(error)) {
          unreachable += 1;
          break;
        }
        failed += 1;
      }
    }
  }
  return { failed, unreachable };
};

/**
 * `unsupported-layer-N`: what Telegram sent as `messageMediaUnsupported`
 * while GramJS spoke an older layer (./telegram-layer.js, R-Y76) is read
 * again at the current one, a chat at a time in the background, so a
 * checklist, a new poll or newer media shows as it is. Resolves to how
 * many messages were asked for; a failed chat is asked again on the next
 * start (the marker is set only when every chat was read). A chat
 * Telegram cannot address (R-Y80) is passed over, not failed: asking
 * again would not reach it either (R-Y82).
 */
export const rereadUnsupported = async (
  store,
  { refresh, layer, log = () => {}, priority = 'prefetch' } = {}
) => {
  const marker = `repair:telegram:unsupported-layer-${layer}`;
  if (!refresh || !layer || (await store.get(marker))) {
    return 0;
  }
  const started = Date.now();
  const links = await store.query(
    (l) =>
      l?.id?.startsWith(`msg:${SOURCE}:`) &&
      !l.deleted &&
      l.raw?.media?.className === 'MessageMediaUnsupported'
  );
  const byChat = new Map();
  for (const l of links) {
    const id = Number(l.id.split(':').pop());
    if (Number.isInteger(id) && id > 0) {
      byChat.set(String(l.chat), [...(byChat.get(String(l.chat)) ?? []), id]);
    }
  }
  const { failed, unreachable } = await readAgain(byChat, refresh, priority);
  const left = (
    await store.query(
      (l) =>
        l?.id?.startsWith(`msg:${SOURCE}:`) &&
        !l.deleted &&
        l.raw?.media?.className === 'MessageMediaUnsupported'
    )
  ).length;
  if (failed === 0) {
    await store.put({
      id: marker,
      asked: links.length,
      left,
      at: new Date().toISOString(),
    });
  }
  log({
    event: 'telegram_repair_unsupported',
    layer,
    chats: byChat.size,
    asked: links.length,
    left,
    failed,
    unreachable,
    duration_ms: Date.now() - started,
  });
  return links.length;
};
