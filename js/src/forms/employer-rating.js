import { formFailure as failure } from './options.js';

const pollUrl = 'https://rating.hh.ru/poll';

export const employerRatingDestination = (url) =>
  typeof url === 'string' && (url === pollUrl || url === `${pollUrl}/`)
    ? pollUrl
    : null;

const hhLogin = (url) =>
  /^https:\/\/(?:www\.)?hh\.ru\/account\/login\/?(?:[?#].*)?$/u.test(url);

/** Only transfer secure cookies scoped to the provider in an isolated slot. */
export const seedEmployerRating = async (source, destination, verify) => {
  const current = source?.url();
  if (
    !/^https:\/\/(?:www\.)?hh\.ru\/chat(?:\/\d{1,30})?\/?(?:[?#].*)?$/u.test(
      current ?? ''
    ) ||
    destination.url() !== 'about:blank' ||
    source.context() === destination.context()
  ) {
    return false;
  }
  const cookies = (await source.context().cookies('https://hh.ru')).filter(
    ({ domain, path, secure }) =>
      secure && /^(?:\.)?hh\.ru$/iu.test(domain) && path.startsWith('/')
  );
  await verify();
  if (
    source.url() !== current ||
    destination.url() !== 'about:blank' ||
    !cookies.length ||
    cookies.length > 100
  ) {
    return false;
  }
  await destination.context().addCookies(cookies);
  return true;
};

/* global document */
const pollSearch = ({ url, company, write, seeded }) => {
  const current = globalThis.location.href;
  if (current !== url && current !== `${url}/`) {
    return 'rating-unavailable';
  }
  const visible = (element) =>
    element.getClientRects().length > 0 &&
    globalThis.getComputedStyle(element).visibility === 'visible';
  if (/Подводим итоги|Голосование завершено/iu.test(document.body?.innerText)) {
    return 'rating-closed';
  }
  const signedIn = [
    ...document.querySelectorAll(
      '[data-qa="mainmenu_applicantProfile"],a[href^="/account/logout"],form[action^="/account/logout"],a[href^="https://hh.ru/account/logout"]'
    ),
  ].some(visible);
  if (!seeded || !signedIn) {
    return 'rating-sign-in';
  }
  const label =
    /^(?:найти компанию|название компании|введите название компании|поиск по названию компании|найти работодателя|название работодателя|find a company|company name|search (?:for |by )?(?:a )?company(?: name)?)$/iu;
  const fields = [...document.querySelectorAll('input')].filter((input) => {
    if (
      !['text', 'search'].includes(input.type) ||
      !visible(input) ||
      input.matches(':disabled,[readonly],[aria-readonly="true"]') ||
      input.closest('[inert],[aria-disabled="true"]')
    ) {
      return false;
    }
    const names = [
      input.placeholder,
      input.getAttribute('aria-label'),
      ...(input.getAttribute('aria-labelledby')?.split(/\s+/u) ?? []).map(
        (id) => document.getElementById(id)?.textContent
      ),
      ...[...(input.labels ?? [])].map(({ textContent }) => textContent),
    ];
    return names.some((name) => label.test(name?.trim() ?? ''));
  });
  if (fields.length !== 1) {
    return 'rating-unavailable';
  }
  const [field] = fields;
  if (field.value === company) {
    return 'rating-ready';
  }
  if (!write || field.value) {
    return 'rating-unavailable';
  }
  Object.getOwnPropertyDescriptor(
    globalThis.HTMLInputElement.prototype,
    'value'
  ).set.call(field, company);
  field.dispatchEvent(
    new globalThis.InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
    })
  );
  return field.value === company ? 'rating-ready' : 'rating-unavailable';
};

export const prepareEmployerRating = async ({
  page,
  company,
  seeded,
  check,
  verify,
}) => {
  check();
  await verify();
  check();
  const current = page.url();
  if (hhLogin(current)) {
    return 'rating-sign-in';
  }
  if (!employerRatingDestination(current)) {
    throw failure(
      'question-form-destination',
      'The employer rating poll opened an unrelated page.'
    );
  }
  const input = { url: pollUrl, company, seeded };
  const status = await page.evaluate(pollSearch, { ...input, write: true });
  check();
  if (status !== 'rating-ready') {
    return status;
  }
  const confirmed = await page.evaluate(pollSearch, { ...input, write: false });
  check();
  return confirmed;
};

export const checkRatingRequest = (url, company, seed, verify) => {
  if (
    !employerRatingDestination(url) ||
    typeof company !== 'string' ||
    !company.trim() ||
    company.length > 600 ||
    /[\r\n\t]/u.test(company) ||
    typeof seed !== 'function' ||
    typeof verify !== 'function'
  ) {
    throw failure(
      'form-rating-target',
      'Use a verified employer rating invitation.'
    );
  }
};
