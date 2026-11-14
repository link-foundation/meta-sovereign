import { applicationResult } from '../jobs/application-result.js';
import { applicationKey } from '../jobs/application-options.js';
import { jobsFailure } from '../jobs/options.js';
import { applicationQueueResult } from '../jobs/application-deferral-data.js';
import { vacancyChoiceSlot } from '../jobs/vacancy-choice.js';
const confirmed = (raw, input, missing = false) => {
  if (!raw || raw.ok === false || raw.error) {
    throw jobsFailure(
      'application-unconfirmed',
      'Native application status was not confirmed.'
    );
  }
  const result = applicationResult(raw, input);
  if (!missing && result.mode === 'hh-application-missing') {
    throw jobsFailure(
      'application-unconfirmed',
      'The application action was not confirmed.'
    );
  }
  return result;
};
export const createApplicationApi = ({ get, report }) => ({
  vacancyApplicationQueue: async (input) =>
    applicationQueueResult(
      await get(
        `/api/vacancies/application-queue?${new URLSearchParams({ browserSlot: vacancyChoiceSlot(input) })}`
      ),
      input
    ),
  vacancyApplicationStatus: async (input) => {
    const { url, browserSlot } = applicationKey(input);
    const query = {
      url,
      browserSlot,
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    };
    return confirmed(
      await get(
        `/api/vacancies/application-status?${new URLSearchParams(query)}`
      ),
      input,
      true
    );
  },
  ...Object.fromEntries(
    [
      'open',
      'read',
      'advance',
      'prefill',
      'resume',
      'backup',
      'restore',
      'defer',
      'retry',
      'mode',
      'close',
    ].map((operation) => [
      `vacancyApplication${operation[0].toUpperCase()}${operation.slice(1)}`,
      async (input) => {
        const result = confirmed(
          await report(`/api/vacancies/application-${operation}`, input, {
            network: true,
            read: false,
          }),
          input
        );
        if (
          operation === 'resume' &&
          ['choose', 'context'].includes(input.action) &&
          !result.testMode &&
          !result.resumeSelection
        ) {
          throw jobsFailure(
            'application-unconfirmed',
            'The native resume choice was not confirmed.'
          );
        }
        return result;
      },
    ])
  ),
});
