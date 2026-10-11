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
import { resolveAudience as resolvePeople } from '../crm/people.js';
import {
  AUTOMATION_PREFIX,
  RUN_PREFIX,
  STATE_PREFIX,
  automationKey,
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
  runRecord,
} from './drafts.js';

export { ConfirmationRequiredError };

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

  const load = (automationOrId) => loadAutomation(store, automationOrId);

  const plan = async (automation, options = {}) =>
    planAutomation(await store.query(), automation, {
      ...pick(options, ['targets', 'test', 'limit']),
      now: options.now ?? clock().getTime(),
      self,
      resolveAudience,
    });

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

  const queue = (automation, drafts) =>
    queueDrafts(store, automation, drafts, nowIso());

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
