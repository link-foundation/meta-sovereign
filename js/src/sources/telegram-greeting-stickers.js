// Read-only discovery. Explicit refreshes never send messages or install sets.
import { randomUUID } from 'node:crypto';
import { connect } from './telegram-stickers.js';
import { stickerRefreshOptions } from './telegram-greeting-stickers-shape.js';
import { fetchGreetingStickers } from './telegram-greeting-stickers-fetch.js';
import {
  createGreetingStickerCache,
  greetingStickerOwner,
} from './telegram-greeting-stickers-cache.js';

import { createGreetingStickerReads } from './telegram-greeting-stickers-read.js';

const snapshot = (job) => (job ? globalThis.structuredClone(job) : null);
const active = (job) => ['running', 'cancelling'].includes(job?.state);
const coverageOf = () =>
  Object.fromEntries(
    ['featured', 'masks', 'recent', 'faved'].map((name) => [
      name,
      { read: 0, complete: false, failures: 0, error: null },
    ])
  );
const codeOf = (error) =>
  ['account-changed', 'user-account-required', 'store-unavailable'].includes(
    error?.code
  )
    ? error.code
    : 'read-failed';
const executeRefresh = async (r, cache, previous, now) => {
  await fetchGreetingStickers(r);
  if (r.cancelled()) {
    r.job.state = 'cancelled';
    return;
  }
  if ((await greetingStickerOwner(r.env, r.c)) !== r.job.owner) {
    throw Object.assign(new Error('account-changed'), {
      code: 'account-changed',
    });
  }
  const complete = Object.values(r.job.coverage).every((part) => part.complete);
  const usable =
    Object.values(r.job.coverage).some((part) => part.complete) ||
    r.items.size > 0;
  if (!usable) {
    r.job.state = 'failed';
    return;
  }
  const items = complete ? r.items : new Map([...previous.items, ...r.items]);
  // Preserve known usable documents after a partial refresh, within the same
  // fixed cache bound. Coverage describes exactly what the refresh could read.
  while (items.size > 50_000) {
    items.delete(items.keys().next().value);
  }
  await cache.save(
    r.job.owner,
    items,
    r.job.coverage,
    new Date(now()).toISOString()
  );
  r.job.state = complete ? 'done' : 'partial';
};

export const createGreetingStickers = (
  env,
  { userClient, stickerLists },
  { now = () => Date.now() } = {}
) => {
  const cache = createGreetingStickerCache(env, stickerLists);
  let job = null;
  let starting = false;
  let stopped = false;
  let running = null;
  let cancelled = false;
  const starts = new Set();
  const context = async () => {
    const c = await connect(env, userClient);
    if (!c) {
      throw Object.assign(new Error('user-account-required'), {
        code: 'user-account-required',
      });
    }
    return { c, owner: await greetingStickerOwner(env, c) };
  };
  const publish = async () => {
    await env.store
      .put({
        ...snapshot(job),
        id: `telegram-greeting-stickers-job:${job.id}`,
        kind: 'telegram-greeting-stickers-job',
        source: 'telegram',
      })
      .catch(() => {
        throw Object.assign(new Error('store-unavailable'), {
          code: 'store-unavailable',
        });
      });
  };
  const begin = async (body = {}) => {
    const options = stickerRefreshOptions(body);
    if (!options) {
      return { ok: false, code: 'bad-request' };
    }
    if (stopped) {
      return { ok: false, code: 'stopped' };
    }
    if (starting || active(job)) {
      return { ok: false, code: 'busy' };
    }
    starting = true;
    cancelled = false;
    try {
      const { c, owner } = await context();
      const previous = await cache.load(owner);
      if (stopped) {
        return { ok: false, code: 'stopped' };
      }
      if (cancelled) {
        return { ok: false, code: 'cancelled' };
      }
      job = {
        id: randomUUID(),
        owner,
        options,
        state: 'running',
        phase: 'featured',
        startedAt: new Date(now()).toISOString(),
        documents: 0,
        rejected: 0,
        limited: false,
        coverage: coverageOf(),
      };
      await publish();
      const r = {
        env,
        c,
        job,
        items: new Map(),
        sets: new Set(),
        cancelled: () => cancelled,
        publish,
      };
      running = (async () => {
        try {
          await executeRefresh(r, cache, previous, now);
        } catch (error) {
          job.state = cancelled ? 'cancelled' : 'failed';
          job.code = codeOf(error);
        } finally {
          job.finishedAt = new Date(now()).toISOString();
          await publish();
        }
      })().catch(() => {
        job.state = 'failed';
        job.code = 'store-unavailable';
      });
      return { ok: true, job: snapshot(job) };
    } catch (error) {
      if (active(job)) {
        job.state = 'failed';
        job.code = codeOf(error);
      }
      return { ok: false, code: codeOf(error) };
    } finally {
      starting = false;
    }
  };
  const start = (body) => {
    const next = begin(body);
    starts.add(next);
    next.then(
      () => starts.delete(next),
      () => starts.delete(next)
    );
    return next;
  };
  const cancel = async () => {
    cancelled = true;
    if (active(job)) {
      job.state = 'cancelling';
      await publish();
    }
    return { ok: true };
  };
  const { status, select, again } = createGreetingStickerReads(
    env,
    cache,
    context,
    now,
    () => job
  );
  stickerLists.onAgain('greeting:', again);
  env.greetingStickersStop = async () => {
    stopped = true;
    await cancel().catch(() => {});
    await Promise.allSettled([...starts]);
    await running;
  };
  return {
    greetingStickersRefresh: start,
    greetingStickersStatus: status,
    greetingStickersCancel: cancel,
    select,
  };
};
