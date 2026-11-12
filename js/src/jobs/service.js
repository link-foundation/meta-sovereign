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
import { createResumeListReader } from './read-resumes.js';
import { resumeChoiceOptions } from './resume-list.js';
import { saveResumeList, storedResumeLists } from './resume-cache.js';
import path from 'node:path';
import { defaultStoreDir } from '../storage/app-directory.js';
import { createResumeExportReader } from './read-resume-exports.js';
import { createResumeExportControl } from './resume-export-control.js';
import {
  storedResumeExports,
  readResumeExportFile,
} from './resume-export-files.js';
import {
  createTechnologyService,
  storedVacancies,
} from './technology-service.js';
import { createCvWatchService } from './cv-watch-service.js';

const owners = new WeakSet();

/** Finite read-only work. Stop drains the issued browser before releasing ownership. */
export const createVacancyService = ({
  store,
  openSession,
  availability = browserAvailability,
  readSearch = createVacancySearchReader({ store, openSession }),
  readVacancy = createAssignmentVacancyReader({ store, openSession }),
  readResumes = createResumeListReader({ store, openSession }),
  storeDir = defaultStoreDir(),
  artifactRoot = path.join(storeDir, 'resume-exports'),
  readResumeExports = createResumeExportReader({
    store,
    openSession,
    artifactRoot,
  }),
  cvWatch = {},
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
  const cancel = async () => {
    const owned = active;
    owned?.controller.abort();
    await owned?.task.catch(() => {});
    return { stopped: true };
  };
  const exports = createResumeExportControl({
    store,
    run,
    read: readResumeExports,
    cancel,
    occupied: () => owners.has(store),
  });
  return {
    ...createTechnologyService({ store, artifactRoot, run }),
    ...createCvWatchService({ store, run, ...cvWatch }),
    async capabilities() {
      const browser = await availability();
      return {
        ...browser,
        search: browser.available === true,
        collect: browser.available === true,
        resumes: browser.available === true,
        resumeExport: browser.available === true,
        cached: true,
        technologyAnalysis: true,
        technologyReview: true,
        technologyProviderSave: false,
        cvSaveWatch: browser.available === true,
        apply: false,
      };
    },
    resumes(input) {
      const options = jobsBrowserOptions(input);
      const choice = resumeChoiceOptions(input);
      return run((signal) =>
        saveResumeList(store, readResumes, { ...options, signal }, choice)
      );
    },
    'resumes-stored': () =>
      storedResumeLists((predicate) => store.query(predicate)),
    'resume-export': exports.start,
    'resume-export-status': exports.status,
    'resume-export-cancel': exports.cancel,
    'resume-exports-stored': () => storedResumeExports(store),
    'resume-export-file': (input) =>
      readResumeExportFile({ store, artifactRoot }, input),
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
    stored: () => storedVacancies(store),
    cancel,
    stop() {
      return (stopping ??= Promise.resolve().then(async () => {
        active?.controller.abort();
        await active?.task.catch(() => {});
      }));
    },
  };
};
