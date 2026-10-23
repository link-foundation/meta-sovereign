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
// While Telegram asks to wait, the queue turns background requests down
// (`code: 'flood-wait'`, `retryAfter` seconds); a repair waits that long
// and asks again, as Telegram's apps do, instead of failing the chat.
const FLOOD_RETRIES = 8;
const pause = (ms) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms).unref?.());

const askPatiently = async (refresh, request, wait) => {
  for (let tries = 0; ; tries += 1) {
    try {
      return await refresh(request);
    } catch (error) {
      if (error?.code !== 'flood-wait' || tries >= FLOOD_RETRIES) {
        throw error;
      }
      await wait(Math.max(1, Number(error.retryAfter) || 30) * 1000);
    }
  }
};

// Why a read failed, as a short code: never a chat id, name or text (R-Y222).
const reasonOf = (error) =>
  String(
    error?.code ??
      error?.errorMessage ??
      String(error?.message ?? error)
        .replace(/\d+/g, '')
        .slice(0, 40)
  );

const readAgain = async (byChat, refresh, priority, wait = pause) => {
  const reasons = {};
  let failed = 0;
  let unreachable = 0;
  for (const [chat, ids] of byChat) {
    for (let at = 0; at < ids.length; at += 100) {
      try {
        await askPatiently(
          refresh,
          { chat, ids: ids.slice(at, at + 100), priority },
          wait
        );
      } catch (error) {
        if (unreachableChat(error)) {
          unreachable += 1;
          break;
        }
        failed += 1;
        const reason = reasonOf(error);
        reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
    }
  }
  return { failed, unreachable, reasons };
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
  { refresh, layer, rev, log = () => {}, priority = 'prefetch', wait } = {}
) => {
  // `rev`: the schema file's revision (R-Y220), so a regenerated file at
  // the same layer asks once more.
  const marker = `repair:telegram:unsupported-layer-${layer}${rev ? `-r${rev}` : ''}`;
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
  const { failed, unreachable, reasons } = await readAgain(
    byChat,
    refresh,
    priority,
    wait
  );
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
    reasons,
    unreachable,
    duration_ms: Date.now() - started,
  });
  return links.length;
};

// A forward whose source the store cannot name: no name from Telegram,
// none stored, and its channel, group or person not among the chats.
const unnamedForward = (l, chats) => {
  const fwd = l.raw?.fwdFrom;
  if (!fwd || fwd.fromName || l.forwardedFrom?.name || l.deleted) {
    return false;
  }
  const from = peerChatId(fwd.fromId);
  return Boolean(from) && !chats.has(from);
};

/**
 * `forward-names-v1`: a forward stored before its source's name was kept
 * (R-Y90) shows only "Forwarded message" when that channel, group or
 * person is not one of the user's chats — Telegram Desktop names it, as
 * Telegram sends the source with the message. Such forwards are read
 * again in the background, which stores the name. Resolves to how many
 * were asked for; a failed chat is asked again on the next start.
 */
export const nameForwards = async (
  store,
  { refresh, log = () => {}, priority = 'prefetch', wait } = {}
) => {
  const marker = 'repair:telegram:forward-names-v1';
  if (!refresh || (await store.get(marker))) {
    return 0;
  }
  const started = Date.now();
  const messages = await store.query((l) =>
    l?.id?.startsWith(`msg:${SOURCE}:`)
  );
  const chats = new Set(messages.map((l) => String(l.chat)));
  const unnamed = (list) => list.filter((l) => unnamedForward(l, chats));
  const links = unnamed(messages);
  const byChat = new Map();
  for (const l of links) {
    const id = Number(l.id.split(':').pop());
    if (Number.isInteger(id) && id > 0) {
      byChat.set(String(l.chat), [...(byChat.get(String(l.chat)) ?? []), id]);
    }
  }
  const { failed, unreachable, reasons } = await readAgain(
    byChat,
    refresh,
    priority,
    wait
  );
  const left = unnamed(
    await store.query((l) => l?.id?.startsWith(`msg:${SOURCE}:`))
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
    event: 'telegram_repair_forward_names',
    chats: byChat.size,
    asked: links.length,
    left,
    failed,
    reasons,
    unreachable,
    duration_ms: Date.now() - started,
  });
  return links.length;
};
