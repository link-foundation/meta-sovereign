/**
 * Safe-mode drafts (see `./runner.js`), without timers or Node modules so
 * the browser can hold drafts while no server is up: load an automation
 * (a saved link or a preset), queue drafts, and settle them — send after
 * confirmation, switch "ты"/"вы", mark as sent by hand, or skip.
 */

import {
  AUTOMATION_PREFIX,
  DRAFT_PREFIX,
  automationKey,
  automationPresets,
  normalizeAutomation,
  redraftWithForm,
  runRecordId,
} from './automations.js';

export class ConfirmationRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfirmationRequiredError';
    this.code = 'confirm-required';
  }
}

export const runRecord = (automation, draft, { status, at, ...extra }) => ({
  id: runRecordId(automation, draft),
  tokens: ['automation-run', automationKey(automation), draft.source, status],
  automation: automation.id,
  source: draft.source,
  chat: String(draft.chat),
  contact: draft.contact ?? null,
  status,
  at,
  form: draft.form ?? null,
  text: draft.text ?? '',
  ...Object.fromEntries(
    Object.entries(extra).filter(([, value]) => value !== undefined)
  ),
});

/** A saved automation or, before the user saved a copy, a preset. */
export const loadAutomation = async (store, automationOrId) => {
  if (typeof automationOrId !== 'string') {
    return normalizeAutomation(automationOrId);
  }
  const id = automationOrId.startsWith(AUTOMATION_PREFIX)
    ? automationOrId
    : `${AUTOMATION_PREFIX}${automationOrId}`;
  const link =
    (await store.get(id)) ?? automationPresets().find((a) => a.id === id);
  if (!link) {
    throw new Error(`no automation ${id}`);
  }
  return normalizeAutomation(link);
};

/** Saved automations first, then the presets not saved yet. */
export const listAutomations = async (store) => {
  const saved = (
    await store.query((l) => l?.id?.startsWith(AUTOMATION_PREFIX))
  ).map((l) => {
    try {
      return { ...normalizeAutomation(l), saved: true };
    } catch (error) {
      return { id: l.id, name: l.name ?? l.id, invalid: error.message };
    }
  });
  const ids = new Set(saved.map((a) => a.id));
  return [
    ...saved,
    ...automationPresets()
      .filter((a) => !ids.has(a.id))
      .map((a) => ({ ...a, saved: false })),
  ];
};

/** Write planned drafts; they are shown in their chats until settled. */
export const queueDrafts = async (store, automation, drafts, at) => {
  // A draft is settled against its automation later; keep an unsaved one.
  if (drafts.length > 0 && !(await store.get(automation.id))) {
    await store.put(automation);
  }
  for (const draft of drafts) {
    await store.put({
      ...draft,
      tokens: ['automation-draft', automationKey(automation), draft.source],
      status: 'pending',
      createdAt: at,
    });
  }
  return drafts;
};

/** What the user can do with a pending safe-mode draft. */
export const draftOperations = ({
  store,
  load,
  deliver,
  nowIso,
  afterSend = async () => {},
}) => {
  const pendingDraft = async (id) => {
    const draft = await store.get(id);
    if (!draft?.id?.startsWith(DRAFT_PREFIX)) {
      throw new Error(`no draft ${id}`);
    }
    return { draft, automation: await load(draft.automation) };
  };

  const settleDraft = async (id, status, extra = {}) => {
    const { draft, automation } = await pendingDraft(id);
    const record = runRecord(automation, draft, {
      status,
      at: nowIso(),
      ...extra,
    });
    await store.put(record);
    await store.delete(id);
    return { status, draft, record };
  };

  return {
    /** Pending drafts, optionally for one chat or one automation. */
    async drafts({ source, chat, automation } = {}) {
      const owner = automation
        ? `${AUTOMATION_PREFIX}${automationKey(automation)}`
        : null;
      return store.query(
        (l) =>
          l?.id?.startsWith(DRAFT_PREFIX) &&
          (!source || l.source === source) &&
          (chat === undefined || String(l.chat) === String(chat)) &&
          (!owner || l.automation === owner)
      );
    },
    /** Send one draft after the user confirmed it (optionally edited). */
    async sendDraft(id, { confirm = false, text, form } = {}) {
      if (!confirm) {
        throw new ConfirmationRequiredError(
          'safe mode sends one message per confirmation; pass confirm: true'
        );
      }
      const { draft: stored, automation } = await pendingDraft(id);
      let draft = form ? redraftWithForm(automation, stored, form) : stored;
      if (typeof text === 'string') {
        draft = { ...draft, text };
      }
      const outcome = await deliver(automation, draft);
      if (outcome.status === 'sent') {
        await store.delete(id);
        await afterSend(automation, draft);
      }
      return outcome;
    },
    /** Re-render a pending draft in the other "ты"/"вы" form. */
    async setDraftForm(id, form) {
      const { draft, automation } = await pendingDraft(id);
      const next = redraftWithForm(automation, draft, form);
      await store.put(next);
      return next;
    },
    /** The user sent it in their own app. */
    markSent: (id) => settleDraft(id, 'sent', { manual: true }),
    skip: (id) => settleDraft(id, 'skipped'),
  };
};
