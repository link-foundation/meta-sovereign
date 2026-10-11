/**
 * Running automations (see `./automations.js`): drafts, confirmed sends,
 * paced automatic sends with a typing status, and the scheduler that
 * fires `schedule` and `incoming` triggers.
 *
 * Safe mode never sends on its own: a run writes one
 * `automation-draft:<automation>:<source>:<chat>` link per person, the
 * chat screen shows it pre-filled, and the user sends, edits, switches
 * "ты"/"вы", marks it as sent by hand, or skips it. Auto mode sends
 * through `send(draft)` (the adapter, falling back to the official web
 * UI) like a person would, after vk-bot's outgoing queue: show "typing…"
 * for as long as the text takes to type, send, then wait a random pause
 * before the next one, and stop at the daily cap.
 *
 * Every outcome is an `automation-run:<automation>:<source>:<chat>` link,
 * which is the cooldown ledger; sent messages are also stored as
 * ordinary `msg:` links so the chat and the reply graph see them.
 */

import { setTimeout as delay } from 'node:timers/promises';
import { clearInterval, setInterval } from 'node:timers';
import { DAY_MS } from '../crm/reengage.js';
import { typingLink } from '../sources/live-links.js';
import {
  AUTOMATION_PREFIX,
  DRAFT_PREFIX,
  RUN_PREFIX,
  STATE_PREFIX,
  automationKey,
  hasTrigger,
  incomingTrigger,
  normalizeAutomation,
  parseDuration,
  planAutomation,
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

/** How long a person would take to type `text`. */
export const typingDurationMs = (text, pacing) =>
  Math.min(
    Number(pacing.maxTypingMs ?? 8000),
    Math.round(
      (String(text ?? '').length / Math.max(Number(pacing.charsPerMinute), 1)) *
        60_000
    )
  );

const runRecord = (automation, draft, { status, at, ...extra }) => ({
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

const sentMessage = (draft, { at, via, automation }) => ({
  id: `msg:${draft.source}:${draft.chat}:out-${Date.parse(at)}`,
  tokens: ['message', draft.source, String(draft.chat)],
  source: draft.source,
  chat: String(draft.chat),
  sender: 'me',
  body: draft.text,
  timestamp: at,
  automation: automation.id,
  ...(via ? { via } : {}),
});

const sentToday = (links, automation, now) =>
  links.filter(
    (l) =>
      l?.id?.startsWith(`${RUN_PREFIX}${automationKey(automation)}:`) &&
      l.status === 'sent' &&
      now - Date.parse(l.at) < DAY_MS
  ).length;

/** What the user can do with a pending safe-mode draft. */
const draftOperations = ({ store, load, deliver, nowIso }) => {
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
      return (await store.query()).filter(
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

/**
 * `send(draft)` delivers one message (normally `createDefaultSender`);
 * `setTyping({ source, chat })` shows the typing status on the network;
 * `resolveAudience(links, spec)` comes from people.js.
 */
export const createAutomationRunner = ({
  store,
  send = null,
  setTyping = null,
  resolveAudience = null,
  self = [],
  clock = () => new Date(),
  sleep = delay,
  random = Math.random,
  log = () => {},
} = {}) => {
  const nowIso = () => clock().toISOString();

  const load = async (automationOrId) => {
    if (typeof automationOrId !== 'string') {
      return normalizeAutomation(automationOrId);
    }
    const id = automationOrId.startsWith(AUTOMATION_PREFIX)
      ? automationOrId
      : `${AUTOMATION_PREFIX}${automationOrId}`;
    const link = await store.get(id);
    if (!link) {
      throw new Error(`no automation ${id}`);
    }
    return normalizeAutomation(link);
  };

  const plan = async (automation, { targets, now, limit } = {}) =>
    planAutomation(await store.query(), automation, {
      targets,
      now: now ?? clock().getTime(),
      limit,
      self,
      resolveAudience,
    });

  const showTyping = async (automation, draft) => {
    if (!automation.pacing.typing) {
      return;
    }
    const ms = typingDurationMs(draft.text, automation.pacing);
    await store.put(
      typingLink({
        source: draft.source,
        chat: draft.chat,
        user: 'me',
        at: nowIso(),
        ttlMs: ms + 2000,
      })
    );
    await setTyping?.({ source: draft.source, chat: draft.chat }).catch(
      (error) => log({ event: 'typing_failed', error: error.message })
    );
    await sleep(ms);
  };

  /** Send one draft now: typing, send, ledger, chat history. */
  const deliver = async (automation, draft) => {
    if (typeof send !== 'function') {
      throw new Error('no sender configured; send it yourself and mark it');
    }
    await showTyping(automation, draft);
    try {
      const result = await send(draft);
      const at = nowIso();
      const via = result?.via;
      await store.put(sentMessage(draft, { at, via, automation }));
      const record = runRecord(automation, draft, { status: 'sent', at, via });
      await store.put(record);
      return { status: 'sent', draft, record };
    } catch (error) {
      const record = runRecord(automation, draft, {
        status: 'failed',
        at: nowIso(),
        error: error.message,
      });
      await store.put(record);
      return { status: 'failed', draft, record, error: error.message };
    }
  };

  const queue = async (automation, drafts) => {
    const at = nowIso();
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

  const sendPaced = async (automation, drafts) => {
    const { pacing } = automation;
    const already = sentToday(
      await store.query(),
      automation,
      clock().getTime()
    );
    const room = Math.max(Number(pacing.dailyCap ?? Infinity) - already, 0);
    const results = [];
    for (const [i, draft] of drafts.slice(0, room).entries()) {
      if (i > 0) {
        const span = Math.max(pacing.maxDelayMs - pacing.minDelayMs, 0);
        await sleep(pacing.minDelayMs + Math.round(random() * span));
      }
      results.push(await deliver(automation, draft));
    }
    const capped = drafts.length - results.length;
    return { results, ...(capped > 0 ? { capped } : {}) };
  };

  return {
    load,
    plan,
    /**
     * Run an automation. Safe mode queues drafts. Auto mode sends, but a
     * manual run must say `confirm: true`; schedule and incoming
     * triggers were authorised when the automation was switched on.
     */
    async run(automationOrId, options = {}) {
      const automation = await load(automationOrId);
      const trigger = options.trigger ?? 'manual';
      const planned = await plan(automation, options);
      if (automation.mode === 'safe') {
        return {
          ...planned,
          trigger,
          queued: await queue(automation, planned.drafts),
        };
      }
      if (['manual', 'chat-menu'].includes(trigger) && !options.confirm) {
        throw new ConfirmationRequiredError(
          'auto mode sends without asking; pass confirm: true to start it'
        );
      }
      const outcome = await sendPaced(automation, planned.drafts);
      await store.put({
        id: `${STATE_PREFIX}${automationKey(automation)}`,
        tokens: ['automation-state', automationKey(automation)],
        automation: automation.id,
        lastRunAt: nowIso(),
        lastTrigger: trigger,
      });
      return { ...planned, trigger, ...outcome };
    },
    ...draftOperations({ store, load, deliver, nowIso }),
    /** Every ledger record, newest first. */
    async history({ automation } = {}) {
      const prefix = automation
        ? `${RUN_PREFIX}${automationKey(automation)}:`
        : RUN_PREFIX;
      return (await store.query())
        .filter((l) => l?.id?.startsWith(prefix))
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));
    },
  };
};

const enabledAutomations = async (store) =>
  (await store.query())
    .filter((l) => l?.id?.startsWith(AUTOMATION_PREFIX))
    .map((l) => {
      try {
        return normalizeAutomation(l);
      } catch {
        return null;
      }
    })
    .filter((a) => a?.enabled);

/**
 * Fire `schedule` triggers every `tickMs` and `incoming` triggers on
 * every new message someone else sends — vk-bot's `executeTrigger`.
 */
export const createAutomationScheduler = ({
  store,
  runner,
  isSelf = (sender) => sender === 'me',
  clock = () => new Date(),
  tickMs = 60_000,
  log = () => {},
} = {}) => {
  let timer = null;
  let unsubscribe = null;
  let startedAt = 0;
  const safely = (task) =>
    task.catch((error) => {
      log({ event: 'automation_failed', error: error.message });
      return null;
    });

  const due = async (automation, now) => {
    const trigger = automation.triggers.find((t) => t.kind === 'schedule');
    const state = await store.get(
      `${STATE_PREFIX}${automationKey(automation)}`
    );
    const last = Date.parse(state?.lastRunAt ?? '') || 0;
    return now - last >= parseDuration(trigger.every);
  };

  const tick = async () => {
    const now = clock().getTime();
    const ran = [];
    for (const automation of await enabledAutomations(store)) {
      if (hasTrigger(automation, 'schedule') && (await due(automation, now))) {
        await store.put({
          id: `${STATE_PREFIX}${automationKey(automation)}`,
          tokens: ['automation-state', automationKey(automation)],
          automation: automation.id,
          lastRunAt: new Date(now).toISOString(),
          lastTrigger: 'schedule',
        });
        ran.push(await safely(runner.run(automation, { trigger: 'schedule' })));
      }
    }
    return ran.filter(Boolean);
  };

  const onMessage = async (message) => {
    const at = Date.parse(message.timestamp ?? '') || 0;
    if (isSelf(message.sender) || at < startedAt) {
      return [];
    }
    const ran = [];
    for (const automation of await enabledAutomations(store)) {
      if (incomingTrigger(automation, message.body)) {
        ran.push(
          await safely(
            runner.run(automation, {
              trigger: 'incoming',
              targets: [{ source: message.source, chat: message.chat }],
            })
          )
        );
      }
    }
    return ran.filter(Boolean);
  };

  return {
    tick,
    onMessage,
    start() {
      startedAt = clock().getTime();
      timer = setInterval(() => safely(tick()), tickMs);
      timer.unref?.();
      unsubscribe = store.subscribe?.((event) => {
        if (event?.type === 'put' && event.link?.id?.startsWith('msg:')) {
          safely(onMessage(event.link));
        }
      });
    },
    stop() {
      clearInterval(timer);
      unsubscribe?.();
      timer = null;
    },
  };
};
