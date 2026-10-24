/**
 * VK's official Long Poll (R-Z8), for both kinds of token.
 *
 *  - A USER token uses `messages.getLongPollServer` (lp_version 3) and the
 *    URL `https://<server>?act=a_check&key&ts&wait=25&mode=2&version=3`.
 *    A new (4) or edited (5) message event names a message id; the message is
 *    then read with `messages.getById` (extended, so senders and chats have
 *    names). Typing events (61, 62, 63) become `typing` links.
 *  - A COMMUNITY token uses Bots Long Poll: `groups.getLongPollServer`, then
 *    `message_new` / `message_edit` / `message_reply` / `message_typing_state`
 *    events that carry the message itself.
 *  - `failed` answers follow the VK docs: 1 = events lost, take the `ts` it
 *    gives; 2 = the key expired, ask for a new key and keep `ts`; 3 = the
 *    information was lost, ask for key and `ts` again. After 1 and 3 events
 *    may be missing, so the conversations are read once to catch up.
 *  - The `ts` cursor is saved (pull-state:vk) only AFTER the messages of that
 *    batch were written to the store; a failed write leaves it, so the batch
 *    is read again.
 *  - In the background loop an error backs off (5 s doubling to 5 min; a
 *    token VK refuses waits the longest); nothing is thrown out of it.
 */

import { putAll } from '../storage/universal.js';
import { stampSourceLink } from './index.js';
import { vkLinksOf, vkMessageLink, vkTypingFromUpdate } from './vk.js';
import { savePullState } from './pull-runner.js';
import { codedError, timedRequest } from './http.js';

const SOURCE = 'vk';
export const PEOPLE = 'first_name,last_name,domain,screen_name';
// Codes after which a retry is pointless for a while: the token is refused.
const AUTH_CODES = new Set([5, 7, 15, 17, 27, 28]);

// An idle wait never keeps the process alive, and `stop` cancels it.
const pauses = new Map();
const pause = (ms) =>
  new Promise((resolve) => {
    const timer = globalThis.setTimeout(() => {
      pauses.delete(timer);
      resolve();
    }, ms);
    timer.unref?.();
    pauses.set(timer, resolve);
  });
// Waiting loops wake up and see `looping` is off.
const cancelPauses = () => {
  for (const [timer, resolve] of pauses) {
    globalThis.clearTimeout(timer);
    resolve();
  }
  pauses.clear();
};

export const stamp = (links) =>
  links.map((link) => stampSourceLink(link, SOURCE));

export const asList = (value) =>
  Array.isArray(value) ? value : (value?.groups ?? value?.items ?? []);

// A user token answers users.get with the user; a community token answers [].
export const detectMode = async (call) => {
  let me = [];
  try {
    me = await call('users.get');
  } catch (error) {
    if (Number(error.vkCode) !== 27) {
      throw error;
    }
  }
  if (Array.isArray(me) && me.length > 0) {
    return { mode: 'user', selfId: me[0].id };
  }
  const group = asList(await call('groups.getById'))[0];
  if (!group?.id) {
    throw codedError(
      'this VK token is neither a user nor a community token',
      'vk-token'
    );
  }
  return { mode: 'community', groupId: group.id };
};

const serverOf = (call, state) =>
  state.mode === 'community'
    ? call('groups.getLongPollServer', { group_id: state.groupId })
    : call('messages.getLongPollServer', { need_pts: 1, lp_version: 3 });

export const pollUrl = (state, session, wait) => {
  const base = /^https?:\/\//.test(session.server)
    ? session.server
    : `https://${session.server}`;
  const url = new URL(base);
  url.searchParams.set('act', 'a_check');
  url.searchParams.set('key', session.key);
  url.searchParams.set('ts', String(session.ts));
  url.searchParams.set('wait', String(wait));
  if (state.mode !== 'community') {
    url.searchParams.set('mode', '2');
    url.searchParams.set('version', '3');
  }
  return url.toString();
};

// Message ids and typing links out of one batch of user long poll updates.
const userBatch = (updates, now) => {
  const ids = new Set();
  const typing = [];
  for (const update of updates) {
    if (Array.isArray(update) && (update[0] === 4 || update[0] === 5)) {
      ids.add(update[1]);
    } else {
      typing.push(...vkTypingFromUpdate(update, { now }));
    }
  }
  return { ids: [...ids], typing, messages: [] };
};

const COMMUNITY_MESSAGES = new Set([
  'message_new',
  'message_edit',
  'message_reply',
]);

const communityBatch = (updates, now) => {
  const messages = [];
  const typing = [];
  for (const update of updates) {
    if (COMMUNITY_MESSAGES.has(update?.type)) {
      const message = update.object?.message ?? update.object;
      if (message?.peer_id) {
        messages.push(message);
      }
    } else {
      typing.push(...vkTypingFromUpdate(update, { now }));
    }
  }
  return { ids: [], typing, messages };
};

const personName = (p) =>
  [p.first_name, p.last_name].filter(Boolean).join(' ') || p.name || null;

// Names of community-poll senders (people, and the community itself for
// its own replies); a failure only leaves them unnamed.
const peopleNames = async (live, ids) => {
  if (ids.length === 0) {
    return [];
  }
  const people = await live.call('users.get', {
    user_ids: ids.join(','),
    fields: PEOPLE,
  });
  return asList(people).map((p) => [String(p.id), personName(p)]);
};

const communityNames = async (live, ids) => {
  if (ids.length === 0) {
    return [];
  }
  const got = await live.call('groups.getById', {
    group_ids: ids.map((id) => -id).join(','),
  });
  return asList(got?.groups ?? got).map((g) => [`-${g.id}`, g.name ?? null]);
};

