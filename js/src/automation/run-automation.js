import { STATE_PREFIX, automationKey } from './automations.js';
import {
  ConfirmationRequiredError,
  pendingTestDrafts,
  existingTestResult,
} from './drafts.js';

// Only the same chat and text the user saw in the confirmation may be sent.
const draftKey = (draft) =>
  `${draft.source}\u0000${draft.chat}\u0000${draft.text}`;
export const stillConfirmed = (planned, confirmed) => {
  const ok = new Set(confirmed.map(draftKey));
  return planned.filter((draft) => ok.has(draftKey(draft)));
};

export const createAutomationRun =
  ({ store, load, plan, queue, sendPaced, nowIso, log }) =>
  async (automationOrId, options = {}) => {
    const automation = await load(automationOrId);
    const trigger = options.trigger ?? 'manual';
    const started = Date.now();
    log({
      event: 'automation_run_started',
      automation: automation.id,
      trigger,
      test: Boolean(options.test),
      targets: options.targets?.length ?? 0,
    });
    const existing = await existingTestResult(
      store,
      automation,
      options,
      nowIso()
    );
    if (existing) {
      log({
        event: 'automation_run_reused',
        automation: automation.id,
        drafts: existing.queued.length,
        duration_ms: Date.now() - started,
      });
      return { ...existing, trigger };
    }
    const planned = await plan(automation, options);
    log({
      event: 'automation_run_planned',
      automation: automation.id,
      drafts: planned.drafts.length,
      excluded: planned.excluded.length,
      duration_ms: Date.now() - started,
    });
    const byUser = ['manual', 'chat-menu'].includes(trigger);
    if (automation.mode === 'safe' || !byUser) {
      const existing = await pendingTestDrafts(
        store,
        automation,
        planned,
        options
      );
      return {
        ...planned,
        trigger,
        queued: [...(await queue(automation, planned.drafts)), ...existing],
      };
    }
    if (!Array.isArray(options.confirmed)) {
      throw new ConfirmationRequiredError(
        'auto mode sends messages; confirm the previewed drafts first'
      );
    }
    const outcome = await sendPaced(
      automation,
      stillConfirmed(planned.drafts, options.confirmed)
    );
    await store.put({
      id: `${STATE_PREFIX}${automationKey(automation)}`,
      tokens: ['automation-state', automationKey(automation)],
      automation: automation.id,
      lastRunAt: nowIso(),
      lastTrigger: trigger,
    });
    return { ...planned, trigger, ...outcome };
  };
