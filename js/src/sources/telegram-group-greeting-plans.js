import { randomUUID } from 'node:crypto';
import { connect } from './telegram-stickers.js';
import { greetingStickerOwner } from './telegram-greeting-stickers-cache.js';
import { greetingDeliveryState } from './telegram-greeting-delivery.js';
import { greetingFailure } from './telegram-greeting-target.js';
import {
  groupGreetingOptions,
  groupGreetingExclusion,
} from './telegram-group-greeting-shape.js';

export const recipientGreetingPlan = (plan, user) => ({
  id: plan.id,
  owner: plan.owner,
  operation: 'greeting-sticker',
  selector: user.id,
  target: {
    chat: user.id,
    kind: 'User',
    bot: false,
    name:
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.username ||
      user.id,
  },
  sticker: user.sticker,
});
const exclusion = async (env, plan, user, now) => {
  const reason = user.sources.includes('participant')
    ? groupGreetingExclusion(user, plan.owner)
    : 'not-participant';
  if (reason) {
    return reason;
  }
  const state = await greetingDeliveryState(
    env.store,
    recipientGreetingPlan(plan, user),
    now
  );
  return state.status === 'ready' ? null : state.code;
};
const selectUsers = async ({
  env,
  context,
  c,
  plan,
  collection,
  ensure,
  now,
}) => {
  const skipped = {};
  let eligible = 0;
  for (const user of collection.users.values()) {
    ensure();
    const reason = await exclusion(env, plan, user, now);
    if (reason) {
      skipped[reason] = (skipped[reason] ?? 0) + 1;
      continue;
    }
    eligible += 1;
    if (!plan.options.limit || plan.users.length < plan.options.limit) {
      const sticker = await context.greetingSticker(c, plan.options.sticker);
      if (!sticker) {
        throw greetingFailure('sticker-unavailable');
      }
      const { id, firstName, lastName, username } = user;
      plan.users.push({ id, firstName, lastName, username, sticker });
    }
  }
  return { eligible, skipped };
};
export const createGroupGreetingPlans = (env, context, runtime, now) => {
  const plans = new Map();
  const preview = (body = {}) => {
    const options = groupGreetingOptions(body);
    if (!options || typeof body.jobId !== 'string') {
      return Promise.resolve({ ok: false, code: 'bad-request' });
    }
    return runtime.start(async (ensure) => {
      const { job, collection } = runtime.state;
      if (
        job?.id !== body.jobId ||
        job.kind !== 'scan' ||
        job.state !== 'done' ||
        job.options.greetingGroup !== true
      ) {
        return { ok: false, code: 'group-scan-required' };
      }
      const c = await connect(env, context.userClient);
      ensure();
      if (!c || (await greetingStickerOwner(env, c)) !== job.meId) {
        throw greetingFailure('account-changed');
      }
      const plan = {
        id: randomUUID(),
        scanId: job.id,
        owner: job.meId,
        chat: job.chat,
        selector: job.selector,
        target: job.target,
        options,
        users: [],
        expires: now() + 5 * 60_000,
      };
      const { eligible, skipped } = await selectUsers({
        env,
        context,
        c,
        plan,
        collection,
        ensure,
        now,
      });
      ensure();
      if ((await greetingStickerOwner(env, c)) !== job.meId) {
        throw greetingFailure('account-changed');
      }
      ensure();
      for (const [id, old] of plans) {
        if (old.expires <= now()) {
          plans.delete(id);
        }
      }
      if (plans.size >= 3) {
        plans.delete(plans.keys().next().value);
      }
      plans.set(plan.id, plan);
      return globalThis.structuredClone({
        ok: true,
        planId: plan.id,
        scanId: job.id,
        owner: plan.owner,
        target: plan.target,
        options,
        selected: plan.users.length,
        eligible,
        skipped,
        expiresAt: new Date(plan.expires).toISOString(),
        coverage: job.coverage,
        sample: plan.users.slice(0, 100),
      });
    });
  };
  return {
    preview,
    clear: () => plans.clear(),
    consume: (id) => {
      const plan = plans.get(id);
      plans.delete(id);
      return plan?.expires > now() && plan.scanId === runtime.state.job?.id
        ? plan
        : null;
    },
  };
};
