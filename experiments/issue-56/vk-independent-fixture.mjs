import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../../js/src/storage/lino-store.js';
import { createVkOnlineJob } from '../../js/src/automation/vk-online.js';
import * as online from '../../js/src/automation/vk-online-settings.js';
import * as friends from '../../js/src/automation/vk-friends-settings.js';
import * as maintenance from '../../js/src/automation/vk-maintenance-settings.js';
import { createVkMaintenanceJob } from '../../js/src/automation/vk-maintenance.js';
import { wallPolicy } from '../../js/src/automation/vk-wall-settings.js';
import { vkBirthdaySettings } from '../../js/src/automation/vk-birthday-settings.js';
import { onlineAdapter } from './vk-online-fixture.mjs';
import { friendsAdapter, friendsJob } from './vk-friends-fixture.mjs';
import { maintenanceAdapter } from './vk-maintenance-fixture.mjs';
import { wallAdapter, wallJob } from './vk-wall-fixture.mjs';
import { birthdayAdapter, birthdayJob } from './vk-birthday-fixture.mjs';
import {
  cancelledNow,
  personalFixtureOptions,
} from './vk-cancelled-fixture.mjs';

export const independentVkKinds = [
  'online',
  'friends',
  'cleanup',
  'outgoing',
  'wall',
  'birthday',
];

/** Six actual job/adapter instances, one owned disk store, no account/network. */
export const withIndependentVkJobs = async (work) => {
  const directory = await mkdtemp(join(tmpdir(), 'vk-independent-'));
  let store;
  let jobs = [];
  const timers = new Map();
  let nextTimer = 0;
  let at = cancelledNow;
  const adapters = {
    online: onlineAdapter(),
    friends: friendsAdapter(),
    cleanup: maintenanceAdapter(),
    outgoing: maintenanceAdapter(),
    wall: wallAdapter(),
    birthday: birthdayAdapter(),
  };
  const policies = {
    online: { read: online.loadVkOnline, save: online.saveVkOnline },
    friends: { read: friends.loadVkFriends, save: friends.saveVkFriends },
    wall: wallPolicy,
    birthday: vkBirthdaySettings,
    ...Object.fromEntries(
      ['cleanup', 'outgoing'].map((kind) => [
        kind,
        {
          read: (target) => maintenance.loadVkMaintenance(target, kind),
          save: (target, settings) =>
            maintenance.saveVkMaintenance(target, kind, settings),
        },
      ])
    ),
  };
  const clock = {
    now: () => at,
    setInterval: (callback, milliseconds) => {
      const id = ++nextTimer;
      timers.set(id, { callback, milliseconds });
      return id;
    },
    clearInterval: (id) => timers.delete(id),
  };
  const stop = async () => {
    for (const job of jobs) {
      await job.stop();
    }
    jobs = [];
  };
  const open = async () => {
    store = await createLinoTextStore(join(directory, 'links.lino'));
    jobs = independentVkKinds.map((kind) => {
      const adapter = adapters[kind];
      const options = { store, ...personalFixtureOptions(adapter, clock) };
      if (kind === 'online') {
        return createVkOnlineJob(options);
      }
      if (kind === 'friends') {
        return friendsJob(store, adapter, clock);
      }
      if (kind === 'wall') {
        return wallJob(store, adapter, clock);
      }
      if (kind === 'birthday') {
        return birthdayJob(store, adapter, clock);
      }
      return createVkMaintenanceJob({ ...options, kind });
    });
    for (const job of jobs) {
      job.start();
    }
  };
  const fixture = {
    adapters,
    timers,
    stop,
    advance: (milliseconds) => {
      at += milliseconds;
    },
    read: (kind) => policies[kind].read(store),
    save: (kind, settings) => policies[kind].save(store, settings),
    poll: async () => {
      for (const { callback } of timers.values()) {
        await callback();
      }
    },
    reopen: async () => {
      await stop();
      await store.close();
      await open();
    },
  };
  try {
    await open();
    return await work(fixture);
  } finally {
    await stop();
    await store?.close();
    await rm(directory, { recursive: true, force: true });
  }
};
