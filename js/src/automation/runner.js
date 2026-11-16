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
import { typingLink } from '../sources/live-links.js';
import { resolveAudience as resolvePeople } from '../crm/people.js';
import { nextChatOperations } from './next-chat.js';
import { createPacedSender } from './paced-send.js';
import { createDelivery } from './deliver.js';
import { vkOutgoingFor } from './vk-outgoing-queue.js';
import { planningRecords } from './planning-store.js';
import { draftChatModelAnswers } from './question-chat-model.js';
import { finalPeriodOverride } from './question-final-period.js';
import {
  prepareSalaryExchange,
  withSalaryExchangeEvidence,
} from './salary-exchange-policy.js';
import { createAutomationRun } from './run-automation.js';
import {
  RUN_PREFIX,
  automationKey,
  editId,
  withEdit,
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

const planningAction = (action, period, salary) => ({
  ...action,
  ...(action.kind === 'answer-questions' ? period : {}),
  ...(salary ? { salary } : {}),
});

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
  markRead = null,
  resolveAudience = resolvePeople,
  self = [],
  clock = () => new Date(),
  sleep = delay,
  random = Math.random,
  log = () => {},
  modelRunner,
  answerFinalPeriod,
  vkQueue = {},
} = {}) => {
  const period = finalPeriodOverride({ answerFinalPeriod });
  const nowIso = () => clock().toISOString();
  const outgoing = vkOutgoingFor(store, {
    sleep: (ms, signal) => sleep(ms, undefined, { signal }),
    now: () => clock().getTime(),
    random,
    log,
    ...vkQueue,
  });

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
      inferSelf: automation.action?.kind !== 'answer-questions',
      summaryChoices: automation.action?.kind === 'answer-questions',
    });
    const prepared = await prepareSalaryExchange(
      store,
      automation.action.salary,
      {
        now: () => options.now ?? clock().getTime(),
      }
    );
    const planned = planAutomation(
      data.records,
      {
        ...automation,
        action: planningAction(automation.action, period, prepared.salary),
      },
      {
        ...pick(options, ['targets', 'test', 'limit']),
        now: options.now ?? clock().getTime(),
        self: data.self,
        acceptedSummaries: data.acceptedSummaries,
        resolveAudience,
        modelCandidates: true,
      }
    );
    const drafted = await draftChatModelAnswers(store, automation, planned, {
      runner: modelRunner,
      signal: options.signal,
      now: options.now ?? clock().getTime(),
    });
    for (const draft of drafted.drafts) {
      if (draft.answer) {
        draft.answer = withSalaryExchangeEvidence(
          draft.answer,
          prepared.rateState
        );
      }
    }
    return drafted;
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

  const deliver = createDelivery({
    store,
    answerFinalPeriod,
    send,
    showTyping,
    clock,
    log,
    nowIso,
    self,
    outgoing,
    markRead,
    setTyping,
  });

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
    close: () => outgoing.close(),
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

export { createAutomationScheduler } from './scheduler.js';
