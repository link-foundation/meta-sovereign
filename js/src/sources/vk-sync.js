/**
 * Keeping VK current (R-Z8): the "Fetch now" pull, history paging, and the
 * Long Poll of ./vk-longpoll.js, all through the method API of ./vk.js.
 *
 * A fetch reads the newest conversations (with names), then pages a few
 * chats' history back with `messages.getHistory` offsets. The offset of each
 * chat is saved (pull-state:vk `backfill`) only after that page was stored,
 * so a failed write is read again, and a finished chat is not read twice.
 * When the Long Poll is not running, one poll with `wait=0` drains pending
 * events too. A user token is held to 3 requests a second, a community token
 * to 20 (./vk-limits.js); error 6 backs off.
 *
 * `older` (./vk-older.js) is scroll-back for a VK chat (R-Z20).
 */

import { storeSourceMessages } from './store-messages.js';
import { liveOptionsFrom } from './index.js';
import { createVkLive } from './vk.js';
import { VK_COMMUNITY_RPS, VK_USER_RPS } from './vk-limits.js';
import { loadPullState, savePullState } from './pull-runner.js';
import { codedError } from './http.js';
import { createVkLongPoll, detectMode, stamp } from './vk-longpoll.js';
import { createVkOlder } from './vk-older.js';
import { createVkLiveHistory } from './vk-live-history.js';

const SOURCE = 'vk';
const BACKFILL_CHATS = 3;
const BACKFILL_PAGES = 2;

export const createVkInbox = ({
  store,
  fetchImpl = globalThis.fetch,
  baseUrl,
  apiVersion,
  sleep,
  // Tests: a faster pace than VK's real limits.
  requestsPerSecond: pace = null,
  ...pollOptions
} = {}) => {
  let cached = null;

  const tokenOf = async () => (await liveOptionsFrom(store, SOURCE)).token;
  const ready = async () => Boolean(await tokenOf());

  const liveFor = (token, mode) => {
    const requestsPerSecond =
      pace ?? (mode === 'community' ? VK_COMMUNITY_RPS : VK_USER_RPS);
    if (
      cached?.token !== token ||
      cached.requestsPerSecond !== requestsPerSecond
    ) {
      const live = createVkLive({
        token,
        fetchImpl,
        baseUrl,
        apiVersion,
        requestsPerSecond,
        sleep,
      });
      cached = { token, requestsPerSecond, live, verified: false };
    }
    return cached.live;
  };

  const assertCurrent = async (live) => {
    if (cached?.live !== live || cached.token !== (await tokenOf())) {
      throw codedError(
        'VK credentials changed during the read',
        'vk-credential-changed'
      );
    }
  };

  // Recheck identity once per native client, including after token replacement.
  const context = async () => {
    const token = await tokenOf();
    if (!token) {
      throw codedError('VK is not connected: save its token', 'not-connected');
    }
    let state = await loadPullState(store, SOURCE);
    let live = liveFor(token, state.mode);
    if (!cached.verified) {
      const found = await detectMode(live.call);
      await assertCurrent(live);
      const changed =
        state.mode &&
        (state.mode !== found.mode ||
          (Number.isSafeInteger(state.selfId) &&
            state.selfId !== found.selfId) ||
          (Number.isSafeInteger(state.groupId) &&
            state.groupId !== found.groupId));
      state = await savePullState(store, SOURCE, {
        selfId: null,
        groupId: null,
        ...found,
        ...(changed ? { ts: null, backfill: {} } : {}),
      });
      live = liveFor(token, found.mode);
      cached.verified = true;
    }
    return { state, live };
  };

  // The newest message of each conversation, stored.
  const catchUp = async (live) => {
    const result = await live.pullMessages({ count: 50 });
    await storeSourceMessages(store, SOURCE, stamp(result.links));
    return result;
  };

  const longpoll = createVkLongPoll({
    store,
    context,
    catchUp,
    ready,
    assertCurrent,
    fetchImpl,
    sleep,
    beforeMessages: createVkLiveHistory({ store, assertCurrent }),
    ...pollOptions,
  });

  const backfill = async (live, result) => {
    const state = await loadPullState(store, SOURCE);
    const done = { ...state.backfill };
    const peers = (result.raw?.items ?? [])
      .map((item) => item.conversation?.peer?.id)
      .filter((id) => id !== undefined && done[id] !== 'done')
      .slice(0, BACKFILL_CHATS);
    let imported = 0;
    for (const peerId of peers) {
      const page = await live.pullHistory({
        peerId,
        offset: Number(done[peerId] ?? 0),
        maxPages: BACKFILL_PAGES,
      });
      await storeSourceMessages(store, SOURCE, stamp(page.links));
      imported += page.links.length;
      done[peerId] = page.nextOffset ?? 'done';
      // Saved after the write: a failed write is read again.
      await savePullState(store, SOURCE, { backfill: { ...done } });
    }
    return imported;
  };

  const older = createVkOlder({ store, context });

  /** "Fetch now" and the periodic pull: chats, more history, pending events. */
  const fetch = async () => {
    const { live } = await context();
    const result = await catchUp(live);
    let imported = result.links.length + (await backfill(live, result));
    if (!longpoll.running) {
      imported += (await longpoll.step({ wait: 0 })).imported ?? 0;
    }
    return { imported };
  };

  return {
    ready,
    fetch,
    older,
    step: longpoll.step,
    start: longpoll.start,
    stop: longpoll.stop,
    get running() {
      return longpoll.running;
    },
  };
};
