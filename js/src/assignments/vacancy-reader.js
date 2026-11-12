import { readAssignmentPage } from './read-page.js';
import {
  assignmentFailure,
  assignmentVacancy,
  assignmentVacancyUrl,
} from './validation.js';
import { vacancyMetadata } from './vacancy-metadata.js';

export { assignmentVacancyUrl } from './validation.js';

export const readAssignmentVacancyDocument = () => {
  const { document } = globalThis;
  const text = (selector, limit) => {
    const elements = [...document.querySelectorAll(selector)].filter(
      (node) => node.getClientRects().length
    );
    if (elements.length > 1) {
      return null;
    }
    const element = elements[0];
    if (!element) {
      return '';
    }
    const value = element.innerText.trim();
    return value.length <= limit ? value : null;
  };
  const skills = [...document.querySelectorAll('[data-qa="skills-element"]')];
  return {
    url: globalThis.location.href,
    challenge: [
      ...document.querySelectorAll(
        '[data-qa="captcha"], iframe[src*="captcha"], input[name="captcha"]'
      ),
    ].some((node) => node.getClientRects().length),
    title: text('[data-qa="vacancy-title"]', 500),
    company: text('[data-qa="vacancy-company-name"]', 500),
    description: text('[data-qa="vacancy-description"]', 30000),
    salary: text('[data-qa="vacancy-salary"]', 1000),
    location: text(
      '[data-qa="vacancy-view-raw-address"], [data-qa="vacancy-view-location"]',
      1000
    ),
    experience: text('[data-qa="vacancy-experience"]', 1000),
    employment: text('[data-qa="vacancy-view-employment-mode"]', 1000),
    workFormat: text('[data-qa="vacancy-view-work-format"]', 1000),
    published: text('[data-qa="vacancy-view-creation-time"]', 1000),
    skills:
      skills.length <= 100
        ? skills
            .filter((node) => node.getClientRects().length)
            .map((node) => node.innerText.trim())
        : null,
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
          read.skills === null ||
          read.company === null
        ) {
          throw assignmentFailure(
            'vacancy-unavailable',
            'The intended vacancy title and description were not readable.'
          );
        }
        return {
          ...assignmentVacancy(read),
          ...vacancyMetadata(read),
          url,
          capturedAt: new Date().toISOString(),
        };
      },
    });
  };
