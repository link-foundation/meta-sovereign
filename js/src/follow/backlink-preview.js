import { randomUUID } from 'node:crypto';
import { backlinkConfig, backlinkFailure } from './backlink-shape.js';
import { withFollowRetry } from './retry.js';
const copy = (value) => globalThis.structuredClone(value);
export const createBacklinkPreview = ({
  provider,
  plans,
  now,
  sleep,
  trace,
  stopped,
}) => {
  const preview = async (body) => {
    const config = backlinkConfig(body);
    const adapter = await provider(config.source);
    const rows = [];
    let owner;
    for (const chat of config.chats) {
      const target = await withFollowRetry(() => adapter.describe(chat), {
        policy: config.retry,
        sleep,
        cancelled: stopped,
        trace,
      });
      if (
        target?.chat !== chat ||
        typeof target.owner !== 'string' ||
        !/^[1-9]\d{0,18}$/.test(target.owner)
      ) {
        throw backlinkFailure('provider-response');
      }
      owner ??= target.owner;
      if (target.owner !== owner) {
        throw backlinkFailure('account-changed');
      }
      if (target.canWrite !== true) {
        throw backlinkFailure('not-writable');
      }
      rows.push({
        chat,
        title: String(target.title ?? '').slice(0, 256),
        status: 'ready',
      });
    }
    if (stopped()) {
      throw backlinkFailure('stopped');
    }
    for (const [id, old] of plans) {
      if (old.expiresAt <= now()) {
        plans.delete(id);
      }
    }
    if (plans.size >= 5) {
      plans.delete(plans.keys().next().value);
    }
    const plan = {
      planId: randomUUID(),
      config,
      owner,
      rows,
      expiresAt: now() + 300000,
    };
    plans.set(plan.planId, plan);
    return { ok: true, ...copy(plan) };
  };
  return preview;
};
