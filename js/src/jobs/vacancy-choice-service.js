import {
  vacancyChoiceSlot,
  vacancyChoiceId,
  vacancyChoiceResult,
  vacancyChoiceEntry,
  vacancyChoiceInput,
  vacancyChoiceFailure,
} from './vacancy-choice.js';
import { saveTechnologyRecord } from './technology-storage.js';
import { acknowledgedWrite, acknowledgedRead } from './acknowledged-store.js';

export const storedVacancyChoices = async (store, input = {}) => {
  const browserSlot = vacancyChoiceSlot(input);
  const raw = await store.get(vacancyChoiceId(browserSlot));
  return vacancyChoiceResult(
    raw ?? {
      version: 1,
      browserSlot,
      revision: 'empty',
      entries: [],
    },
    { browserSlot }
  );
};

export const createVacancyChoiceService = ({ store, run }) => {
  const change = (input, remove) => {
    const options = vacancyChoiceInput(input);
    // Validate every owner value before entering the shared mutation lane.
    const choice = remove
      ? null
      : vacancyChoiceEntry({
          ...input,
          url: options.url,
          updatedAt: new Date().toISOString(),
        });
    return acknowledgedWrite(store, run, async (signal) => {
      const before = await storedVacancyChoices(store, options);
      if (before.revision !== options.revision) {
        throw vacancyChoiceFailure('conflict');
      }
      const entries = before.entries.filter((row) => row.url !== options.url);
      if (choice) {
        entries.unshift(choice);
      }
      if (entries.length > 1000) {
        throw vacancyChoiceFailure('capacity');
      }
      signal.throwIfAborted();
      const next = vacancyChoiceResult(
        { ...before, entries, revision: globalThis.crypto.randomUUID() },
        options
      );
      await saveTechnologyRecord(store, {
        id: vacancyChoiceId(options.browserSlot),
        ...next,
      });
      return next;
    });
  };
  return {
    'choices-stored': (input) =>
      acknowledgedRead(store, () => storedVacancyChoices(store, input)),
    'choice-save': (input) => change(input, false),
    'choice-clear': (input) => change(input, true),
  };
};
