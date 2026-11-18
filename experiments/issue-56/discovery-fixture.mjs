import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createVacancyService } from '../../js/src/jobs/service.js';
import { validateVacancySearch } from '../../js/src/jobs/search-result.js';
import { vacancySnapshotFixture, searchFixture } from './vacancy-fixture.mjs';

export const discoveryInput = {
  requestId: 'fixture-discovery',
  query: 'Python',
  resume: 'fixture_cv',
  area: '1',
  salary: 200000,
  currency: 'RUR',
  order: 'salary_desc',
  remote: true,
  maxPages: 3,
  maxVacancies: 10,
  durationMs: 10000,
  confirm: true,
  excludeText: 'excluded description',
};
export const discoveryCard = (id, extra = {}) => ({
  ...vacancySnapshotFixture(),
  url: `https://hh.ru/vacancy/${id}`,
  title: `Engineer ${id}`,
  responded: false,
  ...extra,
});
export const discoveryFixture = (t, options = {}) => {
  const store = options.store ?? createMemoryStore();
  const searches = [];
  const descriptions = [];
  const trace = [];
  const serviceOptions = {
    store,
    availability: async () => ({ available: true }),
    readSearch: async (url, input) => {
      searches.push({ url, input });
      if (options.readSearch) {
        return options.readSearch(url, input);
      }
      const page = Number(new URL(url).searchParams.get('page'));
      const cards =
        page === 0
          ? [discoveryCard(123), discoveryCard(124, { responded: true })]
          : [
              discoveryCard(
                123,
                options.laterResponded ? { responded: true } : {}
              ),
              discoveryCard(125),
            ];
      const next = new URL(url);
      next.searchParams.set('page', String(page + 1));
      return validateVacancySearch(
        { ...searchFixture(url, cards), next: page === 0 ? next.href : null },
        url
      );
    },
    readVacancy: async (url, input) => {
      descriptions.push({ url, input });
      return options.readVacancy
        ? options.readVacancy(url, input)
        : {
            ...vacancySnapshotFixture(),
            url,
            description: url.endsWith('/125')
              ? 'An excluded description.'
              : 'A complete eligible description.',
          };
    },
    discovery: { trace: (event) => trace.push(event), ...options.discovery },
  };
  const service = createVacancyService(serviceOptions);
  t.after(async () => {
    await service.stop();
    await store.close?.();
  });
  const status = (input = {}) => service['discovery-status'](input);
  const start = (input = {}) =>
    service['discovery-start']({ ...discoveryInput, ...input });
  const drain = async () => {
    await service['discovery-drain']();
    return status();
  };
  return {
    store,
    service,
    searches,
    descriptions,
    trace,
    serviceOptions,
    start,
    status,
    drain,
  };
};
