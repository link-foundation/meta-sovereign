import { randomUUID } from 'node:crypto';
import { connect, runIn } from './telegram-stickers.js';
import { greetingStickerOwner } from './telegram-greeting-stickers-cache.js';
import { followFailure } from './telegram-follow-shape.js';

const known = new Set([
  'bad-request',
  'stopped',
  'cancelled',
  'busy',
  'plan-expired',
  'account-changed',
  'user-account-required',
  'target-unavailable',
  'target-changed',
  'membership-unavailable',
  'preferences-unavailable',
  'invitation-required',
  'not-member',
  'pagination-stalled',
]);
export const followReadFailure = (error) => ({
  ok: false,
  code: known.has(error?.code) ? error.code : 'read-failed',
});
export const createFollowRuntime = (env, context) => {
  const plans = new Map();
  const pending = new Set();
  let stopped = false;
  let revision = 0;
  const cancelled = (version) =>
    stopped ? 'stopped' : version !== revision ? 'cancelled' : null;
  const owned = (use) => {
    const version = revision;
    const task = Promise.resolve()
      .then(() => {
        if (cancelled(version)) {
          throw followFailure(cancelled(version));
        }
        return use(version);
      })
      .catch(followReadFailure);
    pending.add(task);
    task.finally(() => pending.delete(task));
    return task;
  };
  const connectedRead = async (version, use) => {
    const c = await connect(env, context.userClient);
    if (!c) {
      throw followFailure('user-account-required');
    }
    let actual;
    let queuedError;
    // Own the complete queued read, including identity checks, after a deadline.
    await runIn(env, `follow:read:${randomUUID()}`, () => {
      actual = Promise.resolve().then(async () => {
        if (cancelled(version)) {
          throw followFailure(cancelled(version));
        }
        const owner = await greetingStickerOwner({}, c);
        const result = await use(c, owner);
        if (cancelled(version)) {
          throw followFailure(cancelled(version));
        }
        if (
          (await greetingStickerOwner({}, c)) !== owner ||
          (await context.userClient()) !== c.client
        ) {
          throw followFailure('account-changed');
        }
        return result;
      });
      return actual;
    }).catch((error) => {
      queuedError = error;
    });
    if (!actual) {
      throw queuedError ?? followFailure('read-failed');
    }
    return actual;
  };
  env.followTelegramStop = async () => {
    stopped = true;
    plans.clear();
    await Promise.allSettled([...pending]);
  };
  return {
    plans,
    owned,
    connectedRead,
    cancelled,
    writing: false,
    cancel: async (body = {}) => {
      if (body?.planId !== undefined) {
        if (typeof body.planId !== 'string') {
          return { ok: false, code: 'bad-request' };
        }
        plans.delete(body.planId);
        return { ok: true };
      }
      revision += 1;
      plans.clear();
      return { ok: true };
    },
  };
};
