/** Read-only server browser operations; cached records remain useful offline. */
import { vacancyContent } from '../assignments/vacancy-content.js';
import { assignmentVacancyUrl } from '../assignments/validation.js';
import { hhSearchUrl, jobsFailure } from '../jobs/options.js';
import { validateVacancySearch } from '../jobs/search-result.js';

const confirmed = (operation, answer, input) => {
  if (answer.ok === false) {
    return answer;
  }
  if (operation === 'cancel') {
    if (answer.stopped !== true) {
      throw jobsFailure(
        'unconfirmed',
        'Stopping the vacancy read was not confirmed.'
      );
    }
    return { stopped: true };
  }
  if (operation === 'collect') {
    return {
      id: answer.id,
      ...vacancyContent(answer, assignmentVacancyUrl(input.url)),
    };
  }
  const url = hhSearchUrl(input);
  const page = input.page ?? 0;
  if (
    answer.page !== page ||
    (answer.nextPage !== null && answer.nextPage !== page + 1) ||
    typeof answer.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(answer.capturedAt))
  ) {
    throw jobsFailure('unconfirmed', 'The requested search was not confirmed.');
  }
  const next = new URL(url);
  next.searchParams.set('page', String(page + 1));
  const result = validateVacancySearch(
    {
      ...answer,
      next: answer.nextPage === null ? null : next.href,
      empty: answer.cards?.length === 0,
    },
    url
  );
  return { ...result, capturedAt: answer.capturedAt };
};
export const createVacancyApi = ({ get, report, local }) => ({
  vacancyCapabilities: async () =>
    (await get('/api/vacancies/capabilities')) ?? {
      available: false,
      search: false,
      collect: false,
      apply: false,
      cached: true,
      reason: 'server-required',
    },
  vacancyStored: async () =>
    (await get('/api/vacancies/stored')) ?? {
      entries: (
        await (
          await local()
        ).query((row) => row.id?.startsWith('assignment-vacancy:'))
      )
        .slice(0, 100)
        .map((row) => ({ id: row.id, ...vacancyContent(row) })),
    },
  ...Object.fromEntries(
    ['search', 'collect', 'cancel'].map((operation) => [
      `vacancy${operation[0].toUpperCase()}${operation.slice(1)}`,
      async (input = {}) =>
        confirmed(
          operation,
          (await report(`/api/vacancies/${operation}`, input, {
            network: true,
          })) ?? { ok: false, code: 'server-required' },
          input
        ),
    ])
  ),
});
