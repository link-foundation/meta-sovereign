import { readAssignmentPage } from './read-page.js';
import { assignmentFailure, assignmentVacancyUrl } from './validation.js';
import { vacancyContent } from './vacancy-content.js';
import { readLoadedVacancy } from './vacancy-loading.js';

export { assignmentVacancyUrl } from './validation.js';

export const readAssignmentVacancyDocument = () => {
  const { document } = globalThis;
  const challenge = [
    ...document.querySelectorAll(
      '[data-qa="captcha"], iframe[src*="captcha"], input[name="captcha"], input[data-qa="account-captcha-input"], input[name="captchaText"], .smart-captcha, .g-recaptcha, .h-captcha'
    ),
  ].some((node) => node.getClientRects().length);
  if (challenge) {
    return { url: globalThis.location.href, challenge: true };
  }
  const readText = (elements, limit, equivalentAliases = false) => {
    if (
      elements.length > 1 &&
      (!equivalentAliases ||
        elements.some(
          (node) => node.innerText.trim() !== elements[0].innerText.trim()
        ))
    ) {
      return null;
    }
    const element = elements[0];
    if (!element) {
      return '';
    }
    const value = element.innerText.trim();
    return value.length <= limit ? value : null;
  };
  const visible = (selector) =>
    [...document.querySelectorAll(selector)].filter(
      (node) => node.getClientRects().length
    );
  const text = (selector, limit, equivalentAliases = false) =>
    readText(visible(selector), limit, equivalentAliases);
  const publication = () => {
    const aliases = visible(
      '[data-qa="vacancy-view-creation-time"], [data-qa="vacancy-creation-time"]'
    );
    const times = visible('time');
    if (times.length > 100) {
      return null;
    }
    const dates = new Set();
    for (const node of times) {
      const parent = node.parentElement;
      if (
        node.closest(
          '[data-qa="vacancy-description"], [data-qa="vacancy-serp__vacancy"], form, [contenteditable]'
        ) ||
        !/^Вакансия опубликована(?:\s|$)/u.test(parent?.innerText.trim())
      ) {
        continue;
      }
      const date = node.getAttribute('datetime');
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
          date
        ) ||
        !Number.isFinite(Date.parse(date))
      ) {
        return null;
      }
      dates.add(date);
      aliases.push(parent);
    }
    return dates.size > 1 ? null : readText(aliases, 1000, true);
  };
  const texts = (selector, limit, maxItems) => {
    const nodes = [...document.querySelectorAll(selector)];
    if (nodes.length > 200) {
      return null;
    }
    const values = [
      ...new Set(
        nodes
          .filter((node) => node.getClientRects().length)
          .map((node) => node.innerText.trim())
          .filter(Boolean)
      ),
    ];
    return values.length <= maxItems && values.join('\n').length <= limit
      ? values
      : null;
  };
  const workFormats = texts('[data-qa*="work-format"]', 1000, 100);
  const descriptions = [
    ...document.querySelectorAll('[data-qa="vacancy-description"]'),
  ].filter((node) => node.getClientRects().length);
  const description = descriptions.length === 1 ? descriptions[0] : null;
  const html = description?.innerHTML;
  return {
    url: globalThis.location.href,
    challenge: false,
    title: text('[data-qa="vacancy-title"]', 500),
    company: text('[data-qa="vacancy-company-name"]', 500),
    description: text('[data-qa="vacancy-description"]', 30000),
    descriptionHtml: html?.length <= 120000 ? html : null,
    salary: text(
      '[data-qa="vacancy-salary"], [data-qa="vacancy-salary-compensation-type-net"], [data-qa="vacancy-salary-compensation-type-gross"]',
      1000,
      true
    ),
    location: text(
      '[data-qa="vacancy-view-raw-address"], [data-qa="vacancy-view-location"]',
      1000
    ),
    experience: text('[data-qa="vacancy-experience"]', 1000),
    employment: text(
      '[data-qa="vacancy-view-employment-mode"], [data-qa="common-employment-text"] dd',
      1000,
      true
    ),
    workFormat: workFormats?.join('\n') ?? null,
    published: publication(),
    skills: texts(
      '[data-qa="skills-element"], [data-qa="bloko-tag__text"]',
      50000,
      100
    ),
  };
};

/** Read-only vacancy extraction shares owned launch and shutdown semantics. */
export const createAssignmentVacancyReader =
  ({ store, openSession }) =>
  (
    value,
    {
      signal,
      browserSlot = 'assignment-vacancy',
      headless,
      useCase = 'assignments',
    } = {}
  ) => {
    const url = assignmentVacancyUrl(value);
    return readAssignmentPage({
      store,
      openSession,
      signal,
      url,
      platform: 'hh',
      slot: browserSlot,
      useCase,
      browserOptions: headless === undefined ? {} : { headless },
      kind: 'vacancy',
      read: readAssignmentVacancyDocument,
      execute: (session, check) =>
        readLoadedVacancy(session, readAssignmentVacancyDocument, {
          url,
          signal,
          check,
        }),
      validate: (read) => {
        if (
          assignmentVacancyUrl(read.url) !== url ||
          read.challenge ||
          !read.title ||
          !read.description ||
          read.descriptionHtml === null ||
          read.skills === null ||
          read.company === null
        ) {
          throw assignmentFailure(
            'vacancy-unavailable',
            'The intended vacancy title and description were not readable.'
          );
        }
        return vacancyContent({
          ...read,
          url,
          capturedAt: new Date().toISOString(),
        });
      },
    });
  };
