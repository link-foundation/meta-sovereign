import {
  createBrowserStore,
  createInMemoryDriver,
} from '../../src/storage/browser-store.js';

/** Hold one real-store snapshot refusal until concurrent readers are observed. */
export const refusedSnapshot = async () => {
  const driver = createInMemoryDriver();
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const failure = Object.assign(new Error('fixture snapshot quota'), {
    code: 'ENOSPC',
  });
  let armed = false;
  const store = await createBrowserStore({
    driver: {
      load: driver.load,
      async save(snapshot) {
        if (armed) {
          armed = false;
          entered.resolve();
          await release.promise;
          throw failure;
        }
        await driver.save(snapshot);
      },
    },
  });
  return {
    driver,
    store,
    entered,
    release,
    failure,
    failNext: () => {
      armed = true;
    },
  };
};
