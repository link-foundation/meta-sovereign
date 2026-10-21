/**
 * The next chat an automation fits (R-Y86). What the user sent — their
 * edit of the automation's text, kept as `automation-edit:<automation>`
 * with names turned back into `{name}`/`{first}` — is what the next chat
 * gets, until they send its own text again or reset it. The autopilot
 * (R-Y87) goes through the chats one `next` at a time.
 */

import { editAfterSend, editId } from './automations.js';
import { loadAutomation } from './drafts.js';

/**
 * `load` gives the automation with the edit in place, `plan` its drafts,
 * `deliver` one send, `queue` writes drafts for the chat to show.
 */
export const nextChatOperations = ({
  store,
  load,
  plan,
  deliver,
  queue,
  nowIso,
}) => ({
  /** After a confirmed send: keep the user's text, or forget it. */
  async afterSend(edited, draft) {
    const automation = await loadAutomation(store, edited.id);
    const before = await store.get(editId(automation));
    const next = editAfterSend(automation, before, draft, draft.text, nowIso());
    if (next) {
      await store.put(next);
    } else if (before) {
      await store.delete(before.id);
    }
  },
  methods: {
    /** Send a planned draft now (the autopilot's step). */
    async deliverDraft(automationOrId, draft) {
      const automation = await load(automationOrId);
      const outcome = await deliver(automation, draft);
      if (outcome.status === 'sent') {
        // A draft waiting in that chat is the one just sent.
        await store.delete(draft.id).catch(() => {});
      }
      return outcome;
    },
    /** Back to the automation's own text. */
    async resetEdit(automationOrId) {
      const automation = await loadAutomation(store, automationOrId);
      await store.delete(editId(automation));
      return { reset: automation.id };
    },
    /**
     * The next chat the automation fits, after the ones in `exclude`
     * (`[{ source, chat }]`); with `queue`, its draft is written for the
     * chat to show. `{ draft: null }` when none is left.
     */
    async next(automationOrId, { exclude = [], queue: write = false } = {}) {
      const automation = await load(automationOrId);
      const skip = new Set(exclude.map((t) => `${t.source}:${t.chat}`));
      const planned = await plan(automation, { limit: skip.size + 1 });
      const draft =
        planned.drafts.find((d) => !skip.has(`${d.source}:${d.chat}`)) ?? null;
      if (draft && write) {
        await queue(automation, [draft]);
      }
      return { automation: automation.id, name: automation.name, draft };
    },
  },
});
