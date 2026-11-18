import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startServer } from '../../js/src/server/index.js';
import { createVkLive } from '../../js/src/sources/vk.js';
import { createFakeVk } from '../../js/tests/helpers/fake-vk.js';

/** The actual adapter against a finite synthetic provider, with no credentials. */
export const onlineAdapter = () => {
  let mode = 'confirmed';
  const fake = createFakeVk({
    methods: {
      'account.setOnline': () => {
        if (mode === 'refused') {
          return {
            error: { error_code: 5, error_msg: 'Fixture user token refused' },
          };
        }
        if (mode === 'unknown') {
          throw new Error('Fixture response lost');
        }
        return mode === 'confirmed' ? 1 : 0;
      },
    },
  });
  const live = createVkLive({
    ...fake,
    requestsPerSecond: 1000,
    sleep: async () => {},
  });
  return {
    fake,
    live,
    mode: (value) => {
      mode = value;
    },
  };
};

export const onlineServer = async ({
  scheduler = false,
  clock = {},
  port = 0,
} = {}) => {
  const store = createMemoryStore();
  const adapter = onlineAdapter();
  let refuseWrites = false;
  let messages = 0;
  store.flush = async () => {
    if (refuseWrites) {
      throw new Error('Fixture online acknowledgement refused');
    }
  };
  const server = await startServer({
    store,
    port,
    localUi: true,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: {
      scheduler,
      vkOnline: {
        ...clock,
        resolve: () => ({ live: adapter.live }),
        optionsFor: async () => ({ token: 'fixture-user-token' }),
      },
      send: async () => {
        messages++;
        throw new Error('Unexpected message send');
      },
    },
    log: null,
  });
  return {
    store,
    ...adapter,
    base: `http://127.0.0.1:${server.port}`,
    port: server.port,
    messages: () => messages,
    refuseWrites: (value) => {
      refuseWrites = value;
    },
    close: () => server.close(),
  };
};
