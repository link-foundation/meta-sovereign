import { openConfiguredVkStore } from './configured-vk-store.js';
import {
  createVkOnlineJob,
  loadVkOnline,
  saveVkOnline,
} from '../automation/vk-online.js';

const booleanArg = (value, fallback = false) => {
  if (value === undefined) {
    return fallback;
  }
  if (![true, false, 'true', 'false'].includes(value)) {
    throw new Error('enabled and run must be true or false');
  }
  return value === true || value === 'true';
};

const configuration = (args, saved) => ({
  enabled: booleanArg(args.enabled, saved.enabled),
  everyMinutes:
    args['every-minutes'] === undefined
      ? saved.everyMinutes
      : Number(args['every-minutes']),
});

export const createVkOnlineCommands = ({
  openStore,
  openReadOnly,
  createJob = createVkOnlineJob,
  configuration: files,
}) => ({
  'vk-online': async (args, log) => {
    const change =
      args.enabled !== undefined || args['every-minutes'] !== undefined;
    const run = booleanArg(args.run);
    booleanArg(args.enabled);
    const store = await openConfiguredVkStore(
      change || run ? openStore : openReadOnly,
      args,
      files
    );
    let job;
    try {
      let answer = await loadVkOnline(store);
      if (change) {
        answer = await saveVkOnline(
          store,
          configuration(args, answer.settings)
        );
      }
      if (run) {
        job = createJob({ store });
        answer = await job.run();
      }
      log(JSON.stringify({ ...answer, schedulerRunning: false }, null, 2));
      return ['refused', 'unknown'].includes(answer.last?.status) && run
        ? 1
        : 0;
    } finally {
      await job?.stop();
      await store.close?.();
    }
  },
});
