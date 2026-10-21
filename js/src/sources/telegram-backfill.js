/**
 * The slow download of every chat's whole history (R-Y30), so the store
 * holds it for offline reading, analysis and learning replies — and
 * Telegram is never asked for it again.
 *
 *   1. the whole chat list first (its pages after the first one);
 *   2. then private chats, a page at a time, taking turns (the chat read
 *      longest ago goes next), so short chats are done early and a long
 *      one does not hold the others back;
 *   3. then groups the same way;
 *   4. channels never: they are read on demand only (opened or shown).
 *
 * One request every few seconds, at `background` priority, and none at
 * all while the user waits for something (anything queued at `prefetch`
 * or above) or Telegram asked to wait. Progress lives in the store: each
 * chat's `history:` link (./telegram-history.js) says how far back it is
 * stored, so a restart goes on where it stopped. It also waits while the
 * server's memory is nearly full (the store is held in memory): more
 * history then waits for room instead of stopping the server. A chat
 * Telegram cannot address (no access hash for its user, a channel now
 * private) is passed over for the rest of the run instead of holding
 * every other chat back.
 */

import { getHeapStatistics } from 'node:v8';
import { historyLinkId } from './telegram-history.js';

export const BACKFILL_EVERY_MS = 5000;
export const BACKFILL_PAGE = 100;
const DIALOGS_PAGE = 100;
const CHATS_FRESH_MS = 60_000;
const MAX_BACKOFF_MS = 5 * 60_000;
// Past this share of the heap limit, nothing more is downloaded.
export const BACKFILL_HEAP_SHARE = 0.7;

/** Whether the heap is too full to take more history. */
export const heapNearlyFull = (stats = getHeapStatistics()) =>
  stats.used_heap_size > BACKFILL_HEAP_SHARE * stats.heap_size_limit;

// What the background download covers, in order.
export const BACKFILL_ORDER = Object.freeze(['private', 'group']);

/** `private`, `group` or `channel`, from a message's `chatType`. */
// Errors that are about the chat itself, not the connection.
const UNREACHABLE =
  /input entity|PEER_ID_INVALID|CHANNEL_PRIVATE|CHANNEL_INVALID|USER_ID_INVALID|CHAT_ID_INVALID/;

/** Whether reading a chat failed because Telegram cannot reach it. */
export const unreachableChat = (error) =>
  UNREACHABLE.test(`${error?.errorMessage ?? ''} ${error?.message ?? ''}`);

export const backfillKind = (chatType) => {
  if (chatType === 'personal_chat') {
    return 'private';
  }
  return chatType === 'channel' ? 'channel' : 'group';
};

/**
 * The next chat to read further back, or null when every private chat
 * and group is stored to its first message. `chats`: `{ chat, chatType,
 * at }` (`at`: its newest message); `records`: chat → `history:` link;
 * `first`: chats to read before any other, whatever their kind.
 */
export const nextBackfill = (
  chats = [],
  records = new Map(),
  skip = [],
  first = []
) => {
  const skipped = new Set(skip);
  const due = (c) => !records.get(c.chat)?.complete && !skipped.has(c.chat);
  // A chat asked for (someone is being learned about) comes first.
  const wanted = first
    .map((chat) => chats.find((c) => c.chat === String(chat)))
    .find((c) => c && due(c));
  if (wanted) {
    return {
      chat: wanted.chat,
      kind: backfillKind(wanted.chatType),
      before: records.get(wanted.chat)?.oldest ?? null,
      wanted: true,
    };
  }
  for (const kind of BACKFILL_ORDER) {
    const todo = chats.filter(
      (c) =>
        backfillKind(c.chatType) === kind &&
        !records.get(c.chat)?.complete &&
        !skipped.has(c.chat)
    );
    if (todo.length > 0) {
      const turn = (c) => String(records.get(c.chat)?.at ?? '');
      todo.sort(
        (a, b) =>
          turn(a).localeCompare(turn(b)) ||
          String(b.at ?? '').localeCompare(String(a.at ?? ''))
      );
      const record = records.get(todo[0].chat);
      return {
        chat: todo[0].chat,
        kind,
        before: record?.oldest ?? null,
      };
    }
  }
  return null;
};

/** How far the download is: `{ phase, chats, complete }`. */
export const backfillProgress = (phase, chats = [], records = new Map()) => {
  const covered = chats.filter((c) =>
    BACKFILL_ORDER.includes(backfillKind(c.chatType))
  );
  return {
    phase,
    chats: covered.length,
    complete: covered.filter((c) => records.get(c.chat)?.complete).length,
  };
};

