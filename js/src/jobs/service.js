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
import { createResumeListControl } from './resume-list-service.js';
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
import { createCvPrepareService } from './cv-prepare-service.js';
import { createCvTranslationService } from './cv-translation-service.js';
import { createVacancyChoiceService } from './vacancy-choice-service.js';
import { vacancySelectionOptions } from './vacancy-selection.js';
import { reviewVacancySearch } from './vacancy-selection-service.js';
import { acknowledgedRead, acknowledgedWrite } from './acknowledged-store.js';
import {
  createApplicationService,
  applicationOwned,
} from './application-service.js';

const owners = new WeakSet();

/** Finite owned work. Stop drains the issued browser before releasing ownership. */
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
  cvPrepare = {},
  cvTranslation = {},
  application = {},
}) => {
  let active;
  let stopping;
  const run = (operation, application = false) => {
    if (stopping) {
      return Promise.reject(
        jobsFailure('stopped', 'Vacancy reading has stopped.')
      );
    }
    if (owners.has(store) || (!application && applicationOwned(store))) {
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
    await applications.cancel();
    return { stopped: true };
  };
  const exports = createResumeExportControl({
    store,
    run,
    read: readResumeExports,
    cancel,
    occupied: () => owners.has(store),
  });
  const preparation = createCvPrepareService({
    store,
    artifactRoot,
    run,
    ...cvPrepare,
  });
  const applications = createApplicationService({
    store,
    storeDir,
    openSession,
    run: (operation) => run(operation, true),
    ...application,
  });
  return {
    ...createResumeListControl({ store, read: readResumes, artifactRoot, run }),
    ...applications.operations,
    ...createVacancyChoiceService({ store, run }),
    ...createTechnologyService({ store, artifactRoot, run, cvPrepare }),
    ...createCvWatchService({ store, run, ...cvWatch }),
    ...preparation.operations,
    ...createCvTranslationService({ store, run, ...cvTranslation }),
    async capabilities() {
      const browser = await availability();
      return {
        ...browser,
        search: browser.available === true,
        collect: browser.available === true,
        resumes: browser.available === true,
        resumeExport: browser.available === true,
        cached: true,
        localChoices: true,
        selectionReview: browser.available === true,
        technologyAnalysis: true,
        technologyReview: true,
        technologyProviderSave: false,
        cvTranslation: true,
        cvSaveWatch: browser.available === true,
        applicationReview: browser.available === true,
        apply: false,
      };
    },
    'resume-export': exports.start,
    'resume-export-status': exports.status,
    'resume-export-cancel': exports.cancel,
    'resume-exports-stored': () => storedResumeExports(store),
    'resume-export-file': (input) =>
      readResumeExportFile({ store, artifactRoot }, input),
    search(input) {
      const url = hhSearchUrl(input);
      const options = jobsBrowserOptions(input);
      vacancySelectionOptions(input);
      return run(async (signal) => {
        const result = await readSearch(url, { ...options, signal });
        signal.throwIfAborted();
        return reviewVacancySearch(
          store,
          result,
          input,
          applications.retryWaiting
        );
      });
    },
    collect(input) {
      const { url, refresh, ...options } = collectionOptions(input);
      return acknowledgedWrite(store, run, (signal) =>
        vacancySnapshot(store, readVacancy, url, refresh, signal, options)
      );
    },
    stored: () => acknowledgedRead(store, () => storedVacancies(store)),
    cancel,
    stop() {
      return (stopping ??= Promise.resolve().then(async () => {
        const drained = preparation.stop();
        active?.controller.abort();
        await active?.task.catch(() => {});
        await applications.stop();
        await drained;
      }));
    },
  };
};
