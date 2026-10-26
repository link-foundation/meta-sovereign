/**
 * Each channel's and supergroup's own catch-up (R-Y35).
 *
 * Telegram numbers a channel's updates on their own (`pts`), apart from
 * the account's. When it has too many to push for one channel it sends
 * `updateChannelTooLong` instead, and an update that skips numbers means
 * some never came — in both cases a new message, an edit or a deletion
 * is missing. Telegram's apps then ask `updates.getChannelDifference`
 * for that channel from its last number (TDLib's get_channel_difference,
 * Telegram Web K's getChannelDifference); so does this module, instead
 * of re-reading the whole chat list, which brings neither edits nor
 * deletions and costs far more requests.
 *
 * A channel's number lives in the store (`pts:telegram:<chat>`), from
 * the chat list (each dialog carries it) and then from every update, so
 * a restart goes on where it stopped. One channel is caught up at most
 * once a minute unless the user has it open, through the account's
 * queue; broadcast channels (not groups) only while the user reads them,
 * as their history is read on demand only (R-Y30).
 */

import {
  coverSlice,
  historyLink,
  historyLinkId,
  floodSeconds,
} from './telegram-history.js';
import { peerChatId } from './telegram-updates.js';
import { entitiesOf } from './telegram-catchup.js';
import { importTelegram } from './telegram-layer.js';

const SOURCE = 'telegram';
export const channelStateId = (chat) => `pts:${SOURCE}:${chat}`;

const SAVE_MS = 10_000;
export const CHANNEL_EVERY_MS = 60_000;
// A channel read this recently is open in the app.
const OPEN_MS = 10 * 60_000;
const SLICES = 10;
const SLICE = 100;

const text = (value) =>
  value === null || value === undefined ? null : String(value.value ?? value);

const channelOf = (update) => `-100${text(update.channelId)}`;

const CHANNEL_UPDATES = {
  UpdateNewChannelMessage: (u) => peerChatId(u.message?.peerId),
  UpdateEditChannelMessage: (u) => peerChatId(u.message?.peerId),
  UpdateDeleteChannelMessages: channelOf,
  UpdatePinnedChannelMessages: channelOf,
  UpdateChannelWebPage: channelOf,
};

/**
 * Where a channel's update moves its number: `{ chat, pts, count }`, or
 * `{ chat, tooLong: true }`; null for other updates.
 */
export const channelStep = (update) => {
  const name = update?.className;
  if (name === 'UpdateChannelTooLong') {
    return { chat: channelOf(update), tooLong: true };
  }
  const chatOf = CHANNEL_UPDATES[name];
  if (!chatOf || update.pts === undefined) {
    return null;
  }
  const chat = chatOf(update);
  return chat?.startsWith('-100')
    ? { chat, pts: Number(update.pts), count: Number(update.ptsCount ?? 0) }
    : null;
};

const stateLink = (chat, pts, at) => ({
  id: channelStateId(chat),
  tokens: ['pts', SOURCE, String(chat)],
  kind: 'pts',
  source: SOURCE,
  chat: String(chat),
  pts,
  at,
});

// The difference's messages extend the chat's stored stretch; after
// `tooLong` what lay between is unknown, so the stretch starts again.
const cover = async ({ store, now }, chat, ids, gap) => {
  if (ids.length === 0) {
    return;
  }
  const record = await store.get(historyLinkId(chat));
  const next = coverSlice(record, {
    ids,
    limit: gap ? ids.length : Infinity,
    mode: gap ? 'newest' : 'since',
    at: record?.at ?? new Date(now()).toISOString(),
  });
  await store.put(historyLink(chat, next));
};

const channelWarn = (log) => (error) => {
  const waiting = error?.code === 'flood-wait' || floodSeconds(error) > 0;
  log({
    level: waiting ? 'info' : 'warn',
    event: waiting
      ? 'telegram_channel_catch_up_waits'
      : 'telegram_channel_catch_up_failed',
    code: error?.code ?? null,
    error: error?.message,
  });
};

// A live update was not stored: the channel's number goes back to just
// before it (R-Z14). Returns the chat to catch up, or null.
const rewindChannel = (states, dirty, update) => {
  const step = channelStep(update);
  const state = step && !step.tooLong ? states.get(step.chat) : null;
  if (!state || !(state.pts > step.pts - step.count)) {
    return null;
  }
  states.set(step.chat, { ...state, pts: step.pts - step.count, at: 0 });
  dirty.add(step.chat);
  return step.chat;
};

const replay = async (ctx, client, chat, result, gap) => {
  const entities = entitiesOf(result);
  const messages = result.newMessages ?? result.messages ?? [];
  const updates = [
    ...messages.map((message) => ({
      className: 'UpdateNewChannelMessage',
      message,
    })),
    ...(result.otherUpdates ?? []),
  ];
  for (const update of updates) {
    update._entities = entities;
    // Strict: the channel's number must not pass an update that was not
    // stored (R-Z14).
    await ctx.handle(client, update, { strict: true });
  }
  await cover(
    ctx,
    chat,
    messages.map((m) => Number(m?.id)).filter(Number.isFinite),
    gap
  );
  return updates.length;
};

