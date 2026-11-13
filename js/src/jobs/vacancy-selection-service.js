import { storedVacancyChoices } from './vacancy-choice-service.js';
import { storedVacancies } from './technology-service.js';
import { vacancyChoiceSlot } from './vacancy-choice.js';
import {
  vacancySelectionDecision,
  vacancySelectionOptions,
  vacancySelectionResult,
} from './vacancy-selection.js';

/** Called inside the owned search lane, after the native reader has completed. */
export const reviewVacancySearch = async (store, result, input) => {
  const browserSlot = vacancyChoiceSlot(input);
  const filters = vacancySelectionOptions(input);
  const choices = await storedVacancyChoices(store, { browserSlot });
  const cached = filters.excludeText.length
    ? (await storedVacancies(store)).entries
    : [];
  const selection = vacancySelectionResult(
    {
      version: 1,
      browserSlot,
      choiceRevision: choices.revision,
      filters,
      decisions: result.cards.map((card) =>
        vacancySelectionDecision(card, choices, cached, filters)
      ),
    },
    result,
    input
  );
  return { ...result, selection };
};
