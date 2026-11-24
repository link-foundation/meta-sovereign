import { applicationBatchResult } from '../jobs/application-batch-data.js';
import { vacancyChoiceSlot } from '../jobs/vacancy-choice.js';
import { sameUnreadSkip } from '../automation/question-unread-polling-state.js';

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
  vacancyApplicationBatchChatSkip: async (input) => {
    const receipt = applicationBatchResult(
      await report('/api/vacancies/application-batch-chat-skip', input, {
        network: true,
        read: false,
      }),
      input
    );
    const worker = receipt.batch?.chatWorker;
    if (
      worker?.passId !== input.chatReview.id ||
      !sameUnreadSkip(worker?.lastSkip, input.chatReview)
    ) {
      throw Object.assign(new Error('Skip could not be confirmed.'), {
        code: 'jobs-application-chats-skip-changed',
      });
    }
    return receipt;
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
