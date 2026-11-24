import { createHash } from 'node:crypto';
import { followTargetKey } from './telegram-follow-target.js';

const locks = new WeakMap();
const keyOf = (plan, phase) => {
  const target = createHash('sha256')
    .update(followTargetKey(plan.selector, plan.target))
    .digest('hex');
  return `telegram-follow-intent:${plan.owner}:${target}:${phase}`;
};
export const followPhaseState = async (store, plan, phase) => {
  const previous = await store.get(keyOf(plan, phase));
  return previous && ['sending', 'unknown', 'pending'].includes(previous.status)
    ? {
        status: previous.status,
        code: previous.code ?? 'previous-outcome-unknown',
      }
    : { status: 'ready' };
};
// The durable intent precedes the RPC. An uncertain result cannot be replayed
// by another preview or a restarted process. Confirmed observations may skip it.
export const journalFollowPhase = async (env, plan, phase, prepare, now) => {
  const id = keyOf(plan, phase);
  if (!locks.has(env.store)) {
    locks.set(env.store, new Set());
  }
  const active = locks.get(env.store);
  if (active.has(id)) {
    return { status: 'unknown', code: 'operation-in-progress' };
  }
  active.add(id);
  try {
    const prepared = await prepare();
    if (prepared.result) {
      return prepared.result;
    }
    const before = await followPhaseState(env.store, plan, phase);
    if (before.status !== 'ready') {
      return before;
    }
    const record = {
      id,
      kind: 'telegram-follow-intent',
      source: 'telegram',
      owner: plan.owner,
      chat: plan.target.chat,
      operation: plan.operation,
      phase,
      status: 'sending',
      at: new Date(now()).toISOString(),
      planId: plan.id,
    };
    await env.store.put(record);
    await env.store.flush?.();
    let answer;
    try {
      answer = await prepared.write();
    } catch {
      answer = { status: 'unknown', code: 'outcome-unknown' };
    }
    try {
      await env.store.put({
        ...record,
        ...answer,
        at: new Date(now()).toISOString(),
      });
      await env.store.flush?.();
    } catch {
      env.log?.({
        level: 'debug',
        event: 'telegram_follow_receipt_write_failed',
      });
      // The sending intent remains durable even if the acknowledged receipt
      // cannot be stored. Report the actual provider result to this caller.
    }
    return answer;
  } finally {
    active.delete(id);
  }
};
