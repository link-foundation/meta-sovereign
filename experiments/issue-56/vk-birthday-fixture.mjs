import { reengageAdapter } from './vk-reengage-fixture.mjs';
import { personalFixtureOptions } from './vk-cancelled-fixture.mjs';
import { createVkBirthdayJob } from '../../js/src/automation/vk-birthday.js';
import { vkBirthdaySettings } from '../../js/src/automation/vk-birthday-settings.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { friendsServer } from './vk-friends-fixture.mjs';

export const birthdayAdapter = (options = {}) => {
  const ids = options.ids ?? [9];
  const birthdays = new Map(ids.map((id) => [id, '15.11.2000']));
  let owner = 1;
  const adapter = reengageAdapter({
    ...options,
    ids,
    methods: {
      'users.get': (params) => {
        const id = params.user_ids ? Number(params.user_ids) : owner;
        return [
          {
            id,
            online: adapter.online.get(id),
            can_write_private_message: 1,
            ...(birthdays.has(id) ? { bdate: birthdays.get(id) } : {}),
          },
        ];
      },
      ...options.methods,
    },
  });
  return {
    ...adapter,
    birthdays,
    account: (id) => {
      owner = id;
      adapter.account(id);
    },
  };
};
export const birthdayJob = (store, adapter, options = {}) =>
  createVkBirthdayJob({ store, ...personalFixtureOptions(adapter, options) });
export const withBirthdayJob = async (
  check,
  {
    store = createMemoryStore(),
    adapter = birthdayAdapter(),
    settings = {},
    ...options
  } = {}
) => {
  await vkBirthdaySettings.save(store, {
    ...(await vkBirthdaySettings.settings(store)),
    ...settings,
  });
  const job = birthdayJob(store, adapter, options);
  try {
    return await check({ store, adapter, job, policy: vkBirthdaySettings });
  } finally {
    await job.stop();
  }
};
export const birthdayServer = (options = {}) => {
  const adapter = options.adapter ?? birthdayAdapter();
  return friendsServer({
    ...options,
    adapter,
    vkBirthday: personalFixtureOptions(adapter, options.vkBirthday),
  });
};
