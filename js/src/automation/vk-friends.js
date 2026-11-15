/** Opt-in priority requests and ranked acceptance with durable per-target receipts. */
import { setTimeout as pause } from 'node:timers/promises';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { createStoreQueue } from '../storage/serialized.js';
import { getSource, liveOptionsFrom } from '../sources/index.js';
import { safeMessage } from '../server/redact.js';
import { refuseFriendAction as refuse } from './vk-friends-records.js';
import { friendProvider, previewVkFriendPlan } from './vk-friends-planner.js';
import { applyVkFriendPlan } from './vk-friends-executor.js';
import { createVkFriendPriority } from './vk-friend-priority.js';
import {
  VK_FRIENDS_STATE as STATE,
  VK_FRIENDS_PLAN as PLAN,
  readVkFriendSettings,
  readVkFriends,
} from './vk-friends-settings.js';
export { loadVkFriends, saveVkFriends } from './vk-friends-settings.js';

const execute = createStoreQueue();
export const createVkFriendsJob = ({
  store,
  storeDir,
  resolve = getSource,
  optionsFor = () => liveOptionsFrom(store, 'vk'),
  now = Date.now,
  sleep = (ms, signal) => pause(ms, undefined, { signal }),
  setInterval = globalThis.setInterval,
  clearInterval = globalThis.clearInterval,
  log = () => {},
  profile = {},
} = {}) => {
  const stateKey = profile.state ?? STATE;
  const planKey = profile.plan ?? PLAN;
  const settingsFor = profile.settings ?? readVkFriendSettings;
  const read = profile.read ?? ((target) => readVkFriends(target, now()));
  let stopped = false;
  let timer;
  let active;
  let planning;
  const controller = new AbortController();
  const context = {
    store,
    now,
    optionsFor,
    sleep,
    log,
    signal: controller.signal,
    isStopped: () => stopped,
    provider: (capability = profile.capability) =>
      friendProvider(resolve, optionsFor, capability),
    publishFriendStats: storeDir
      ? async (accountId) => {
          const { publishVkFriendStats } =
            await import('./vk-friend-stats-files.js');
          await publishVkFriendStats(store, storeDir, accountId, now());
        }
      : undefined,
  };
  const priority = createVkFriendPriority(context);
  const preview = (scheduled = false) =>
    (profile.preview ?? previewVkFriendPlan)({ ...context, scheduled });
  const apply = (plan, scheduled = false) =>
    (profile.apply ?? applyVkFriendPlan)({ ...context, scheduled }, plan);
  const run = (input = {}) => {
    if (!input.scheduled && input.confirm !== true) {
      return Promise.reject(new Error('Confirm the reviewed friend plan'));
    }
    if (active) {
      return active;
    }
    active = execute(store, async () => {
      if (stopped) {
        refuse('Service stopped');
      }
      if (input.scheduled) {
        const settings = await settingsFor(store);
        const last = await store.get(stateKey);
        const elapsed = now() - Date.parse(last?.attemptedAt ?? '');
        if (
          !settings.enabled ||
          (Number.isFinite(elapsed) && elapsed < settings.everyMinutes * 60000)
        ) {
          return { ...(await read(store)), skipped: 'not-due' };
        }
        const attempt = {
          id: stateKey,
          attemptedAt: new Date(now()).toISOString(),
          status: 'pending',
          results: [],
          observeIds: (last?.results ?? [])
            .filter((row) => row.status === 'confirmed')
            .map((row) => row.userId),
        };
        await saveAcknowledgedRecord(store, attempt);
        let planned;
        try {
          planned = await preview(true);
        } catch (error) {
          await saveAcknowledgedRecord(store, {
            ...attempt,
            status: 'refused',
            error: safeMessage(error),
          });
          throw error;
        }
        return apply(planned.plan, true);
      }
      const plan = await store.get(planKey);
      if (
        input.confirm !== true ||
        !plan ||
        plan.status !== 'review' ||
        plan.planId !== input.planId
      ) {
        refuse('Confirm the current reviewed friend plan');
      }
      return apply(plan);
    }).finally(() => {
      active = null;
    });
    return active;
  };
  return {
    seedPriority: () => priority.edit('seed'),
    clearPriority: () => priority.edit('clear'),
    preview: () => {
      if (!planning) {
        planning = execute(store, () => preview()).finally(() => {
          planning = null;
        });
      }
      return planning;
    },
    run,
    start() {
      if (timer || stopped) {
        return;
      }
      timer = setInterval(
        () =>
          run({ scheduled: true }).catch(() =>
            log({ event: profile.failureEvent ?? 'vk_friend_batch_failed' })
          ),
        60000
      );
      timer.unref?.();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      controller.abort();
      await priority.stop();
      await active?.catch(() => {});
      await planning?.catch(() => {});
    },
  };
};
