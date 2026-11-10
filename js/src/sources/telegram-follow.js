import { randomUUID } from 'node:crypto';
import { createFollowRuntime, followError } from './telegram-follow-runtime.js';
import {
  followFailure,
  followRequest,
  followPhaseDone,
} from './telegram-follow-shape.js';
import { resolveFollowTarget } from './telegram-follow-target.js';
import { listFollowTelegram } from './telegram-follow-list.js';
import { followPhaseState } from './telegram-follow-journal.js';
import { writeFollowPhase } from './telegram-follow-write.js';
import { followReadPolicy } from '../follow/read-policy.js';

const phasesOf = (plan) => [
  ...(plan.operation === 'preferences' ? [] : ['membership']),
  ...Object.keys(plan.options).filter((key) => plan.options[key] !== null),
];
export const createFollowTelegram = (
  env,
  context,
  { now = Date.now, sleep } = {}
) => {
  const runtime = createFollowRuntime(env, context, { sleep });
  const { plans, cancelled, owned, connectedRead } = runtime;
  const preview = (body, version, options = {}) => {
    const request = followRequest(body);
    return connectedRead(
      version,
      async (c, owner) => {
        const { target, joinable } = await resolveFollowTarget(
          c,
          request.selector,
          now
        );
        if (request.operation !== 'join' && !target.member) {
          throw followFailure('not-member');
        }
        if (request.operation === 'join' && !target.member && !joinable) {
          throw followFailure('invitation-required');
        }
        const plan = {
          ...request,
          id: randomUUID(),
          owner,
          target,
          expires: now() + 5 * 60_000,
        };
        const phases = await Promise.all(
          phasesOf(plan).map(async (phase) => ({
            phase,
            ...(followPhaseDone(target, phase, plan)
              ? { status: 'skipped', code: 'already-applied' }
              : await followPhaseState(env.store, plan, phase)),
          }))
        );
        if (cancelled(version)) {
          throw followFailure(cancelled(version));
        }
        for (const [id, old] of plans) {
          if (old.expires <= now()) {
            plans.delete(id);
          }
        }
        if (plans.size >= 5) {
          plans.delete(plans.keys().next().value);
        }
        plans.set(plan.id, plan);
        return globalThis.structuredClone({
          ok: true,
          planId: plan.id,
          owner,
          target,
          selector: request.selector,
          operation: plan.operation,
          options: plan.options,
          retry: plan.retry,
          phases,
          expiresAt: new Date(plan.expires).toISOString(),
        });
      },
      { policy: request.retry, ...options }
    );
  };
  const apply = async (
    body,
    version,
    { cancelled: outsideCancelled, read } = {}
  ) => {
    const cancelledHere = () =>
      cancelled(version) || (outsideCancelled?.() ? 'cancelled' : null);
    if (body.confirm !== true || typeof body.planId !== 'string') {
      throw followFailure('bad-request');
    }
    if (runtime.writing) {
      throw followFailure('busy');
    }
    const plan = plans.get(body.planId);
    plans.delete(body.planId);
    if (!plan || plan.expires <= now()) {
      throw followFailure('plan-expired');
    }
    read ??= runtime.readFor(version, plan.retry, outsideCancelled);
    runtime.writing = true;
    const results = [];
    let current = plan;
    try {
      for (const phase of phasesOf(plan)) {
        if (cancelledHere()) {
          results.push({ phase, status: 'failed', code: cancelledHere() });
          break;
        }
        let result;
        try {
          result = await writeFollowPhase(
            env,
            context,
            current,
            phase,
            cancelledHere,
            { now, read }
          );
        } catch (error) {
          result = { status: 'failed', ...followError(error) };
        }
        results.push({ phase, ...result });
        if (!['confirmed', 'skipped'].includes(result.status)) {
          break;
        }
        if (phase === 'membership' && result.chat && !current.target.chat) {
          current = {
            ...current,
            target: { ...current.target, chat: result.chat },
          };
        }
      }
      return {
        ok: results.every((r) => ['confirmed', 'skipped'].includes(r.status)),
        planId: plan.id,
        operation: plan.operation,
        chat: current.target.chat,
        results,
      };
    } finally {
      runtime.writing = false;
    }
  };
  return {
    followTelegramList: (body = {}) =>
      owned((version) => {
        const policy = followReadPolicy(body);
        return connectedRead(
          version,
          (c, owner) => listFollowTelegram(c, owner, body, now),
          { policy }
        );
      }, body),
    followTelegramPreview: (body = {}, options = {}) =>
      owned((version) => preview(body, version, options), body),
    followTelegramApply: (body = {}, options = {}) =>
      owned((version) => apply(body, version, options), body),
    followTelegramCancel: runtime.cancel,
  };
};
