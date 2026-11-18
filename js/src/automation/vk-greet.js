import { createVkPersonalJob } from './vk-personal-job.js';
import { vkGreetSettings, greetLedgerId } from './vk-greet-settings.js';
import { previewVkGreet, greetDecision } from './vk-greet-planner.js';
export const createVkGreetJob = (options) =>
  createVkPersonalJob(options, {
    name: 'greet',
    keys: vkGreetSettings.keys,
    capability: 'greetSnapshot',
    stateMethod: 'greetState',
    effectMethod: 'greetEffect',
    settings: vkGreetSettings.settings,
    read: vkGreetSettings.read,
    preview: previewVkGreet,
    pace: 30000,
    event: 'vk_greet_batch',
    messageOutcome: 'greeted',
    repeatable: true,
    outboxKey: (plan, item) =>
      `vk-greet:${plan.accountId}:${item.userId}:${item.cycle}`,
    ledgerId: (plan, item) => greetLedgerId(plan.accountId, item.userId),
    matches: (plan, item) =>
      item.sticker === (plan.settings.stickerId || null) &&
      item.text === (plan.settings.stickerId ? null : plan.settings.message),
    // The executor has just persisted this action's intent. Its reviewed
    // cooldown was checked before that write; fresh complete history remains
    // authoritative here, and an uncertain previous intent cannot reach apply.
    decision: (context, plan, item, state) => ({
      action: 'prompt',
      reason: greetDecision({
        state,
        settings: plan.settings,
        now: context.now(),
        previous: null,
      }),
    }),
  });
