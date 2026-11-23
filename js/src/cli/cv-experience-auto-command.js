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
import { foregroundPrivateCvJob } from './private-cv-job-command.js';
import { typedFlag } from './lino-args.js';

const cliServices = (store, storeDir, options) => {
  const artifactRoot =
    options.hhExperience?.vacancies?.artifactRoot ??
    path.join(storeDir, 'resume-exports');
  let vacancies;
  let hh;
  let linkedin;
  let plan;
  return {
    getHh: () =>
      (hh ??= createHhExperienceAcquisition({
        store,
        artifactRoot,
        wait: options.hhExperience?.wait,
        getVacancies: () =>
          (vacancies ??= createVacancyService({
            ...options.hhExperience?.vacancies,
            store,
            storeDir,
            artifactRoot,
          })),
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
    close: () =>
      Promise.allSettled([
        hh?.close(),
        linkedin?.close(),
        plan?.close(),
        vacancies?.stop(),
      ]),
  };
};

const runForeground = (service, args, requestId, options) => {
  let announced = false;
  const input = {
    requestId,
    url: args.url,
    language: args.language,
    to: args.to,
    asOf: args['as-of'],
    hash: args.resume,
    browserSlot: args['browser-slot'],
    refresh: typedFlag(args, 'refresh-hh', 'boolean'),
    headless: typedFlag(args, 'headless', 'boolean'),
  };
  return foregroundPrivateCvJob(
    service,
    Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined)
    ),
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
            children = cliServices(store, dir, options);
            service = createExperienceAutoService({
              store,
              ...children,
              wait: options.wait,
            });
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
