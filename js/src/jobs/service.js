import { browserAvailability } from '../cv/browser.js';
import { createAssignmentVacancyReader } from '../assignments/vacancy-reader.js';
import { vacancySnapshot } from '../assignments/vacancy.js';
import {
  collectionOptions,
  hhSearchUrl,
  jobsBrowserOptions,
  jobsFailure,
} from './options.js';
import { createVacancySearchReader } from './read-search.js';
import { vacancyContent } from '../assignments/vacancy-content.js';
import { modelFingerprint } from '../automation/answer-model-context.js';

const owners = new WeakSet();

/** Finite read-only work. Stop drains the issued browser before releasing ownership. */
export const createVacancyService = ({
  store,
  openSession,
  availability = browserAvailability,
  readSearch = createVacancySearchReader({ store, openSession }),
  readVacancy = createAssignmentVacancyReader({ store, openSession }),
}) => {
  let active;
  let stopping;
  const run = (operation) => {
    if (stopping) {
      return Promise.reject(
        jobsFailure('stopped', 'Vacancy reading has stopped.')
      );
    }
    if (owners.has(store)) {
      return Promise.reject(
        jobsFailure('busy', 'Another vacancy read owns this workspace.')
      );
    }
    owners.add(store);
    const controller = new AbortController();
    const task = Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted();
        return operation(controller.signal);
      })
      .finally(() => {
        active = null;
        owners.delete(store);
      });
    active = { controller, task };
    return task;
  };
  return {
    async capabilities() {
      const browser = await availability();
      return {
        ...browser,
        search: browser.available === true,
        collect: browser.available === true,
        cached: true,
        apply: false,
      };
    },
    search(input) {
      const url = hhSearchUrl(input);
      const options = jobsBrowserOptions(input);
      return run((signal) => readSearch(url, { ...options, signal }));
    },
    collect(input) {
      const { url, refresh, ...options } = collectionOptions(input);
      return run((signal) =>
        vacancySnapshot(store, readVacancy, url, refresh, signal, options)
      );
    },
    async stored() {
      const rows = await store.query(
        (row) => row.id?.startsWith('assignment-vacancy:') && row.version === 1
      );
      const entries = [];
      for (const row of rows
        .sort((a, b) =>
          String(b.capturedAt).localeCompare(String(a.capturedAt))
        )
        .slice(0, 100)) {
        const content = vacancyContent(row);
        if (
          row.id !== `assignment-vacancy:${await modelFingerprint(content.url)}`
        ) {
          throw jobsFailure(
            'cache-invalid',
            'A saved vacancy has an invalid identity.'
          );
        }
        entries.push({ id: row.id, ...content });
      }
      return { entries };
    },
    async cancel() {
      const owned = active;
      owned?.controller.abort();
      await owned?.task.catch(() => {});
      return { stopped: true };
    },
    stop() {
      return (stopping ??= Promise.resolve().then(async () => {
        active?.controller.abort();
        await active?.task.catch(() => {});
      }));
    },
  };
};
