import { readAssignmentPage } from './read-page.js';
import {
  assignmentFailure,
  assignmentVacancy,
  assignmentVacancyUrl,
} from './validation.js';

export { assignmentVacancyUrl } from './validation.js';

export const readAssignmentVacancyDocument = () => {
  const { document } = globalThis;
  const text = (selector, limit) => {
    const element = document.querySelector(selector);
    if (!element || !element.getClientRects().length) {
      return '';
    }
    const value = element.innerText.trim();
    return value.length <= limit ? value : null;
  };
  const skills = [...document.querySelectorAll('[data-qa="skills-element"]')];
  return {
    url: globalThis.location.href,
    title: text('[data-qa="vacancy-title"]', 500),
    company: text('[data-qa="vacancy-company-name"]', 500),
    description: text('[data-qa="vacancy-description"]', 30000),
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
  (value, { signal } = {}) => {
    const url = assignmentVacancyUrl(value);
    return readAssignmentPage({
      store,
      openSession,
      signal,
      url,
      platform: 'hh',
      slot: 'assignment-vacancy',
      kind: 'vacancy',
      read: readAssignmentVacancyDocument,
      validate: (read) => {
        if (
          assignmentVacancyUrl(read.url) !== url ||
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
          url,
          capturedAt: new Date().toISOString(),
        };
      },
    });
  };
