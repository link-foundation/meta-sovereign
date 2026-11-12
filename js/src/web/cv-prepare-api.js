import {
  cvPrepareOptions,
  cvPrepareResult,
} from '../jobs/cv-prepare-record.js';

export const createCvPrepareApi = ({ get, report, local }) => ({
  vacancyCvPrepare: async (input) => {
    cvPrepareOptions(input);
    const raw = await report('/api/vacancies/cv-prepare', input, {
      network: true,
      read: false,
    });
    const answer = cvPrepareResult(raw?.preparation, input);
    if (!answer.preparation) {
      throw new Error('jobs-cv-state');
    }
    return answer;
  },
  vacancyCvPrepareStatus: async (input) => {
    const raw = await get(
      `/api/vacancies/cv-prepare-status?${new URLSearchParams(input)}`
    );
    if (raw) {
      return cvPrepareResult(raw.preparation, input);
    }
    const store = await local();
    const requestId =
      input.requestId ??
      (await store.get(`jobs-cv-prepare-latest:${input.browserSlot}`))
        ?.requestId;
    const row = requestId
      ? await store.get(`jobs-cv-prepare:${requestId}`)
      : null;
    const answer = cvPrepareResult(row ?? null, input);
    if (
      ['starting', 'opening', 'preparing'].includes(answer.preparation?.state)
    ) {
      answer.preparation = {
        ...answer.preparation,
        state: 'interrupted',
        code: 'jobs-cv-interrupted',
      };
    }
    return answer;
  },
});
