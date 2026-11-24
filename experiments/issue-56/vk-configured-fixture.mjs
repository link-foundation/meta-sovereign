import { createMemoryStore } from '../../js/src/storage/universal.js';
import { saveVkFriends } from '../../js/src/automation/vk-friends.js';
import { desktopAdapter, desktopSettings } from './vk-desktop-fixture.mjs';
import { friendsJob } from './vk-friends-fixture.mjs';

export const configuredFriendSettings = {
  ...desktopSettings,
  acceptancePolicy: 'desktop-configured',
  topPercentMutuals: 25,
};

/** A finite synthetic account; every probe drains its own job. */
export const withConfiguredFriends = async (
  check,
  settings = {},
  options = {}
) => {
  const store = createMemoryStore();
  const adapter = desktopAdapter(options);
  await saveVkFriends(store, { ...configuredFriendSettings, ...settings });
  const job = friendsJob(store, adapter);
  try {
    return await check({ store, adapter, job });
  } finally {
    await job.stop();
  }
};
