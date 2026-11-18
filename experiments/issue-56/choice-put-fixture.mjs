import {
  createBrowserStore,
  createInMemoryDriver,
} from '../../js/src/storage/browser-store.js';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';

/** One finite real-store persistence refusal; provider traffic remains synthetic. */
export const choicePutFixture = async (browser) => {
  const driver = createInMemoryDriver();
  let failed = 0,
    armed = false;
  const store = await createBrowserStore({
    driver: {
      load: driver.load,
      async save(snapshot) {
        if (armed) {
          armed = false;
          failed++;
          throw Object.assign(new Error('fixture snapshot quota'), {
            code: 'ENOSPC',
          });
        }
        await driver.save(snapshot);
      },
    },
  });
  try {
    const fixture = await vacancyBrowserFixture(browser, { store });
    return {
      ...fixture,
      failNext: () => {
        armed = true;
      },
      failed: () => failed,
      snapshot: driver.load,
      close: async () => {
        try {
          await fixture.close();
        } finally {
          await store.close();
        }
      },
    };
  } catch (error) {
    await store.close();
    throw error;
  }
};
