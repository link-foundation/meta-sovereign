/** Preserve an owner's native HH filters without accepting another destination. */
const invalid = () => {
  throw Object.assign(new Error('Use a valid HH vacancy search URL.'), {
    code: 'jobs-input',
  });
};
const controls = (value, space = false) =>
  [...value].some((character) => {
    const code = character.codePointAt(0);
    return code <= (space ? 32 : 31) || code === 127;
  });
export const hhSearchBase = (value) => {
  if (value === undefined || value === '') {
    return null;
  }
  if (
    typeof value !== 'string' ||
    value.length > 6000 ||
    controls(value, true)
  ) {
    invalid();
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    invalid();
  }
  validateDestination(url);
  validateParameters(url);
  return url;
};
const validateDestination = (url) => {
  if (
    url.origin !== 'https://hh.ru' ||
    url.pathname !== '/search/vacancy' ||
    url.username ||
    url.password ||
    url.hash ||
    [...url.searchParams].length > 100
  ) {
    invalid();
  }
};
const validateParameters = (url) => {
  for (const [key, entry] of url.searchParams) {
    if (
      !/^[a-zA-Z0-9_-]{1,100}$/u.test(key) ||
      /password|token|authorization|csrf|session|cookie/iu.test(key) ||
      entry.length > 1000 ||
      controls(entry)
    ) {
      invalid();
    }
  }
  for (const key of ['resume', 'page', 'salary', 'currency', 'order_by']) {
    if (url.searchParams.getAll(key).length > 1) {
      invalid();
    }
  }
};

export const searchFieldKeys = Object.freeze({
  text: 'query',
  resume: 'resume',
  area: 'area',
  order_by: 'order',
  currency: 'currency',
  page: 'page',
  salary: 'salary',
  work_format: 'remote',
});

/** Critical identities and numeric controls have the same limits as typed fields. */
export const validateSearchBase = (url) => {
  const one = (key, expression) => {
    const value = url.searchParams.get(key);
    if (value !== null && !expression.test(value)) {
      invalid();
    }
  };
  one('resume', /^[a-zA-Z0-9_-]{1,100}$/u);
  one('page', /^(?:0|[1-9]\d{0,2})$/u);
  one('salary', /^(?:0|[1-9]\d{0,8})$/u);
  one('currency', /^(?:RUR|USD|EUR)$/u);
  one('order_by', /^(?:salary_desc|publication_time|relevance)$/u);
  if (Number(url.searchParams.get('salary')) > 100000000) {
    invalid();
  }
};
