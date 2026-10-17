/**
 * Catching up on Telegram updates that never arrived.
 *
 * Telegram numbers the updates of an account (`pts`): each one says the
 * number after it and how many it adds (`ptsCount`). Telegram's own apps
 * (TDLib, Telegram Web A and K) keep the last number and ask
 * `updates.getDifference` for everything after it whenever
 *   - the connection comes back (after sleep, a network change),
 *   - an update skips numbers and the missing one does not show up
 *     within 0.7 s (TDLib's MAX_UNFILLED_GAP_TIME),
 *   - Telegram says there were too many (`updatesTooLong`),
 *   - the app starts again (the number is saved).
 * GramJS has the hook for this (`catchUp()`) but it is an empty TODO, so
 * without this module a message sent while the connection was down only
 * appeared on the next poll, and an edit or deletion not at all.
 *
 * What the difference returns goes through the same handler as live
 * updates (`handle`), so it lands as the same links. Channels and
 * supergroups have their own numbers; a gap there (`updateChannelTooLong`)
 * and a difference too long to fetch fall back to re-reading the dialogs
 * (`resync`). Applying an update twice is harmless (links merge by id).
 *
 * See docs/CHAT-REFERENCES.md, "Live updates and catching up after a gap".
 */

import { connectionStateOf } from './telegram-updates.js';

export const TELEGRAM_STATE_ID = 'state:telegram';

export const GAP_MS = 700;
const SAVE_MS = 1000;
const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 60_000;
const MAX_SLICES = 50;

// Channels count their own updates; only the account's common numbers
// are tracked here.
const ownPts = (update) =>
  update?.pts !== undefined &&
  update.ptsCount !== undefined &&
  !/Channel/.test(update.className ?? '');

/** The numbers an update moves the counter to, or null. */
export const ptsStep = (update) =>
  ownPts(update)
    ? { pts: Number(update.pts), count: Number(update.ptsCount) }
    : null;

/** A user or chat as GramJS's marked peer id (what `_entities` uses). */
export const markedId = (entity) => {
  const id = String(entity?.id?.value ?? entity?.id ?? '');
  const kind = entity?.className ?? '';
  if (kind.startsWith('Channel')) {
    return `-100${id}`;
  }
  return kind.startsWith('Chat') ? `-${id}` : id;
};

const entitiesOf = (result) =>
  new Map(
    [...(result.users ?? []), ...(result.chats ?? [])].map((e) => [
      markedId(e),
      e,
    ])
  );

const later = (timers, fn, ms) => {
  const id = timers.setTimeout(fn, ms);
  id?.unref?.();
  return id;
};

const stateOf = (next) => ({
  pts: Number(next.pts),
  qts: Number(next.qts ?? 0),
  date: Number(next.date ?? 0),
  seq: Number(next.seq ?? 0),
});

/**
 * The account's update counter. `step(update)` follows it; an update
 * past a gap waits in `pending`, and when the gap is still open after
 * `gapMs` (TDLib: 0.7 s) `onGap()` asks for the difference.
 */
export const createPtsCounter = ({
  gapMs = GAP_MS,
  timers = globalThis,
  onGap = () => {},
  onMove = () => {},
} = {}) => {
  let state = null; // { pts, qts, date, seq }
  let pending = []; // steps past a gap: [{ pts, count }]
  let gapTimer = null;

  const closeGap = () => {
    timers.clearTimeout(gapTimer);
    gapTimer = null;
  };

  // Steps waiting behind a gap that now follow on.
  const drain = () => {
    pending = pending
      .filter((p) => p.pts > state.pts)
      .sort((a, b) => a.pts - b.pts);
    while (
      pending.length > 0 &&
      pending[0].pts - pending[0].count === state.pts
    ) {
      state.pts = pending.shift().pts;
    }
    if (pending.length === 0) {
      closeGap();
    }
  };

  const step = (update) => {
    const next = ptsStep(update);
    if (!next || !state) {
      return;
    }
    if (state.pts + next.count > next.pts) {
      return; // already applied
    }
    if (state.pts + next.count === next.pts) {
      state.pts = next.pts;
      drain();
      onMove();
      return;
    }
    pending.push(next);
    gapTimer ??= later(
      timers,
      () => {
        gapTimer = null;
        if (pending.length > 0) {
          onGap();
        }
      },
      gapMs
    );
  };

  return {
    step,
    get: () => state,
    set: (next) => {
      state = next ? stateOf(next) : null;
      if (state) {
        drain();
      }
    },
    patch: (fields) => {
      state = { ...state, ...fields };
      drain();
    },
    pending: () => pending.length,
    reset: () => {
      pending = [];
      closeGap();
    },
  };
};

// After a failure: again in 1 s, doubling up to 60 s (TDLib's backoff).
const createBackoff = (timers) => {
  let ms = 0;
  let timer = null;
  const stop = () => {
    timers.clearTimeout(timer);
    timer = null;
  };
  return {
    reset: () => {
      ms = 0;
    },
    later: (fn) => {
      ms = Math.min(ms ? ms * 2 : FIRST_RETRY_MS, MAX_RETRY_MS);
      stop();
      timer = later(
        timers,
        () => {
          timer = null;
          fn();
        },
        ms
      );
    },
    stop,
  };
};

const RESULT_UPDATES = new Set(['Updates', 'UpdatesCombined']);

/** The updates inside Telegram's answer to one of our requests. */
const updatesOfResult = (result) => {
  if (RESULT_UPDATES.has(result?.className)) {
    return result.updates ?? [];
  }
  return [result?.className === 'UpdateShort' ? result.update : result];
};

