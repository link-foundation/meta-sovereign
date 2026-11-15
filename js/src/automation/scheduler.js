import { messageTime } from '../crm/message-time.js';
import { historicalMutation } from '../storage/mutation.js';
/** Owned, serialized trigger admission; effects remain reviewed safe drafts. */
import { clearInterval, setInterval } from 'node:timers';
import { createStoreQueue } from '../storage/serialized.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { triggerReceipt } from './trigger-state.js';
import {
  AUTOMATION_PREFIX,
  STATE_PREFIX,
  automationKey,
  hasTrigger,
  incomingTrigger,
  normalizeAutomation,
  parseDuration,
} from './automations.js';

const serialize = createStoreQueue();
const liveMessageMutation = (event) =>
  event?.type === 'put' &&
  event.link?.id?.startsWith('msg:') &&
  !event[historicalMutation];
const enabledAutomations = async (store) =>
  (await store.query((row) => row?.id?.startsWith(AUTOMATION_PREFIX)))
    .map((row) => {
      try {
        return normalizeAutomation(row);
      } catch {
        return null;
      }
    })
    .filter((row) => row?.enabled);

export const createAutomationScheduler = ({
  store,
  runner,
  isSelf = (sender) => sender === 'me',
  clock = () => new Date(),
  tickMs = 60_000,
  log = () => {},
} = {}) => {
  let timer;
  let unsubscribe;
  let startedAt = 0;
  let known;
  let stopped = false;
  const pending = new Set();
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
  const safely = (work) =>
    work.catch((error) => {
      log({ event: 'automation_failed', error: error.message });
      return null;
    });
  const own = (work) => {
    if (stopped) {
      return Promise.resolve([]);
    }
    const task = serialize(store, () => (stopped ? [] : work()));
    pending.add(task);
    const done = () => pending.delete(task);
    task.then(done, done);
    return task;
  };
  const tick = () =>
    own(async () => {
      const ran = [];
      const at = clock().toISOString();
      for (const automation of await automations()) {
        if (stopped || !hasTrigger(automation, 'schedule')) {
          continue;
        }
        const id = `${STATE_PREFIX}${automationKey(automation)}`;
        const state = await store.get(id);
        const every = automation.triggers.find(
          (row) => row.kind === 'schedule'
        ).every;
        if (
          Date.parse(at) - (Date.parse(state?.lastRunAt ?? '') || 0) <
          parseDuration(every)
        ) {
          continue;
        }
        ran.push(
          await safely(
            (async () => {
              const result = await runner.run(automation, {
                trigger: 'schedule',
              });
              await saveAcknowledgedRecord(store, {
                id,
                tokens: ['automation-state', automationKey(automation)],
                automation: automation.id,
                lastRunAt: at,
                lastTrigger: 'schedule',
              });
              return result;
            })()
          )
        );
      }
      return ran.filter(Boolean);
    });
  const onMessage = (message) =>
    own(async () => {
      const at = messageTime(message.timestamp);
      if (
        !message.id ||
        !message.source ||
        message.chat === undefined ||
        !Number.isFinite(at) ||
        at < startedAt ||
        isSelf(message.sender) ||
        message.outgoing === true ||
        message.out === true ||
        message.out === 1 ||
        message.service ||
        message.deleted
      ) {
        return [];
      }
      const ran = [];
      for (const automation of await automations()) {
        if (!stopped && incomingTrigger(automation, message.body, message)) {
          ran.push(
            await safely(
              triggerReceipt(
                store,
                automation,
                message,
                () =>
                  runner.run(automation, {
                    trigger: 'incoming',
                    targets: [{ source: message.source, chat: message.chat }],
                  }),
                clock().toISOString()
              )
            )
          );
        }
      }
      return ran.filter(Boolean);
    });
  return {
    tick,
    onMessage,
    start() {
      if (timer || stopped) {
        return;
      }
      startedAt = clock().getTime();
      timer = setInterval(() => safely(tick()), tickMs);
      timer.unref?.();
      unsubscribe = store.subscribe?.((event) => {
        const id = event?.link?.id ?? event?.id;
        if (typeof id === 'string' && id.startsWith(AUTOMATION_PREFIX)) {
          known = null;
        }
        if (liveMessageMutation(event)) {
          safely(onMessage(event.link));
        }
      });
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      unsubscribe?.();
      unsubscribe = null;
      known = null;
      await Promise.allSettled([...pending]);
    },
  };
};
