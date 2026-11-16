import { loadResumeIndustries } from './industries.js';
import { loadResumeAreas, resolveResumeArea } from './areas.js';
export { areaDirectory as cvAreaDirectory } from './areas.js';
import { cvPrepareFailure } from './cv-prepare-record.js';

const invalid = () => {
  throw cvPrepareFailure('dictionary');
};
const label = (value) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) {
    invalid();
  }
  return value;
};
/** Public localized dictionaries only; never attach to an owner's browser. */
export const loadCvWorkplaceDictionaries = async ({
  store,
  signal,
  fetchImpl = globalThis.fetch,
  now = Date.now,
}) => {
  const result = { areas: {}, industries: {} };
  for (const language of ['ru', 'en']) {
    result.areas[language] = await loadResumeAreas({
      store,
      language,
      signal,
      fetchImpl,
      now,
    });
    result.industries[language] = await loadResumeIndustries({
      store,
      language,
      signal,
      fetchImpl,
      now,
    });
  }
  return result;
};
const key = (value) =>
  value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
export const cvAreaIdentity = (name, dictionaries) => {
  if (!name) {
    return null;
  }
  return resolveResumeArea(
    name,
    ['ru', 'en'].flatMap((language) => dictionaries.areas[language])
  ).id;
};
export const cvLocalizedEntry = (section, id) => {
  const result = { id };
  for (const language of ['ru', 'en']) {
    const matches = section[language].filter((row) => row.id === id);
    if (matches.length !== 1) {
      invalid();
    }
    if (
      section[language].filter((row) => key(row.name) === key(matches[0].name))
        .length !== 1
    ) {
      invalid();
    }
    result[language] = {
      name: label(matches[0].name),
      parent: matches[0].parent,
    };
  }
  return result;
};