// How long to wait after a step: long when nothing is left, short for
// a chat someone waits for.
const paceAfter = (did, everyMs) => {
  if (did === 'done' || did === 'memory') {
    return everyMs * 12;
  }
  return did === 'wanted' ? Math.ceil(everyMs / 2) : everyMs;
};

/**
 * `start()` / `stop()` the download; `step()` does one request (tests
 * call it directly). `chats()` lists the account's chats; `pages` is the
 * account's page reader, `queue` its request queue.
 */
export const createBackfill = ({
  store,
  queue,
  pages,
  chats,
  credentials,
  syncId,
  log = () => {},
  now = () => Date.now(),
  everyMs = BACKFILL_EVERY_MS,
  memoryFull = heapNearlyFull,
}) => {
  let timer = null;
  let failures = 0;
  let listed = { at: -Infinity, chats: [] };
  const skip = new Set(); // chats Telegram gave nothing older for
  const wanted = new Set(); // chats asked for first, until whole
  let progress = { phase: 'idle', chats: 0, complete: 0 };
  let waitedForMemory = false;

  const chatList = async () => {
    if (now() - listed.at >= CHATS_FRESH_MS) {
      listed = { at: now(), chats: (await chats()) ?? [] };
    }
    return listed.chats;
  };

  const recordsOf = async (list) =>
    new Map(
      await Promise.all(
        list.map(async (c) => [c.chat, await store.get(historyLinkId(c.chat))])
      )
    );

  const histories = async () => {
    const list = await chatList();
    const records = await recordsOf(list);
    for (const chat of wanted) {
      if (records.get(chat)?.complete || skip.has(chat)) {
        wanted.delete(chat);
      }
    }
    const next = nextBackfill(list, records, [...skip], [...wanted]);
    progress = backfillProgress(next?.kind ?? 'done', list, records);
    if (!next) {
      return 'done';
    }
    let answer;
    try {
      answer = await pages.history({
        chat: next.chat,
        before: next.before,
        limit: BACKFILL_PAGE,
        priority: 'background',
      });
    } catch (error) {
      if (!unreachableChat(error)) {
        throw error;
      }
      skip.add(next.chat);
      log({
        level: 'warn',
        event: 'telegram_backfill_chat_skipped',
        kind: next.kind,
        error: error?.message,
      });
      return 'skipped';
    }
    if (answer?.cached) {
      skip.add(next.chat);
    }
    return next.wanted ? 'wanted' : next.kind;
  };

  /** One request, if one is due; what it did. */
  const step = async () => {
    if ((await credentials())?.kind !== 'user') {
      return 'idle';
    }
    if (queue.pending('prefetch') > 0 || queue.heldFor() > 0) {
      return 'yield';
    }
    if (memoryFull()) {
      if (!waitedForMemory) {
        log({ level: 'warn', event: 'telegram_backfill_memory_full' });
      }
      waitedForMemory = true;
      progress = { ...progress, phase: 'memory' };
      return 'memory';
    }
    waitedForMemory = false;
    const state = (await store.get(syncId)) ?? {};
    if (!state.dialogsComplete) {
      await pages.moreDialogs({ limit: DIALOGS_PAGE, priority: 'background' });
      listed = { at: -Infinity, chats: [] };
      progress = { ...progress, phase: 'dialogs' };
      return 'dialogs';
    }
    return histories();
  };

  // Longer after each failure in a row; never before Telegram's "wait".
  const delay = (base) =>
    Math.max(
      failures === 0 ? base : Math.min(MAX_BACKOFF_MS, base * 2 ** failures),
      queue.heldFor()
    );

  const schedule = (ms) => {
    timer = globalThis.setTimeout(tick, ms);
    timer.unref?.();
  };

  async function tick() {
    let base = everyMs;
    try {
      const did = await step();
      failures = 0;
      // Nothing to read now; new chats may come with the list.
      base = paceAfter(did, everyMs);
    } catch (error) {
      failures += 1;
      log({
        level: 'warn',
        event: 'telegram_backfill_failed',
        code: error?.code ?? null,
        error: error?.message,
      });
    }
    if (timer !== null) {
      schedule(delay(base));
    }
  }

  return {
    step,
    /** Read this chat's history before any other's. */
    prefer: (chat) => {
      wanted.add(String(chat));
    },
    wanted: (chat) => wanted.has(String(chat)),
    start: () => {
      if (timer === null && everyMs > 0) {
        schedule(everyMs);
      }
    },
    stop: () => {
      globalThis.clearTimeout(timer);
      timer = null;
    },
    progress: () => progress,
  };
};
