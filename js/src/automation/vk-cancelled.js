import { createVkPersonalJob } from './vk-personal-job.js';
import {
  cancelledKeys,
  cancelledLedgerId,
  cancelledMessage,
  readVkCancelledSettings,
  readVkCancelled,
} from './vk-cancelled-settings.js';
import {
  previewVkCancelled,
  cancelledDecision,
} from './vk-cancelled-planner.js';
export { loadVkCancelled, saveVkCancelled } from './vk-cancelled-settings.js';
export const createVkCancelledJob = (options) =>
  createVkPersonalJob(options, {
    name: 'cancelled',
    keys: cancelledKeys,
    capability: 'cancelledSnapshot',
    stateMethod: 'cancelledState',
    effectMethod: 'cancelledEffect',
    settings: readVkCancelledSettings,
    read: readVkCancelled,
    preview: previewVkCancelled,
    pace: 15000,
    event: 'vk_cancelled_batch',
    messageOutcome: 'prompted',
    messageStep: 'greeting-and-question',
    outboxKey: (plan, item) =>
      `vk-cancelled:${plan.accountId}:${item.userId}:once`,
    ledgerId: (plan, item) =>
      cancelledLedgerId(
        plan.accountId,
        item.userId,
        item.action === 'prompt' ? 'prompt' : 'block'
      ),
    matches: (plan, item) =>
      item.action !== 'prompt' || item.text === cancelledMessage(plan.settings),
    decision: async (context, plan, item, state) =>
      cancelledDecision({
        state,
        settings: plan.settings,
        now: context.now(),
        blocked: null,
        prompted:
          item.action === 'prompt'
            ? null
            : await context.store.get(
                cancelledLedgerId(plan.accountId, item.userId, 'prompt')
              ),
      }),
  });
