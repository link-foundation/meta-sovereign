import { questionKey } from '../automation/question-match.js';
import { vacancyChoiceSlot } from '../jobs/vacancy-choice.js';
import {
  deferredQuestionResult,
  deferredQuestionChange,
  deferredQuestionFailure,
} from '../jobs/deferred-question-data.js';
import { storedDeferredQuestions } from '../jobs/deferred-questions.js';

export const createVacancyQuestionApi = ({ get, report, local }) => ({
  vacancyQuestionsStored: async (input) => {
    const browserSlot = vacancyChoiceSlot(input);
    const answer = await get(
      `/api/vacancies/questions-stored?${new URLSearchParams({ browserSlot })}`
    );
    return answer === null
      ? storedDeferredQuestions(await local(), { browserSlot })
      : deferredQuestionResult(answer, { browserSlot });
  },
  vacancyQuestionChange: async (input) => {
    const expected = deferredQuestionChange(input);
    const result = deferredQuestionResult(
      await report('/api/vacancies/question-change', expected, {
        network: true,
        read: false,
      }),
      expected
    );
    const matches = result.entries.filter((row) =>
      expected.action === 'remove'
        ? row.id === expected.entryId
        : questionKey(row.question) === questionKey(expected.question)
    );
    if (
      result.revision === expected.revision ||
      (expected.action === 'remove'
        ? matches.length !== 0
        : matches.length !== 1 || matches[0].mode !== expected.mode)
    ) {
      throw deferredQuestionFailure('unconfirmed');
    }
    return result;
  },
});
