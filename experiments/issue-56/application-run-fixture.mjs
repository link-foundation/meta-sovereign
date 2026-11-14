import {
  applicationFixture,
  applicationPageFixture,
} from './application-fixture.mjs';
import { vacancySnapshotFixture } from './vacancy-fixture.mjs';

/** Finite independent vacancy documents for worker-policy regression tests. */
export const applicationRunFixture = (options = {}) => {
  const fixture = applicationFixture({
    ...options,
    application: {
      openSession: async () => {
        fixture.state.opened++;
        return {
          page: {},
          commander: {
            goto: async ({ url }) => {
              fixture.state.page = { ...applicationPageFixture(), url };
            },
            evaluate: async () => ({
              ...vacancySnapshotFixture(),
              url: fixture.state.page.url,
            }),
          },
          close: async () => {
            fixture.state.closed++;
          },
        };
      },
      ...options.application,
    },
  });
  return fixture;
};
export const applicationIdentity = (receipt, extra = {}) => ({
  url: receipt.url,
  browserSlot: receipt.browserSlot,
  requestId: receipt.requestId,
  revision: receipt.revision,
  ...extra,
});
