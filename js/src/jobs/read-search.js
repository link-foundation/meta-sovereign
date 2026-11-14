import { readAssignmentPage } from '../assignments/read-page.js';
import { validateVacancySearch } from './search-result.js';
export { validateVacancySearch } from './search-result.js';

export const readVacancySearchDocument = () => {
  const { document, location } = globalThis;
  const visible = (node) => Boolean(node?.getClientRects().length);
  const challenge = [
    ...document.querySelectorAll(
      '[data-qa="captcha"], iframe[src*="captcha"], input[name="captcha"], input[data-qa="account-captcha-input"], input[name="captchaText"], .smart-captcha, .g-recaptcha, .h-captcha'
    ),
  ].some(visible);
  if (challenge) {
    return {
      url: location.href,
      cards: [],
      empty: false,
      challenge: true,
      next: null,
    };
  }
  const text = (root, selector, limit = 1000) => {
    const nodes = [...root.querySelectorAll(selector)].filter(visible);
    if (nodes.length > 1) {
      return null;
    }
    const value = nodes[0]?.innerText.trim() ?? '';
    return value.length <= limit ? value : null;
  };
  const links = [
    ...document.querySelectorAll('a[data-qa="serp-item__title"]'),
  ].filter(visible);
  const cards = links.slice(0, 101).map((link) => {
    const root = link.closest(
      '[data-qa="vacancy-serp__vacancy"], [data-qa="vacancy-serp__vacancy_standard"], [data-qa="vacancy-serp__vacancy_premium"]'
    );
    return {
      url: link.href,
      title: link.innerText.trim(),
      company: root
        ? text(root, '[data-qa="vacancy-serp__vacancy-employer"]')
        : '',
      salary: root
        ? text(root, '[data-qa="vacancy-serp__vacancy-compensation"]')
        : '',
      location: root
        ? text(root, '[data-qa="vacancy-serp__vacancy-address"]')
        : '',
      responded: root
        ? [
            ...root.querySelectorAll(
              '[data-qa="vacancy-serp__vacancy_responded"]'
            ),
          ].some(visible)
        : false,
    };
  });
  const next = [...document.querySelectorAll('a[data-qa="pager-next"]')].filter(
    visible
  );
  const nextNumber =
    Number(new URL(location.href).searchParams.get('page')) + 1;
  const numbered = [
    ...document.querySelectorAll(
      '[data-qa="pager-block"] a[data-qa="pager-page"]'
    ),
  ]
    .filter(visible)
    .filter(
      (link) =>
        Number(new URL(link.href).searchParams.get('page')) === nextNumber
    );
  const destinations = [
    ...new Set([...next, ...numbered].map((link) => link.href)),
  ];
  return {
    url: location.href,
    cards,
    empty: [
      ...document.querySelectorAll(
        '[data-qa="vacancy-serp__vacancy-not-found"], [data-qa="vacancy-serp__no-results"]'
      ),
    ].some(visible),
    challenge: false,
    next:
      destinations.length === 0
        ? null
        : destinations.length === 1
          ? destinations[0]
          : false,
  };
};

export const createVacancySearchReader =
  ({ store, openSession }) =>
  (url, { signal, browserSlot, headless }) =>
    readAssignmentPage({
      store,
      openSession,
      signal,
      url,
      platform: 'hh',
      slot: browserSlot,
      useCase: 'jobs',
      browserOptions: headless === undefined ? {} : { headless },
      kind: 'vacancy-search',
      read: readVacancySearchDocument,
      validate: (value) => validateVacancySearch(value, url),
    });
