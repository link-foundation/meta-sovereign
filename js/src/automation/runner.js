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
import { typingLink } from '../sources/live-links.js';
import { resolveAudience as resolvePeople } from '../crm/people.js';
import { nextChatOperations } from './next-chat.js';
import { recordOutcome } from './record-outcome.js';
import { createPacedSender } from './paced-send.js';
import { guardedSend, outboxKey } from './outbox.js';
import { planningRecords } from './planning-store.js';
import { createAutomationRun } from './run-automation.js';
import {
  AUTOMATION_PREFIX,
  RUN_PREFIX,
  STATE_PREFIX,
  automationKey,
  editId,
  withEdit,
  hasTrigger,
  incomingTrigger,
  normalizeAutomation,
  parseDuration,
  planAutomation,
} from './automations.js';
import {
  ConfirmationRequiredError,
  draftOperations,
  loadAutomation,
  queueDrafts,
} from './drafts.js';

export { ConfirmationRequiredError };
export { stillConfirmed } from './run-automation.js';

const pick = (object, keys) =>
  Object.fromEntries(keys.map((key) => [key, object[key]]));

/** How long a person would take to type `text`. */
export const typingDurationMs = (text, pacing) =>
  Math.min(
    Number(pacing.maxTypingMs ?? 8000),
    Math.round(
      (String(text ?? '').length / Math.max(Number(pacing.charsPerMinute), 1)) *
        60_000
    )
  );

/**
 * `send(draft)` delivers one message (normally `createDefaultSender`);
 * `setTyping({ source, chat })` shows the typing status on the network;
 * `resolveAudience(links, spec)` turns the audience into people
 * (people.js: friends, chats, communities, lists and their algebra).
 */
export const createAutomationRunner = ({
  store,
  send = null,
  setTyping = null,
  resolveAudience = resolvePeople,
  self = [],
  clock = () => new Date(),
  sleep = delay,
  random = Math.random,
  log = () => {},
} = {}) => {
  const nowIso = () => clock().toISOString();

  // The automation as the user last sent it: their edit of the text is
  // carried to the next chats (R-Y86).
  const load = async (automationOrId) => {
    const automation = await loadAutomation(store, automationOrId);
    return withEdit(automation, await store.get(editId(automation)));
  };

  const plan = async (automation, options = {}) => {
    const data = await planningRecords(store, {
      targets: options.targets,
      self,
    });
    return planAutomation(data.records, automation, {
      ...pick(options, ['targets', 'test', 'limit']),
      now: options.now ?? clock().getTime(),
      self: data.self,
      resolveAudience,
    });
  };

  const showTyping = async (automation, draft) => {
    if (!automation.pacing.typing) {
      return;
    }
    const ms = typingDurationMs(draft.text, automation.pacing);
    // `automation` lets the chat say who is typing on the user's behalf.
    await store.put({
      ...typingLink({
        source: draft.source,
        chat: draft.chat,
        user: 'me',
        at: nowIso(),
        ttlMs: ms + 2000,
      }),
      automation: automation.id,
      automationName: automation.name,
    });
    await setTyping?.({ source: draft.source, chat: draft.chat }).catch(
      (error) => log({ event: 'typing_failed', error: error.message })
    );
    await sleep(ms);
  };

  /** Send one draft now: typing, the guarded send, ledger, chat history. */
  const deliver = async (automation, draft) => {
    if (typeof send !== 'function') {
      throw new Error('no sender configured; send it yourself and mark it');
    }
    await showTyping(automation, draft);
    const outcome = await guardedSend({
      store,
      kind: 'automation',
      owner: automation.id,
      key: outboxKey({
        owner: automation.id,
        source: draft.source,
        chat: draft.chat,
        now: clock().getTime(),
      }),
      draft,
      send,
      clock,
      log,
    });
    const record = await recordOutcome({
      store,
      automation,
      draft,
      outcome,
      nowIso,
      log,
    });
    return {
      status: outcome.status,
      draft,
      record,
      outbox: outcome.outbox,
      ...(outcome.status === 'sent'
        ? {}
        : {
            error: outcome.error,
            ...(outcome.code ? { code: outcome.code } : {}),
            ...(outcome.retryAfter ? { retryAfter: outcome.retryAfter } : {}),
          }),
    };
  };

  const queue = (automation, drafts) =>
    queueDrafts(store, automation, drafts, nowIso());

  const { afterSend, methods } = nextChatOperations({
    store,
    load,
    plan,
    deliver,
    queue,
    nowIso,
  });

  const sendPaced = createPacedSender({
    store,
    clock,
    sleep,
    random,
    deliver,
  });

  return {
    load,
    plan,
    /**
     * Run an automation. Nothing is ever sent without the user's say:
     *   - safe mode, and every `schedule` / `incoming` trigger in any
     *     mode, only queue drafts for the user to review and send;
     *   - auto mode sends on a manual or chat-menu run the user
     *     confirmed. `confirmed` is the exact list of drafts they saw
     *     (from the preview); only those still due are sent.
     */
    run: createAutomationRun({
      store,
      load,
      plan,
      queue,
      sendPaced,
      nowIso,
      log,
    }),
    ...draftOperations({ store, load, deliver, nowIso, afterSend }),
    ...methods,
    /** Every ledger record, newest first. */
    async history({ automation } = {}) {
      const prefix = automation
        ? `${RUN_PREFIX}${automationKey(automation)}:`
        : RUN_PREFIX;
      return (await store.query((l) => l?.id?.startsWith(prefix))).sort(
        (a, b) => String(b.at).localeCompare(String(a.at))
      );
    },
  };
};

// Only the automations are read (and copied), not the whole store.
const enabledAutomations = async (store) =>
  (await store.query((l) => l?.id?.startsWith(AUTOMATION_PREFIX)))
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
 * Triggered runs only queue drafts (see `run`): nothing is sent until
 * the user confirms.
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
  // While started, the enabled automations are kept until one changes:
  // a message arriving does not read them again.
  let known = null;
  const automations = () => {
    if (!unsubscribe) {
      return enabledAutomations(store);
    }
    known ??= enabledAutomations(store).catch((error) => {
      known = null;
      throw error;
    });
    return known;
  };
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
    for (const automation of await automations()) {
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
    if (isSelf(message.sender) || at < startedAt || message.service) {
      return [];
    }
    const ran = [];
    for (const automation of await automations()) {
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
        const id = event?.link?.id ?? event?.id;
        if (typeof id === 'string' && id.startsWith(AUTOMATION_PREFIX)) {
          known = null;
        }
        if (event?.type === 'put' && event.link?.id?.startsWith('msg:')) {
          safely(onMessage(event.link));
        }
      });
    },
    stop() {
      clearInterval(timer);
      unsubscribe?.();
      unsubscribe = null;
      known = null;
      timer = null;
    },
  };
};
