import { useVacancyRecords } from './vacancy-record-state.js';

const adapter = {
  read: 'vacancyChoicesStored',
  readOperation: 'choices-stored',
  writeOperation: 'choice-save',
  reloadError: 'jobs-choice-reload',
  write: (api, identity, { card, state, note }) =>
    state
      ? api.vacancyChoiceSave({
          ...identity,
          url: card.url,
          title: card.title,
          state,
          note,
        })
      : api.vacancyChoiceClear({ ...identity, url: card.url }),
};
export const useVacancyChoices = (options) => {
  const records = useVacancyRecords({ ...options, adapter });
  return {
    ...records,
    change: (card, state, note = '') => records.change({ card, state, note }),
  };
};
