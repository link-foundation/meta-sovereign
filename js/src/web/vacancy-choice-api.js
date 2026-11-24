import {
  vacancyChoiceResult,
  vacancyChoiceInput,
  vacancyChoiceSlot,
  vacancyChoiceEntry,
  vacancyChoiceFailure,
} from '../jobs/vacancy-choice.js';
import { storedVacancyChoices } from '../jobs/vacancy-choice-service.js';

export const createVacancyChoiceApi = ({ get, report, local }) => ({
  vacancyChoicesStored: async (input) => {
    const browserSlot = vacancyChoiceSlot(input);
    const answer = await get(
      `/api/vacancies/choices-stored?${new URLSearchParams({ browserSlot })}`
    );
    return answer === null
      ? storedVacancyChoices(await local(), { browserSlot })
      : vacancyChoiceResult(answer, { browserSlot });
  },
  ...Object.fromEntries(
    ['save', 'clear'].map((operation) => [
      `vacancyChoice${operation === 'save' ? 'Save' : 'Clear'}`,
      async (input) => {
        const expected = vacancyChoiceInput(input);
        const result = vacancyChoiceResult(
          await report(`/api/vacancies/choice-${operation}`, input, {
            network: true,
            read: false,
          }),
          input
        );
        const entry = result.entries.find((row) => row.url === expected.url);
        const wanted =
          operation === 'save'
            ? vacancyChoiceEntry({
                ...input,
                updatedAt: new Date().toISOString(),
              })
            : null;
        if (
          result.revision === expected.revision ||
          (wanted
            ? !entry ||
              ['title', 'state', 'note'].some(
                (key) => entry[key] !== wanted[key]
              )
            : entry)
        ) {
          throw vacancyChoiceFailure('unconfirmed');
        }
        return result;
      },
    ])
  ),
});
