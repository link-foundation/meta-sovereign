/**
 * Paced automatic sends (R-Z3): one draft after another with the
 * automation's pauses, up to its daily cap (the ledger and the outbox
 * count together), stopping the whole batch on a rate limit, a send in
 * doubt, or too many failures in a row.
 */

import { RUN_PREFIX, automationKey } from './automations.js';
import { batchStopReason, recentSends } from './outbox.js';

// One send per chat in the last day, from the ledger and the outbox.
const sentToday = (links, automation, now) =>
  recentSends(
    links,
    automation.id,
    now,
    `${RUN_PREFIX}${automationKey(automation)}:`
  ).length;

export const createPacedSender =
  ({ store, clock, sleep, random, deliver }) =>
  async (automation, drafts) => {
    const { pacing } = automation;
    const already = sentToday(
      await store.query(),
      automation,
      clock().getTime()
    );
    const room = Math.max(Number(pacing.dailyCap ?? Infinity) - already, 0);
    const results = [];
    let failures = 0;
    let stopped = null;
    for (const [i, draft] of drafts.slice(0, room).entries()) {
      if (i > 0) {
        const span = Math.max(pacing.maxDelayMs - pacing.minDelayMs, 0);
        await sleep(pacing.minDelayMs + Math.round(random() * span));
      }
      const outcome = await deliver(automation, draft);
      results.push(outcome);
      failures = outcome.status === 'sent' ? 0 : failures + 1;
      stopped = batchStopReason(outcome, failures);
      if (stopped) {
        break;
      }
    }
    const capped = drafts.length - results.length;
    return {
      results,
      ...(capped > 0 ? { capped } : {}),
      ...(stopped ? { stopped } : {}),
    };
  };
