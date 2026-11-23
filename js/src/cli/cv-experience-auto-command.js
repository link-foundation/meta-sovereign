import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultStoreDir } from '../storage/app-directory.js';
import { createVacancyService } from '../jobs/service.js';
import { createHhExperienceAcquisition } from '../cv/experience-hh-acquisition.js';
import { createLinkedinExperienceService } from '../cv/linkedin-experience-service.js';
import { createExperiencePlanningService } from '../cv/experience-plan-service.js';
import {
  createExperienceAutoService,
  storedExperienceAutoStatus,
} from '../cv/experience-auto-service.js';
import { experienceAutoRunning } from '../cv/experience-auto-record.js';
import { createExperienceReviewNative } from '../cv/experience-review-native.js';
import { createLinkedinPositionReviews } from '../cv/linkedin-position-review.js';
import { createLinkedinPositionJobs } from '../cv/linkedin-position-job.js';
import { createHhExperienceWorkplaceJobs } from '../cv/experience-hh-workplace-job.js';
import { foregroundPrivateCvJob } from './private-cv-job-command.js';
import { typedFlag } from './lino-args.js';

export const cliExperienceServices = (store, storeDir, options) => {
  const artifactRoot =
    options.hhExperience?.vacancies?.artifactRoot ??
    path.join(storeDir, 'resume-exports');
  let vacancies;
  let hh;
  let linkedin;
  let plan;
  let auto;
  let workplace;
  let position;
  const positionOptions = {
    artifactRoot: path.join(storeDir, 'experience-exports'),
    ...options.experience,
    ...options.experience?.position,
    store,
  };
  const getVacancies = () =>
    (vacancies ??= createVacancyService({
      ...options.hhExperience?.vacancies,
      store,
      storeDir,
      artifactRoot,
    }));
  const services = {
    getHh: () =>
      (hh ??= createHhExperienceAcquisition({
        store,
        artifactRoot,
        wait: options.hhExperience?.wait,
        getVacancies,
      })),
    getLinkedin: () =>
      (linkedin ??= createLinkedinExperienceService({
        artifactRoot: path.join(storeDir, 'experience-exports'),
        ...options.experience,
        store,
      })),
    getPlan: () =>
      (plan ??= createExperiencePlanningService({
        ...options.experiencePlanning,
        store,
      })),
    getAuto: () =>
      (auto ??= createExperienceAutoService({
        store,
        ...services,
        wait: options.wait,
      })),
    native: createExperienceReviewNative({
      getVacancies,
      getHhWorkplace: () =>
        (workplace ??= createHhExperienceWorkplaceJobs({
          store,
          storeDir,
          artifactRoot,
          ...options.hhExperience?.workplace,
        })),
      getLinkedinPosition: () =>
        (position ??= createLinkedinPositionJobs(positionOptions)),
      getLinkedinReviews: () => createLinkedinPositionReviews(positionOptions),
    }),
    close: async () => {
      await Promise.allSettled([
        auto?.close(),
        workplace?.close(),
        position?.close(),
      ]);
      await Promise.allSettled([
        hh?.close(),
        linkedin?.close(),
        plan?.close(),
        vacancies?.stop(),
      ]);
    },
  };
  return services;
};

export const experienceAcquisitionInput = (args, requestId) =>
  Object.fromEntries(
    Object.entries({
      requestId,
      url: args.url,
      language: args.language,
      to: args.to,
      asOf: args['as-of'],
      hash: args.resume,
      browserSlot: args['browser-slot'],
      refresh: typedFlag(args, 'refresh-hh', 'boolean'),
      headless: typedFlag(args, 'headless', 'boolean'),
    }).filter(([, value]) => value !== undefined)
  );

const runForeground = (service, args, requestId, options) => {
  let announced = false;
  return foregroundPrivateCvJob(
    service,
    experienceAcquisitionInput(args, requestId),
    {
      running: experienceAutoRunning,
      wait: options.foregroundWait,
      observe: (row) => {
        if (row.step === 'waiting-login' && !announced) {
          announced = true;
          const notice = options.notice ?? ((text) => console.error(text));
          notice(
            'Sign in in the LinkedIn experience window. Ctrl+C stops preparation.'
          );
        }
      },
    }
  );
};

export const createExperienceAutoCommands = (
  { openStore, openReadOnly = openStore },
  options = {}
) =>
  Object.fromEntries(
    ['start', 'status', 'stop'].map((operation) => [
      `cv-experience-auto-${operation}`,
      async (args, log) => {
        const dir = args.store ?? defaultStoreDir();
        const reading = operation === 'status';
        const store = await (reading ? openReadOnly : openStore)(dir);
        let children;
        let service;
        try {
          const requestId =
            args['request-id'] ??
            (operation === 'start' ? randomUUID() : undefined);
          let row;
          if (reading) {
            row = await storedExperienceAutoStatus(store, { requestId });
          } else {
            children = cliExperienceServices(store, dir, options);
            service = children.getAuto();
            row =
              operation === 'start'
                ? await runForeground(service, args, requestId, options)
                : await service.stop({ requestId });
          }
          log(JSON.stringify(row, null, 2));
          return operation === 'start' && row.phase !== 'completed' ? 1 : 0;
        } finally {
          try {
            await service?.close();
            await children?.close();
          } finally {
            await store.close?.();
          }
        }
      },
    ])
  );
