import { hhSearchBase, validateSearchBase } from './search-url.js';
import { jobsFailure } from './options.js';

const invalid = () => {
  throw jobsFailure(
    'application-input',
    'Use valid application route settings.'
  );
};

export const defaultApplicationSearchUrl = 'https://hh.ru/search/vacancy';

/** Omitted options preserve acknowledged legacy signatures. */
export const applicationRouteSettings = (input) => {
  if (
    input.applyFromVacancyPage !== undefined &&
    typeof input.applyFromVacancyPage !== 'boolean'
  ) {
    invalid();
  }
  const result = {};
  if (input.applyFromVacancyPage !== undefined) {
    result.applyFromVacancyPage = input.applyFromVacancyPage;
  }
  if (input.applicationSearchUrl !== undefined) {
    const url = hhSearchBase(input.applicationSearchUrl);
    if (!url) {
      invalid();
    }
    validateSearchBase(url);
    result.applicationSearchUrl = url.href;
  }
  return result;
};

export const applicationRouteView = (options) => ({
  applyFromVacancyPage: options.applyFromVacancyPage !== false,
  applicationSearchUrl:
    options.applicationSearchUrl ?? defaultApplicationSearchUrl,
});

export const matchingApplicationRoute = (receipt, input = {}) => {
  try {
    applicationRouteSettings(receipt);
    applicationRouteSettings(input);
    return ['applyFromVacancyPage', 'applicationSearchUrl'].every(
      (key) => input[key] === undefined || receipt[key] === input[key]
    );
  } catch {
    return false;
  }
};
