import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultStoreDir } from '../storage/app-directory.js';
import { createVacancyService } from '../jobs/service.js';
import {
  createHhExperienceAcquisition,
  hhAcquisitionRunning,
  storedHhAcquisitionStatus,
} from '../cv/experience-hh-acquisition.js';
import { foregroundPrivateCvJob } from './private-cv-job-command.js';
import { typedFlag } from './lino-args.js';

export const createHhExperienceCommands = (
  { openStore, openReadOnly },
  options = {}
) =>
  Object.fromEntries(
    ['start', 'status', 'stop'].map((operation) => [
      `cv-experience-hh-${operation}`,
      async (args, log) => {
        const storeDir = args.store ?? defaultStoreDir();
        const store = await (operation === 'status' ? openReadOnly : openStore)(
          storeDir
        );
        const requestId =
          args['request-id'] ??
          (operation === 'start' ? randomUUID() : undefined);
        let vacancies;
        let service;
        try {
          if (operation !== 'status') {
            const artifactRoot =
              options.vacancies?.artifactRoot ??
              path.join(storeDir, 'resume-exports');
            service = createHhExperienceAcquisition({
              store,
              artifactRoot,
              getVacancies: () =>
                (vacancies ??= createVacancyService({
                  ...options.vacancies,
                  store,
                  storeDir,
                  artifactRoot,
                })),
              wait: options.wait,
            });
          }
          const input = { requestId };
          const row = await (operation === 'status'
            ? storedHhAcquisitionStatus(store, input)
            : operation === 'stop'
              ? service.stop(input)
              : foregroundPrivateCvJob(
                  service,
                  {
                    ...input,
                    hash: args.resume,
                    browserSlot: args['browser-slot'],
                    refresh: typedFlag(args, 'refresh-hh', 'boolean'),
                    headless: typedFlag(args, 'headless', 'boolean'),
                  },
                  {
                    running: hhAcquisitionRunning,
                    wait: options.foregroundWait,
                  }
                ));
          log(JSON.stringify(row, null, 2));
          return operation === 'start' && row.phase !== 'completed' ? 1 : 0;
        } finally {
          try {
            await service?.close();
            await vacancies?.stop();
          } finally {
            await store.close?.();
          }
        }
      },
    ])
  );
