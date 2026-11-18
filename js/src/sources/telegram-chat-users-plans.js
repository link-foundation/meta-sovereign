import { randomUUID } from 'node:crypto';
import {
  contactOptions,
  contactExclusion,
} from './telegram-chat-users-shape.js';

export const createUsersPlans = (runtime, now) => {
  const plans = new Map();
  const preview = async (body = {}) => {
    const options = contactOptions(body);
    if (!options || typeof body.jobId !== 'string') {
      return { ok: false, code: 'bad-request' };
    }
    const { job, collection } = runtime.state;
    if (job?.id !== body.jobId || job.kind !== 'scan' || job.state !== 'done') {
      return { ok: false, code: 'scan-required' };
    }
    const selected = [];
    const skipped = {};
    for (const user of collection.users.values()) {
      const why = contactExclusion(user, { meId: job.meId, ...options });
      if (why) {
        skipped[why] = (skipped[why] ?? 0) + 1;
      } else {
        selected.push(user);
      }
    }
    const eligible = selected.length;
    const users = options.limit ? selected.slice(0, options.limit) : selected;
    const plan = {
      id: randomUUID(),
      scanId: job.id,
      chat: job.chat,
      meId: job.meId,
      options,
      users: globalThis.structuredClone(users),
      expires: now() + 5 * 60_000,
    };
    for (const [id, old] of plans) {
      if (old.expires <= now()) {
        plans.delete(id);
      }
    }
    if (plans.size >= 3) {
      plans.delete(plans.keys().next().value);
    }
    plans.set(plan.id, plan);
    return {
      ok: true,
      planId: plan.id,
      expiresAt: new Date(plan.expires).toISOString(),
      scanId: job.id,
      options: { ...options },
      eligible,
      selected: users.length,
      skipped,
      coverage: globalThis.structuredClone(job.coverage),
      sample: globalThis.structuredClone(users.slice(0, 100)),
    };
  };
  const consume = (id) => {
    const plan = plans.get(id);
    if (
      !plan ||
      plan.expires <= now() ||
      plan.scanId !== runtime.state.job?.id
    ) {
      return null;
    }
    plans.delete(id);
    return plan;
  };
  return { preview, consume, clear: () => plans.clear() };
};
