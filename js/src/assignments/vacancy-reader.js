import { openBrowserSession } from '../cv/browser.js';
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

/** Own a read-only, policy-configured browser through late launch and abort. */
export const createAssignmentVacancyReader =
  ({ store, openSession = openBrowserSession }) =>
  async (value, { signal } = {}) => {
    const url = assignmentVacancyUrl(value);
    let session;
    let closing;
    let expired = false;
    const close = () =>
      session
        ? (closing ??= Promise.resolve().then(() => session.close()))
        : Promise.resolve();
    const abort = () => {
      close().catch(() => {});
    };
    const check = () => {
      if (expired || signal?.aborted) {
        throw assignmentFailure(
          expired ? 'vacancy-timeout' : 'stopped',
          'Vacancy reading did not complete.'
        );
      }
    };
    const timer = globalThis.setTimeout(() => {
      expired = true;
      abort();
    }, 60000);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      check();
      session = await openSession({
        store,
        platform: 'hh',
        useCase: 'assignments',
        slot: 'assignment-vacancy',
      });
      check();
      await session.commander.goto({
        url,
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      check();
      const read = await session.commander.evaluate({
        fn: readAssignmentVacancyDocument,
        args: [],
      });
      check();
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
    } catch (error) {
      check();
      throw error.code?.startsWith('assignment-')
        ? error
        : assignmentFailure(
            'vacancy-unavailable',
            'The intended vacancy could not be read.'
          );
    } finally {
      signal?.removeEventListener('abort', abort);
      globalThis.clearTimeout(timer);
      await close();
    }
  };
