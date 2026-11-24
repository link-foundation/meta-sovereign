import {
  discoveryKey,
  discoveryOptions,
  discoveryResult,
} from '../jobs/discovery-data.js';
import { jobsBrowserOptions } from '../jobs/options.js';

export const createDiscoveryApi = ({ get, report }) => ({
  vacancyDiscoveryStatus: async (input = {}) => {
    const { browserSlot } = jobsBrowserOptions(input);
    if (input.requestId !== undefined) {
      discoveryKey(input);
    }
    return discoveryResult(
      await get(
        `/api/vacancies/discovery-status?${new URLSearchParams({
          browserSlot,
          ...(input.requestId === undefined
            ? {}
            : { requestId: input.requestId }),
        })}`
      ),
      input
    );
  },
  ...Object.fromEntries(
    ['start', 'stop'].map((action) => [
      `vacancyDiscovery${action[0].toUpperCase()}${action.slice(1)}`,
      async (input) => {
        const expected =
          action === 'start' ? discoveryOptions(input) : undefined;
        if (action !== 'start') {
          discoveryKey(input);
        }
        return discoveryResult(
          await report(`/api/vacancies/discovery-${action}`, input, {
            network: true,
            read: false,
          }),
          input,
          expected
        );
      },
    ])
  ),
});