const namesOf = async (live, messages) => {
  const ids = [...new Set(messages.map((m) => Number(m.from_id)))];
  const named = await Promise.all([
    peopleNames(
      live,
      ids.filter((id) => id > 0)
    ).catch(() => []),
    communityNames(
      live,
      ids.filter((id) => id < 0)
    ).catch(() => []),
  ]);
  return new Map(named.flat());
};

const linksOfBatch = async (live, batch) => {
  const links = [];
  if (batch.ids.length > 0) {
    const got = await live.call('messages.getById', {
      message_ids: batch.ids.join(','),
      extended: 1,
      fields: PEOPLE,
    });
    links.push(...vkLinksOf(got));
  }
  if (batch.messages.length > 0) {
    const names = await namesOf(live, batch.messages);
    links.push(
      ...batch.messages.map((m) =>
        vkMessageLink(m, names.get(String(m.from_id)))
      )
    );
  }
  return links;
};

const failureDelay = (error, fails) =>
  AUTH_CODES.has(Number(error?.vkCode)) || error?.code === 'captcha'
    ? 5 * 60_000
    : Math.min(5 * 60_000, 5000 * 2 ** Math.min(fails - 1, 6));

/**
 * `context()` -> `{ state, live }` (the saved cursor and the VK client);
 * `catchUp(live)` reads the conversations once (after lost events);
 * `ready()` tells whether a token is saved.
 */
export const createVkLongPoll = ({
  store,
  context,
  catchUp,
  ready,
  fetchImpl = globalThis.fetch,
  wait = 25,
  log = null,
  sleep = pause,
  now = Date.now,
  idleMs = 30_000,
  // The first poll waits a little after the server starts listening.
  startDelayMs = 5000,
}) => {
  let session = null;
  let looping = false;
  // Each start's loop; a stopped one ends even if another has started.
  let generation = 0;
  let loopDone = Promise.resolve();
  let abort = new AbortController();

  const request = (state, seconds) =>
    timedRequest(
      fetchImpl,
      pollUrl(state, session, seconds),
      {
        method: 'GET',
        signal: globalThis.AbortSignal.any([
          abort.signal,
          globalThis.AbortSignal.timeout((seconds + 20) * 1000),
        ]),
      },
      { retries: 0 },
      async (res) => {
        if (!res.ok) {
          throw codedError(
            `VK long poll answered HTTP ${res.status}`,
            'longpoll-http'
          );
        }
        return res.json();
      }
    );

  // `failed` 1, 2, 3 (VK docs); true when events may have been lost.
  const recover = async (failed, answer, state, live) => {
    if (failed === 1) {
      session = { ...session, ts: answer.ts, resumed: true };
      return true;
    }
    if (failed === 2) {
      const fresh = await serverOf(live.call, state);
      session = { ...fresh, ts: session.ts, resumed: true };
      return false;
    }
    if (failed === 3) {
      session = { ...(await serverOf(live.call, state)), resumed: true };
      return true;
    }
    throw codedError(
      `VK long poll answered failed=${failed}`,
      'longpoll-failed'
    );
  };

  const step = async ({ wait: seconds = wait } = {}) => {
    abort = new AbortController();
    const { state, live } = await context();
    session ??= await serverOf(live.call, state);
    if (state.ts !== undefined && state.ts !== null && !session.resumed) {
      session = { ...session, ts: state.ts, resumed: true };
    }
    const answer = await request(state, seconds);
    if (answer.failed) {
      const failed = Number(answer.failed);
      if (await recover(failed, answer, state, live)) {
        await catchUp(live);
      }
      await savePullState(store, SOURCE, { ts: String(session.ts) });
      return { ok: true, failed, imported: 0 };
    }
    const updates = answer.updates ?? [];
    const read = state.mode === 'community' ? communityBatch : userBatch;
    const batch = read(updates, now());
    const links = await linksOfBatch(live, batch);
    await putAll(store, stamp(links));
    await putAll(store, batch.typing);
    // The cursor moves only now that the batch is stored.
    await savePullState(store, SOURCE, { ts: String(answer.ts) });
    session = { ...session, ts: answer.ts };
    return { ok: true, updates: updates.length, imported: links.length };
  };

  const loop = async (gen) => {
    let fails = 0;
    const live = () => looping && gen === generation;
    await sleep(startDelayMs);
    while (live()) {
      try {
        if (await ready()) {
          const started = now();
          const done = await step();
          fails = 0;
          // A poll that came back at once with nothing is not repeated at once.
          if (!done.updates && now() - started < 1000) {
            await sleep(1000);
          }
        } else {
          await sleep(idleMs);
        }
      } catch (error) {
        if (!live()) {
          return;
        }
        fails += 1;
        session = null;
        log?.({
          level: 'warn',
          event: 'vk_longpoll_failed',
          code: error.code ?? error.vkCode ?? null,
        });
        if (error.code === 'captcha') {
          // Only the user can solve it, in the app; this loop just waits
          // and says so (R-Z20).
          await savePullState(store, SOURCE, {
            lastError: {
              code: 'captcha',
              at: new Date(now()).toISOString(),
              needsAttention: true,
            },
          }).catch(() => {});
        }
        await sleep(failureDelay(error, fails));
      }
    }
  };

  return {
    step,
    get running() {
      return looping;
    },
    /** Start the live updates (call after the server listens). */
    start() {
      if (!looping) {
        looping = true;
        generation += 1;
        loopDone = loop(generation).catch(() => {});
      }
    },
    /** Resolves once a batch in flight is stored (no write after close). */
    stop() {
      looping = false;
      abort.abort();
      cancelPauses();
      return loopDone;
    },
  };
};
