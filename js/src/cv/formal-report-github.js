import { runCvTranslator } from '../jobs/cv-translation-process.js';
import { FORMAL_REPORT_REPOSITORY } from './formal-report-content.js';
import { formalReportUrl } from './formal-report-shape.js';

const root = `repos/${FORMAL_REPORT_REPOSITORY}`;
const number = (value) => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('The upstream issue identity was not confirmed.');
  }
  return value;
};
const checkedIssue = (issue) => {
  number(issue.number);
  if (
    !['open', 'closed'].includes(issue.state) ||
    issue.html_url !==
      `https://github.com/${FORMAL_REPORT_REPOSITORY}/issues/${issue.number}`
  ) {
    throw new Error('The upstream repository was not confirmed.');
  }
  return issue;
};

/** Fixed repository, bounded private pipes, paginated reads and single-attempt writes. */
export const createFormalReportGithub = ({ run = runCvTranslator } = {}) => {
  const api = async (args, signal, input = '') =>
    JSON.parse(await run('gh', ['api', ...args], { signal, input }));
  return {
    search: async (term, signal) => {
      const pages = await api(
        [
          '--method',
          'GET',
          'search/issues',
          '--paginate',
          '--slurp',
          '-f',
          `q=repo:${FORMAL_REPORT_REPOSITORY} is:issue "${term}" in:body,comments`,
          '-f',
          'per_page=100',
        ],
        signal
      );
      const issues = pages.flatMap((page) => page.items ?? []);
      if (
        !pages.length ||
        pages.some((page) => page.incomplete_results) ||
        pages[0].total_count !== issues.length ||
        issues.length > 1000
      ) {
        throw new Error('The complete upstream search was not confirmed.');
      }
      return issues.map(checkedIssue);
    },
    issue: async (id, signal) =>
      checkedIssue(await api([`${root}/issues/${number(id)}`], signal)),
    comments: async (id, signal) => {
      const pages = await api(
        [
          `${root}/issues/${number(id)}/comments?per_page=100`,
          '--paginate',
          '--slurp',
        ],
        signal
      );
      if (!Array.isArray(pages) || !pages.every(Array.isArray)) {
        throw new Error('The upstream comments were not confirmed.');
      }
      return pages.flat().map((comment) => {
        if (
          !Number.isSafeInteger(comment.id) ||
          comment.id < 1 ||
          typeof comment.body !== 'string' ||
          typeof comment.user?.login !== 'string' ||
          !formalReportUrl(comment.html_url, id) ||
          !comment.html_url.endsWith(`#issuecomment-${comment.id}`)
        ) {
          throw new Error('The upstream comment identity was not confirmed.');
        }
        return comment;
      });
    },
    account: async (signal) => (await api(['user'], signal)).login,
    write: async (action, signal) => {
      const endpoint =
        action.operation === 'create'
          ? `${root}/issues`
          : action.operation === 'comment'
            ? `${root}/issues/${number(action.issue)}/comments`
            : action.operation === 'update-comment'
              ? `${root}/issues/comments/${number(action.comment)}`
              : null;
      if (!endpoint) {
        throw new Error('Unknown upstream report operation.');
      }
      return api(
        [
          '--method',
          action.operation === 'update-comment' ? 'PATCH' : 'POST',
          endpoint,
          '--input',
          '-',
        ],
        signal,
        JSON.stringify({
          ...(action.operation === 'create' ? { title: action.title } : {}),
          body: action.body,
        })
      );
    },
  };
};
