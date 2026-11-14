import { browserName } from '../browser/policy.js';
import {
  assignmentText,
  assignmentVacancyUrl,
} from '../assignments/validation.js';

export const jobsFailure = (code, message) =>
  Object.assign(new Error(message), { code: `jobs-${code}` });
const invalid = () => {
  throw jobsFailure('input', 'Use valid vacancy search and browser settings.');
};
export const jobsObject = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid();
  }
  return input;
};
export const jobsBrowserOptions = (input) => {
  jobsObject(input);
  if (input.headless !== undefined && typeof input.headless !== 'boolean') {
    invalid();
  }
  return {
    browserSlot: browserName(input.browserSlot ?? 'jobs'),
    ...(input.headless === undefined ? {} : { headless: input.headless }),
    useCase: 'jobs',
  };
};
const searchFields = (input) => {
  const query = assignmentText(input.query ?? '', 500, 'search query', true);
  const resume = assignmentText(
    input.resume ?? '',
    100,
    'selected resume',
    true
  );
  const area = assignmentText(input.area ?? '', 20, 'search area', true);
  const order = input.order ?? 'salary_desc';
  const currency = input.currency ?? 'RUR';
  if (
    (resume && !/^[a-zA-Z0-9_-]+$/u.test(resume)) ||
    (area && !/^\d{1,20}$/u.test(area)) ||
    !['salary_desc', 'publication_time', 'relevance'].includes(order) ||
    !['RUR', 'USD', 'EUR'].includes(currency)
  ) {
    invalid();
  }
  return { text: query, resume, area, order_by: order, currency };
};
const searchLimits = (input) => {
  const page = input.page ?? 0;
  if (
    !Number.isInteger(page) ||
    page < 0 ||
    page > 999 ||
    (input.remote !== undefined && typeof input.remote !== 'boolean') ||
    (input.salary !== undefined &&
      (!Number.isInteger(input.salary) ||
        input.salary < 0 ||
        input.salary > 100000000))
  ) {
    invalid();
  }
  return {
    page: String(page),
    salary: input.salary,
    work_format: input.remote ? 'REMOTE' : undefined,
  };
};
export const hhSearchUrl = (input) => {
  jobsObject(input);
  const url = new URL('https://hh.ru/search/vacancy');
  for (const [key, value] of Object.entries({
    ...searchFields(input),
    ...searchLimits(input),
  })) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.href;
};
export const collectionOptions = (input) => {
  jobsObject(input);
  if (input.refresh !== undefined && typeof input.refresh !== 'boolean') {
    invalid();
  }
  return {
    url: assignmentVacancyUrl(input.url),
    refresh: input.refresh === true,
    ...jobsBrowserOptions(input),
  };
};

/** A redirect or changed filter is not the requested result page. */
export const sameSearch = (actual, expected) => {
  try {
    const a = new URL(actual);
    const b = new URL(expected);
    a.searchParams.sort();
    b.searchParams.sort();
    return a.href === b.href;
  } catch {
    return false;
  }
};
