import { readAssignmentPage } from './read-page.js';
import { assignmentFailure, assignmentVacancyUrl } from './validation.js';
import { vacancyContent } from './vacancy-content.js';

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
  const text = (selector, limit, equivalentAliases = false) => {
    const elements = [...document.querySelectorAll(selector)].filter(
      (node) => node.getClientRects().length
    );
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
    employment: text('[data-qa="vacancy-view-employment-mode"]', 1000),
    workFormat: workFormats?.join('\n') ?? null,
    published: text(
      '[data-qa="vacancy-view-creation-time"], [data-qa="vacancy-creation-time"]',
      1000,
      true
    ),
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
