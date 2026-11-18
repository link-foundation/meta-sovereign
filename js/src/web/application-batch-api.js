import { applicationBatchResult } from '../jobs/application-batch-data.js';
import { vacancyChoiceSlot } from '../jobs/vacancy-choice.js';

export const createApplicationBatchApi = ({ get, report }) => ({
  vacancyApplicationBatchStatus: async (input = {}) => {
    const query = {
      browserSlot: vacancyChoiceSlot(input),
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    };
    return applicationBatchResult(
      await get(
        `/api/vacancies/application-batch-status?${new URLSearchParams(query)}`
      ),
      input
    );
  },
  ...Object.fromEntries(
    ['start', 'stop', 'mode'].map((action) => [
      `vacancyApplicationBatch${action[0].toUpperCase()}${action.slice(1)}`,
      async (input) =>
        applicationBatchResult(
          await report(`/api/vacancies/application-batch-${action}`, input, {
            network: true,
            read: false,
          }),
          input
        ),
    ])
  ),
});