/**
 * `observe(update)` follows every update; `seed(chat, pts)` takes a
 * listed dialog's number for a channel not followed yet; `difference(
 * chat, priority)` catches one channel up now; `opened(chat)` says the
 * user reads it. `handle(client, update)` is the live handler, `request(
 * key, priority, task)` the queue, `peers` the stored input peers.
 */
export const createChannelSync = ({
  store,
  peers,
  request,
  handle,
  client: clientOf,
  importer = importTelegram,
  log = () => {},
  now = () => Date.now(),
  timers = globalThis,
}) => {
  const ctx = { store, handle, now };
  const warnFailed = channelWarn(log);
  const states = new Map(); // chat -> { pts, at } (at: last caught up)
  const dirty = new Set();
  const opened = new Map(); // chat -> when the user last read it
  let saveTimer = null;

  const stateOf = async (chat) => {
    if (!states.has(chat)) {
      const saved = await store.get(channelStateId(chat));
      states.set(chat, saved ? { pts: saved.pts, at: 0 } : null);
    }
    return states.get(chat);
  };

  const save = async () => {
    timers.clearTimeout(saveTimer);
    saveTimer = null;
    const at = new Date(now()).toISOString();
    const chats = [...dirty];
    dirty.clear();
    for (const chat of chats) {
      const state = states.get(chat);
      if (state) {
        await store.put(stateLink(chat, state.pts, at));
      }
    }
  };

  const move = (chat, pts) => {
    const state = states.get(chat) ?? { pts: 0, at: 0 };
    if (pts <= state.pts) {
      return;
    }
    states.set(chat, { ...state, pts });
    dirty.add(chat);
    saveTimer ??= timers.setTimeout(() => save().catch(() => {}), SAVE_MS);
    saveTimer?.unref?.();
  };

  // One answer of getChannelDifference: the next number, and whether
  // there is more.
  const apply = async (client, chat, result) => {
    const kind = result?.className;
    if (kind === 'updates.ChannelDifferenceTooLong') {
      const fed = await replay(ctx, client, chat, result, true);
      return { pts: Number(result.dialog?.pts), final: true, fed };
    }
    const fed =
      kind === 'updates.ChannelDifference'
        ? await replay(ctx, client, chat, result, false)
        : 0;
    return { pts: Number(result?.pts), final: result?.final !== false, fed };
  };

  /** Catch one channel up now; how many updates it brought. */
  const difference = async (chat, priority = 'prefetch') => {
    const state = await stateOf(chat);
    const channel = state?.pts ? await peers.input(chat) : null;
    const client = channel ? await clientOf() : null;
    if (!client) {
      return null;
    }
    states.set(chat, { ...state, at: now() });
    const { Api } = await importer();
    let fed = 0;
    for (let slice = 0; slice < SLICES; slice += 1) {
      const pts = states.get(chat).pts;
      const result = await request(`channel:${chat}:${pts}`, priority, () =>
        client.invoke(
          new Api.updates.GetChannelDifference({
            channel,
            filter: new Api.ChannelMessagesFilterEmpty(),
            pts,
            limit: SLICE,
          })
        )
      );
      const step = await apply(client, chat, result);
      fed += step.fed;
      if (Number.isFinite(step.pts)) {
        move(chat, step.pts);
      }
      if (step.final) {
        break;
      }
    }
    log({ event: 'telegram_channel_catch_up', priority, updates: fed });
    return fed;
  };

  const isOpen = (chat) => now() - (opened.get(chat) ?? -Infinity) < OPEN_MS;

  // A gap: caught up soon, unless it was a moment ago (it is then caught
  // up the next time one is due, or when the user opens the chat).
  const due = async (chat) => {
    const state = await stateOf(chat);
    if (!state?.pts || now() - state.at < CHANNEL_EVERY_MS) {
      return;
    }
    const dialog = await peers.dialog(chat);
    if (!isOpen(chat) && !dialog?.isGroup) {
      return; // a broadcast channel nobody reads now
    }
    await difference(chat, isOpen(chat) ? 'list' : 'prefetch');
  };

  const observe = async (update) => {
    const step = channelStep(update);
    if (!step) {
      return;
    }
    const state = await stateOf(step.chat);
    if (step.tooLong) {
      await due(step.chat);
      return;
    }
    if (state?.pts && step.pts - step.count > state.pts) {
      await due(step.chat); // numbers skipped: something never came
      return;
    }
    move(step.chat, step.pts);
  };

  const seed = async (chat, pts) => {
    if (String(chat).startsWith('-100') && Number(pts) > 0) {
      const state = await stateOf(String(chat));
      if (!state?.pts) {
        move(String(chat), Number(pts));
      }
    }
  };

  // A live channel update that could not be stored: the channel is caught
  // up again from just before it, so it is fetched, not lost (R-Z14).
  const failed = (update) => {
    const chat = rewindChannel(states, dirty, update);
    if (chat) {
      difference(chat).catch(warnFailed);
    }
  };

  return {
    failed,
    observe: (update) => observe(update).catch(warnFailed),
    seed,
    difference,
    /** Whether a channel's number is known (it can be caught up). */
    follows: async (chat) => Boolean((await stateOf(String(chat)))?.pts),
    opened: (chat) => opened.set(String(chat), now()),
    flush: save,
  };
};