// A difference's messages and updates, through the live handler.
const replay = async ({ client, handle, resync }, result) => {
  const entities = entitiesOf(result);
  const updates = [
    ...(result.newMessages ?? []).map((message) => ({
      className: 'UpdateNewMessage',
      message,
    })),
    ...(result.otherUpdates ?? []),
  ];
  for (const update of updates) {
    if (update?.className === 'UpdateChannelTooLong') {
      await resync('channel-too-long');
      continue;
    }
    update._entities = entities;
    await handle(client, update);
  }
  return updates.length;
};

// updates.getDifference until Telegram says we are up to date; returns
// how many updates it replayed.
const fetchDifference = async ({ client, Api, counter, feed, resync }) => {
  let fed = 0;
  for (let slice = 0; slice < MAX_SLICES; slice += 1) {
    const { pts, qts, date } = counter.get();
    const result = await client.invoke(
      new Api.updates.GetDifference({ pts, qts, date })
    );
    const kind = result?.className;
    if (kind === 'updates.DifferenceEmpty') {
      counter.patch({ date: Number(result.date), seq: Number(result.seq) });
      break;
    }
    if (kind === 'updates.DifferenceTooLong') {
      // Too much to replay: take the new number and re-read the chats.
      counter.patch({ pts: Number(result.pts) });
      await resync('difference-too-long');
      break;
    }
    fed += await feed(result);
    if (kind !== 'updates.DifferenceSlice') {
      counter.set(result.state);
      break;
    }
    counter.set(result.intermediateState);
  }
  return fed;
};

/**
 * One account's catch-up.
 *   handle(client, update)  the live handler (telegram-account-live.js)
 *   resync(reason)          re-read the dialogs (channels, a long gap)
 *   importer()              resolves { Api } (the `telegram` package)
 *   onConnection(state)     GramJS's connection: 1, 0 or -1
 */
export const createTelegramCatchUp = ({
  store,
  handle,
  resync = async () => {},
  importer,
  log = () => {},
  onConnection = () => {},
  gapMs = GAP_MS,
  timers = globalThis,
}) => {
  let client = null;
  let account = null;
  let saveTimer = null;
  const backoff = createBackoff(timers);
  let running = null;
  let again = false;
  let connection = null;

  const save = async () => {
    timers.clearTimeout(saveTimer);
    saveTimer = null;
    const state = counter.get();
    if (state && account) {
      await store.put({
        id: TELEGRAM_STATE_ID,
        tokens: ['state', 'telegram'],
        kind: 'state',
        source: 'telegram',
        account,
        ...state,
      });
    }
  };

  const counter = createPtsCounter({
    gapMs,
    timers,
    onGap: () => run('gap').catch(() => {}),
    onMove: () => {
      saveTimer ??= later(timers, () => save().catch(() => {}), SAVE_MS);
    },
  });

  const feed = (result) => replay({ client, handle, resync }, result);

  const difference = async (reason) => {
    const { Api } = await importer();
    if (!counter.get()) {
      // A new account: start from now (the dialog sync reads the past).
      counter.set(await client.invoke(new Api.updates.GetState()));
      await save();
      return;
    }
    const fed = await fetchDifference({ client, Api, counter, feed, resync });
    await save();
    log({ event: 'telegram_catch_up', reason, updates: fed });
  };

  const once = async (reason) => {
    try {
      await difference(reason);
      backoff.reset();
      return true;
    } catch (error) {
      log({
        level: 'error',
        event: 'telegram_catch_up_failed',
        reason,
        error: error.message,
      });
      backoff.later(() => run(reason).catch(() => {}));
      return false;
    }
  };

  /** Catch up now (one at a time; a call during a run runs once more). */
  const run = (reason = 'manual') => {
    if (!client) {
      return Promise.resolve();
    }
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
      } while ((await once(reason)) && again);
    })().finally(() => {
      running = null;
    });
    return running;
  };

  /** Every update the client receives (registered by `attach`). */
  const observe = (update) => {
    const linked = connectionStateOf(update);
    if (linked !== null) {
      const was = connection;
      connection = linked;
      onConnection(linked);
      if (linked === 1 && was !== null && was !== 1) {
        run('reconnect').catch(() => {});
      }
      return;
    }
    const kind = update?.className;
    if (kind === 'UpdatesTooLong') {
      run('too-long').catch(() => {});
    } else if (kind === 'UpdateChannelTooLong') {
      Promise.resolve(resync('channel-too-long')).catch(() => {});
    } else {
      counter.step(update);
    }
  };

  /** Telegram's answer to one of our requests (a send, a read). */
  const observeResult = (result) => {
    for (const update of updatesOfResult(result)) {
      counter.step(update);
    }
  };

  /**
   * A freshly connected client of account `me`: listen, then catch up
   * from the saved number (or take the current one for a new account).
   */
  const attach = async (next, me) => {
    client = next;
    account = me?.id ? String(me.id) : null;
    // Connected before this handler was added, so GramJS's own
    // "connected" went by unseen.
    connection = 1;
    onConnection(1);
    counter.reset();
    if (typeof next?.addEventHandler === 'function') {
      next.addEventHandler(observe);
    }
    const saved = await store.get(TELEGRAM_STATE_ID);
    counter.set(
      saved && saved.account === account && Number.isFinite(saved.pts)
        ? saved
        : null
    );
    return run('start');
  };

  const stop = async () => {
    backoff.stop();
    counter.reset();
    const flush = saveTimer ? save() : Promise.resolve();
    client = null;
    await flush;
  };

  return { attach, observe, observeResult, run, stop, state: counter.get };
};
