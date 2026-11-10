import { randomUUID } from 'node:crypto';
import { runIn } from './telegram-stickers.js';
import { greetingStickerOwner } from './telegram-greeting-stickers-cache.js';
import { greetingFailure } from './telegram-greeting-target.js';
import { deliverGreeting } from './telegram-greeting-delivery.js';
import { sendGreeting } from './telegram-greeting-transport.js';
import { recipientGreetingPlan } from './telegram-group-greeting-plans.js';
import {
  greetingRecipient,
  groupGreetingExclusion,
  resolveGreetingGroup,
} from './telegram-group-greeting-shape.js';

const checkGroup = async (r, c) => {
  if (
    (await greetingStickerOwner(r.env, c)) !== r.plan.owner ||
    (await r.context.userClient()) !== c.client
  ) {
    throw greetingFailure('account-changed');
  }
  const { target } = await resolveGreetingGroup(c, r.plan.selector);
  if (target.chat !== r.plan.chat || target.kind !== r.plan.target.kind) {
    throw greetingFailure('target-changed');
  }
};
const attempt = async (r, user) => {
  await checkGroup(r, r.c);
  const entity = await runIn(
    r.env,
    `greeting-group:recipient:${r.job.id}:${user.id}`,
    () => r.c.client.getEntity(r.c.helpers.returnBigInt(user.id))
  );
  const checked = await greetingRecipient(
    r.env,
    r.c,
    entity,
    r.plan.owner,
    r.job.id
  );
  if (checked.id !== user.id) {
    throw greetingFailure('target-changed');
  }
  const excluded = groupGreetingExclusion(checked, r.plan.owner);
  if (excluded || r.cancelled()) {
    return { status: 'skipped', code: excluded ?? 'cancelled' };
  }
  const context = {
    ...r.context,
    checkGreetingTarget: async (c, fresh) => {
      await checkGroup(r, c);
      const profile = await greetingRecipient(
        r.env,
        c,
        fresh,
        r.plan.owner,
        randomUUID()
      );
      if (
        profile.id !== user.id ||
        groupGreetingExclusion(profile, r.plan.owner)
      ) {
        throw greetingFailure('recipient-ineligible');
      }
    },
  };
  const plan = recipientGreetingPlan(r.plan, user);
  return deliverGreeting(
    r.env,
    plan,
    (draft) =>
      sendGreeting(r.env, context, plan, draft, () =>
        r.cancelled() ? 'cancelled' : null
      ),
    r.now
  );
};
const record = async (r, user, outcome) => {
  const status = outcome.status;
  r.job.processed += 1;
  r.job.counts[status] = (r.job.counts[status] ?? 0) + 1;
  await r.env.store.put({
    id: `telegram-greeting-result:${r.job.id}:${user.id}`,
    kind: 'telegram-greeting-result',
    source: 'telegram',
    jobId: r.job.id,
    user: user.id,
    status,
    code: outcome.code ?? null,
    outbox: outcome.outbox ?? null,
    messageId: outcome.messageId ?? null,
    at: new Date(r.now()).toISOString(),
  });
};
export const greetGroupParticipants = async (r) => {
  await checkGroup(r, r.c);
  for (const user of r.plan.users) {
    if (r.cancelled() || r.job.stopped) {
      break;
    }
    if (r.job.processed > 0) {
      r.job.phase = 'waiting';
      r.job.nextAt = new Date(r.now() + r.plan.options.delayMs).toISOString();
      await r.publish();
      await r.wait(r.plan.options.delayMs);
    }
    if (r.cancelled()) {
      break;
    }
    r.job.phase = 'sending';
    r.job.nextAt = null;
    let outcome;
    try {
      outcome = await attempt(r, user);
    } catch (error) {
      const known = [
        'account-changed',
        'target-changed',
        'group-required',
        'business-unavailable',
        'cancelled',
      ];
      outcome = {
        status: 'failed',
        code: known.includes(error.code) ? error.code : 'read-failed',
      };
    }
    await record(r, user, outcome);
    if (!['sent', 'skipped'].includes(outcome.status)) {
      r.job.stopped = outcome.code ?? outcome.status;
    }
    await r.publish();
  }
};
