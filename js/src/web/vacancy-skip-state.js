import { useVacancyRecords } from './vacancy-record-state.js';

const adapter = {
  read: 'vacancySkipsStored',
  readOperation: 'skips-stored',
  writeOperation: 'skip-clear',
  reloadError: 'jobs-skip-reload',
  write: (api, identity, filter) =>
    api.vacancySkipClear({ ...identity, ...filter }),
};
export const useVacancySkips = (options) =>
  useVacancyRecords({ ...options, adapter });
