import {
  friendsAdapter,
  friendsServer,
  friendsJob,
} from './vk-friends-fixture.mjs';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { saveVkFriends } from '../../js/src/automation/vk-friends.js';
export const desktopSettings = {
  enabled: false,
  everyMinutes: 20,
  maxFriends: 10000,
  batchSize: 23,
  priorityIds: [],
  acceptancePolicy: 'desktop-ten-percent',
};
export const desktopAdapter = ({
  count = 1,
  ids = Array.from({ length: 20 }, (_, i) => 101 + i),
  methods = {},
  ...extra
} = {}) => {
  const relations = new Map(ids.map((id) => [id, 2]));
  const mutuals = new Map(ids.map((id) => [id, id % 10]));
  const adapter = friendsAdapter({
    ...extra,
    count,
    relations,
    methods: {
      'friends.getRequests': (params) => {
        const incoming = ids.filter((id) => relations.get(id) === 2);
        return {
          count: incoming.length,
          items: incoming.slice(0, Number(params.count)),
        };
      },
      'friends.getMutual': (params) =>
        params.target_uids
          .split(',')
          .map(Number)
          .map((id) => ({ id, common_count: mutuals.get(id) ?? 0 })),
      ...methods,
    },
  });
  return { ...adapter, mutuals };
};
export const desktopServer = () => friendsServer({ adapter: desktopAdapter() });

/** Each policy probe owns its saved state and always drains the owned job. */
export const withDesktopJob = async (check) => {
  const store = createMemoryStore();
  const adapter = desktopAdapter();
  await saveVkFriends(store, desktopSettings);
  const job = friendsJob(store, adapter);
  try {
    return await check({ store, adapter, job });
  } finally {
    await job.stop();
  }
};
