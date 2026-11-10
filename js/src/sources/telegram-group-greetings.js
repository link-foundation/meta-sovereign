import { randomUUID } from 'node:crypto';
import { connect, runIn } from './telegram-stickers.js';
import { exportTarget } from './telegram-export-target.js';
import {
  createUserCollection,
  scanOptions,
} from './telegram-chat-users-shape.js';
import {
  usersJob,
  usersJobSnapshot,
  scanCoverage,
} from './telegram-chat-users-runtime.js';
import { resolveGreetingGroup } from './telegram-group-greeting-shape.js';
import { scanGreetingParticipants } from './telegram-group-greeting-scan.js';
import { createGroupGreetingPlans } from './telegram-group-greeting-plans.js';
import { greetGroupParticipants } from './telegram-group-greeting-delivery.js';

export const createGroupGreetings = (
  env,
  context,
  runtime,
  contactsPlans,
  now
) => {
  const plans = createGroupGreetingPlans(env, context, runtime, now);
  const start = (body = {}) => {
    const chat = exportTarget(body.chat);
    const options = scanOptions({ ...body, messagesLimit: 0 });
    if (!chat || !options) {
      return Promise.resolve({ ok: false, code: 'bad-request' });
    }
    return runtime.start(async (ensure) => {
      const c = await connect(env, context.userClient);
      ensure();
      if (!c) {
        return { ok: false, code: 'user-account-required' };
      }
      const { target } = await runIn(
        env,
        `greeting-group:resolve:${randomUUID()}`,
        () => resolveGreetingGroup(c, chat)
      );
      ensure();
      runtime.state.collection = createUserCollection();
      contactsPlans.clear();
      plans.clear();
      options.greetingGroup = true;
      runtime.state.job = usersJob(now, 'scan', target.chat, options, {
        selector: chat,
        target,
        users: 0,
        unresolvedMentions: 0,
        coverage: scanCoverage(options),
      });
      await runtime.publish();
      ensure();
      runtime.run(c, scanGreetingParticipants);
      return { ok: true, job: usersJobSnapshot(runtime.state.job) };
    });
  };
  const apply = (body = {}) => {
    if (body.confirm !== true || typeof body.planId !== 'string') {
      return Promise.resolve({ ok: false, code: 'bad-request' });
    }
    return runtime.start(async (ensure) => {
      const plan = plans.consume(body.planId);
      if (!plan) {
        return { ok: false, code: 'preview-expired' };
      }
      const c = await connect(env, context.userClient);
      ensure();
      if (!c) {
        return { ok: false, code: 'user-account-required' };
      }
      runtime.state.job = usersJob(now, 'greetings', plan.chat, plan.options, {
        planId: plan.id,
        processed: 0,
        total: plan.users.length,
        coverage: {},
        phase: 'sending',
      });
      await runtime.publish();
      ensure();
      runtime.run(c, greetGroupParticipants, { plan, context, now });
      return { ok: true, job: usersJobSnapshot(runtime.state.job) };
    });
  };
  return {
    chatUsersGreetingsStart: start,
    chatUsersGreetingsPreview: plans.preview,
    chatUsersGreetingsApply: apply,
  };
};
