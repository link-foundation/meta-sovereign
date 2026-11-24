import { setImmediate as nextTurn } from 'node:timers/promises';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createVkLive } from '../../js/src/sources/vk.js';
import {
  createVkOnlineJob,
  saveVkOnline,
} from '../../js/src/automation/vk-online.js';
import { createFakeVk } from '../../js/tests/helpers/fake-vk.js';

/** Finite owned pause at an actual refresh boundary; no provider traffic. */
export const onlineAdmission = async (stage, change) => {
  const store = createMemoryStore();
  const original = { enabled: true, everyMinutes: 14 };
  await saveVkOnline(store, original);
  let enter;
  let release;
  let held = false;
  let token = 'fixture-original';
  const entered = new Promise((resolve) => {
    enter = resolve;
  });
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const pause = async (boundary) => {
    if (stage === boundary && !held) {
      held = true;
      enter();
      await blocked;
    }
  };
  store.flush = () => pause('ack');
  const fake = createFakeVk({
    methods: {
      'account.setOnline': (_params, { calls }) =>
        stage === 'backoff' && calls.length === 1
          ? { error: { error_code: 6, error_msg: 'Synthetic rate refusal' } }
          : 1,
    },
  });
  const live = createVkLive({
    ...fake,
    limiter: { wait: () => pause('limiter') },
    sleep: () => pause('backoff'),
  });
  const job = createVkOnlineJob({
    store,
    resolve: () => ({ live }),
    optionsFor: async () => {
      const captured = token;
      await pause('options');
      return { token: captured };
    },
  });
  const running = job.run({ scheduled: true });
  let changing;
  let stopping;
  let stopped = false;
  let acknowledged = false;
  let changedBeforeRelease = true;
  try {
    await entered;
    if (['disable', 'interval'].includes(change)) {
      changing = saveVkOnline(store, {
        ...original,
        ...(change === 'disable' ? { enabled: false } : { everyMinutes: 2 }),
      }).then(() => {
        acknowledged = true;
      });
      await nextTurn();
      const current = await store.get('provider-job:vk:online');
      changedBeforeRelease =
        acknowledged &&
        (change === 'disable'
          ? current.enabled === false
          : current.everyMinutes === 2);
    } else if (change === 'token') {
      token = 'fixture-changed';
    } else if (change === 'stop') {
      stopping = job.stop().then(() => {
        stopped = true;
      });
      await nextTurn();
    }
    const stoppedBeforeRelease = stopped;
    release();
    const result = await running;
    await changing;
    await stopping;
    return {
      result,
      changedBeforeRelease,
      stoppedBeforeRelease,
      calls: fake.calls.length,
      tokenLeaked: JSON.stringify(result).includes('fixture-'),
    };
  } finally {
    release();
    await Promise.allSettled([running, changing, stopping]);
    await job.stop();
  }
};
