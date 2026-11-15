import { defaultStoreDir } from '../storage/app-directory.js';
import {
  createVkFriendsJob,
  loadVkFriends,
  saveVkFriends,
} from '../automation/vk-friends.js';

const bool = (value, fallback = false) => {
  if (value === undefined) {
    return fallback;
  }
  if (![true, false, 'true', 'false'].includes(value)) {
    throw new Error('enabled and confirm must be true or false');
  }
  return value === true || value === 'true';
};
const keys = {
  'every-minutes': 'everyMinutes',
  'max-friends': 'maxFriends',
  'batch-size': 'batchSize',
};
const configuration = (args, saved, flags, stringFlags, booleanFlags) => {
  const settings = { ...saved, enabled: bool(args.enabled, saved.enabled) };
  for (const [flag, key] of Object.entries(flags)) {
    if (args[flag] !== undefined) {
      settings[key] = Number(args[flag]);
    }
  }
  for (const [flag, key] of Object.entries(stringFlags)) {
    if (args[flag] !== undefined) {
      settings[key] = String(args[flag]);
    }
  }
  for (const [flag, key] of Object.entries(booleanFlags)) {
    if (args[flag] !== undefined) {
      settings[key] = bool(args[flag]);
    }
  }
  if (args.priority !== undefined) {
    settings.priorityIds = String(args.priority).trim()
      ? String(args.priority).split(',').map(Number)
      : [];
  }
  return settings;
};
export const createVkFriendPolicyCommands = ({
  openStore,
  openReadOnly,
  createJob,
  name,
  load,
  save,
  flags = keys,
  stringFlags = {},
  booleanFlags = {},
  actions = {},
}) => ({
  [name]: async (args, log) => {
    const action = args._?.[0] ?? 'status';
    if (
      !['status', 'save', 'plan', 'run', ...Object.keys(actions)].includes(
        action
      )
    ) {
      throw new Error(
        `${name} ${['status', 'save', 'plan', 'run', ...Object.keys(actions)].join('|')} required`
      );
    }
    const confirm = bool(args.confirm);
    const store = await (action === 'status' ? openReadOnly : openStore)(
      args.store ?? defaultStoreDir()
    );
    let job;
    try {
      let answer = await load(store);
      if (action === 'save') {
        answer = await save(
          store,
          configuration(args, answer.settings, flags, stringFlags, booleanFlags)
        );
      }
      if (['plan', 'run'].includes(action)) {
        job = createJob({ store });
        answer =
          action === 'plan'
            ? await job.preview()
            : await job.run({ planId: args.plan, confirm });
      }
      if (actions[action]) {
        job = createJob({ store });
        answer = await actions[action](job);
      }
      log(JSON.stringify({ ...answer, schedulerRunning: false }, null, 2));
      return action === 'run' &&
        ['unknown', 'refused'].includes(answer.last?.status)
        ? 1
        : 0;
    } finally {
      await job?.stop();
      await store.close?.();
    }
  },
});

export const createVkFriendsCommands = (options) =>
  createVkFriendPolicyCommands({
    name: 'vk-friends',
    load: loadVkFriends,
    save: saveVkFriends,
    createJob: createVkFriendsJob,
    stringFlags: { 'acceptance-policy': 'acceptancePolicy' },
    actions: {
      'seed-priority': (job) => job.seedPriority(),
      'clear-priority': (job) => job.clearPriority(),
    },
    ...options,
  });
