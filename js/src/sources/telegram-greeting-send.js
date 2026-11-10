import { randomUUID } from 'node:crypto';
import { connect, runIn } from './telegram-stickers.js';
import { greetingStickerOwner } from './telegram-greeting-stickers-cache.js';
import {
  greetingFailure,
  greetingSendRequest,
  resolveGreetingTarget,
} from './telegram-greeting-target.js';
import {
  greetingDeliveryState,
  deliverGreeting,
} from './telegram-greeting-delivery.js';
import { sendGreeting } from './telegram-greeting-transport.js';

const known = new Set([
  'bad-request',
  'busy',
  'stopped',
  'cancelled',
  'plan-expired',
  'account-changed',
  'user-account-required',
  'target-unavailable',
  'target-changed',
  'bot-required',
  'sticker-unavailable',
]);
const failure = (error) => ({
  ok: false,
  code: known.has(error?.code) ? error.code : 'read-failed',
});
export const createGreetingSends = (env, context, { now = Date.now } = {}) => {
  const plans = new Map();
  const pending = new Set();
  let stopped = false;
  let revision = 0;
  let sending = false;
  const owned = (use) => {
    if (stopped) {
      return Promise.resolve({ ok: false, code: 'stopped' });
    }
    const version = revision;
    const task = Promise.resolve()
      .then(() => {
        if (stopped || version !== revision) {
          throw greetingFailure(stopped ? 'stopped' : 'cancelled');
        }
        return use(version);
      })
      .catch(failure);
    pending.add(task);
    task.finally(() => pending.delete(task));
    return task;
  };
  const preview = async (body, version) => {
    const options = greetingSendRequest(body);
    if (!options) {
      throw greetingFailure('bad-request');
    }
    const c = await connect(env, context.userClient);
    if (!c) {
      throw greetingFailure('user-account-required');
    }
    const owner = await greetingStickerOwner(env, c);
    const { target } = await runIn(
      env,
      `greeting-send:target:${randomUUID()}`,
      () => resolveGreetingTarget(c, options.chat, options.operation)
    );
    const sticker =
      options.operation === 'greeting-sticker'
        ? await context.greetingSticker(c, options.sticker)
        : null;
    if (options.operation === 'greeting-sticker' && !sticker) {
      throw greetingFailure('sticker-unavailable');
    }
    if (stopped || (await greetingStickerOwner(env, c)) !== owner) {
      throw greetingFailure(stopped ? 'stopped' : 'account-changed');
    }
    const plan = {
      id: randomUUID(),
      owner,
      target,
      sticker,
      selector: options.chat,
      operation: options.operation,
      expires: now() + 5 * 60_000,
    };
    const delivery = await greetingDeliveryState(env.store, plan, now);
    if (stopped || version !== revision) {
      throw greetingFailure(stopped ? 'stopped' : 'cancelled');
    }
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
      owner,
      target,
      sticker,
      operation: plan.operation,
      expiresAt: new Date(plan.expires).toISOString(),
      willSend: delivery.status === 'ready',
      delivery,
    });
  };
  const apply = async (body = {}, version) => {
    if (body.confirm !== true || typeof body.planId !== 'string') {
      throw greetingFailure('bad-request');
    }
    if (sending) {
      throw greetingFailure('busy');
    }
    const plan = plans.get(body.planId);
    plans.delete(body.planId);
    if (!plan || plan.expires <= now()) {
      throw greetingFailure('plan-expired');
    }
    sending = true;
    try {
      const result = await deliverGreeting(
        env,
        plan,
        (draft) =>
          sendGreeting(env, context, plan, draft, () =>
            stopped ? 'stopped' : version !== revision ? 'cancelled' : null
          ),
        now
      );
      return { ok: result.status === 'sent', planId: plan.id, ...result };
    } finally {
      sending = false;
    }
  };
  env.greetingSendStop = async () => {
    stopped = true;
    plans.clear();
    await Promise.allSettled([...pending]);
  };
  return {
    greetingSendPreview: (body = {}) =>
      owned((version) => preview(body, version)),
    greetingSendApply: (body = {}) => owned((version) => apply(body, version)),
    greetingSendCancel: async () => {
      revision += 1;
      plans.clear();
      return { ok: true };
    },
  };
};
