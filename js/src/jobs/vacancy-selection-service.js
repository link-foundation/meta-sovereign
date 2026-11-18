import { storedVacancyChoices } from './vacancy-choice-service.js';
import { storedVacancySkips } from './vacancy-skip-service.js';
import {
  pendingDeferredVacancies,
  storedDeferredQuestions,
} from './deferred-questions.js';
import { storedVacancies } from './technology-service.js';
import { vacancyChoiceSlot } from './vacancy-choice.js';
import {
  vacancySelectionDecision,
  vacancySelectionOptions,
  vacancySelectionResult,
} from './vacancy-selection.js';

/** Called inside the owned search lane, after the native reader has completed. */
export const reviewVacancySearch = async (
  store,
  result,
  input,
  retryWaiting = () => false
) => {
  const browserSlot = vacancyChoiceSlot(input);
  const filters = vacancySelectionOptions(input);
  const choices = await storedVacancyChoices(store, { browserSlot });
  const skips = await storedVacancySkips(store, { browserSlot });
  const questions = await storedDeferredQuestions(store, { browserSlot });
  const deferred = await pendingDeferredVacancies(
    store,
    { ...input, browserSlot },
    questions
  );
  const cached = filters.excludeText.length
    ? (await storedVacancies(store)).entries
    : [];
  const selection = vacancySelectionResult(
    {
      version: 1,
      browserSlot,
      choiceRevision: choices.revision,
      skipRevision: skips.revision,
      questionRevision: questions.revision,
      filters,
      decisions: result.cards.map((card) => {
        const decision = vacancySelectionDecision(
          card,
          choices,
          cached,
          filters,
          skips
        );
        if (
          ['review', 'needs-description'].includes(decision.reason) &&
          deferred.has(card.url)
        ) {
          return { ...decision, reason: 'question-deferred' };
        }
        return ['review', 'needs-description'].includes(decision.reason) &&
          retryWaiting({ url: card.url, browserSlot })
          ? { ...decision, reason: 'retry-wait' }
          : decision;
      }),
    },
    result,
    input
  );
  return { ...result, selection };
};
