import { DAY_MS, guardedSend } from '../automation/outbox.js';
import { missingMessageReceipt } from './telegram-message-receipt.js';

const locks = new WeakMap();
const intentId = (plan) =>
  `telegram-greeting-intent:${plan.owner}:${plan.operation}:${plan.target.chat}`;
const locked = (store) => {
  if (!locks.has(store)) {
    locks.set(store, new Set());
  }
  return locks.get(store);
};
// The intent survives plan expiry and restarts. An unresolved outcome is never
// overwritten by a fresh preview, even if it selected another sticker.
export const greetingDeliveryState = async (store, plan, now) => {
  const previous = await store.get(intentId(plan));
  if (!previous) {
    return { status: 'ready' };
  }
  const outbox = previous.outbox ? await store.get(previous.outbox) : null;
  if (!outbox || ['sending', 'unknown'].includes(outbox.status)) {
    return {
      status: 'unknown',
      code: 'previous-outcome-unknown',
      outbox: previous.outbox ?? null,
    };
  }
  if (outbox.status === 'sent' && plan.operation === 'greeting-sticker') {
    const at = Date.parse(outbox.at);
    if (!Number.isFinite(at) || now() - at < DAY_MS) {
      return {
        status: 'skipped',
        code: 'already-greeted',
        outbox: outbox.id,
        nextAt: Number.isFinite(at)
          ? new Date(at + DAY_MS).toISOString()
          : null,
      };
    }
  }
  return { status: 'ready' };
};
const restoreIntent = async (store, id, previous) => {
  if (previous) {
    await store.put(previous);
  } else {
    await store.delete(id);
  }
};
const deliver = async (env, plan, send, now) => {
  const before = await greetingDeliveryState(env.store, plan, now);
  if (before.status !== 'ready') {
    return before;
  }
  const id = intentId(plan);
  const previous = await env.store.get(id);
  const key = `telegram-greeting:${plan.owner}:${plan.id}:${plan.target.chat}`;
  const intent = {
    id,
    kind: 'telegram-greeting-intent',
    source: 'telegram',
    owner: plan.owner,
    operation: plan.operation,
    chat: plan.target.chat,
    outbox: `outbox:${key}`,
  };
  await env.store.put(intent);
  const outcome = await guardedSend({
    store: env.store,
    kind: 'telegram-greeting',
    owner: plan.owner,
    key,
    draft: {
      source: 'telegram',
      chat: plan.target.chat,
      text: plan.operation === 'bot-start' ? '/start' : 'Greeting sticker',
    },
    userConfirmed: true,
    clock: () => new Date(now()),
    log: () =>
      env.log?.({ level: 'debug', event: 'greeting_outbox_write_failed' }),
    send: async (draft) => {
      const result = await send(draft);
      const id = Number(result?.messageId);
      if (!result?.ok || !Number.isInteger(id) || id < 1 || id > 2147483647) {
        throw missingMessageReceipt();
      }
      return result;
    },
  });
  if (!outcome.outbox) {
    await restoreIntent(env.store, id, previous);
  }
  if (outcome.status === 'sent') {
    // A storage failure after Telegram's acknowledgement cannot undo delivery.
    await env.store
      .put({
        ...intent,
        messageId: outcome.result.messageId,
        sentAt: outcome.outbox.at,
      })
      .catch(() => {
        env.log?.({ level: 'debug', event: 'greeting_receipt_write_failed' });
      });
  }
  return {
    status: outcome.status,
    code: outcome.code ?? null,
    outbox: outcome.outbox?.id ?? null,
    messageId: outcome.result?.messageId ?? null,
  };
};
export const deliverGreeting = async (env, plan, send, now = Date.now) => {
  const active = locked(env.store);
  const key = intentId(plan);
  if (active.has(key)) {
    return { status: 'unknown', code: 'send-in-progress' };
  }
  active.add(key);
  try {
    return await deliver(env, plan, send, now);
  } finally {
    active.delete(key);
  }
};
