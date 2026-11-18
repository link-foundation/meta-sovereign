import { vacancyChoiceSlot } from '../jobs/vacancy-choice.js';
import {
  vacancySkipResult,
  vacancySkipClearInput,
  vacancySkipFailure,
} from '../jobs/vacancy-skip-data.js';
import { storedVacancySkips } from '../jobs/vacancy-skip-service.js';

export const createVacancySkipApi = ({ get, report, local }) => ({
  vacancySkipsStored: async (input) => {
    const browserSlot = vacancyChoiceSlot(input);
    const answer = await get(
      `/api/vacancies/skips-stored?${new URLSearchParams({ browserSlot })}`
    );
    return answer === null
      ? storedVacancySkips(await local(), { browserSlot })
      : vacancySkipResult(answer, { browserSlot });
  },
  vacancySkipClear: async (input) => {
    const expected = vacancySkipClearInput(input);
    const result = vacancySkipResult(
      await report('/api/vacancies/skip-clear', expected, {
        network: true,
        read: false,
      }),
      expected
    );
    if (
      result.revision === expected.revision ||
      result.entries.some((row) =>
        expected.url ? row.url === expected.url : row.reason === expected.reason
      )
    ) {
      throw vacancySkipFailure('unconfirmed');
    }
    return result;
  },
});
