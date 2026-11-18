import { randomUUID } from 'node:crypto';
import { defaultStoreDir } from '../storage/app-directory.js';
import {
  createExperiencePlanningService,
  readExperiencePlan,
} from '../cv/experience-plan-service.js';
import { experiencePlanRunning } from '../cv/experience-plan-record.js';
import { foregroundPrivateCvJob } from './private-cv-job-command.js';

export const createExperiencePlanCommands = (
  { openStore, openReadOnly = openStore },
  options = {}
) =>
  Object.fromEntries(
    ['start', 'status', 'stop'].map((operation) => [
      `cv-experience-plan-${operation}`,
      async (args, log) => {
        const read = operation === 'status';
        const store = await (read ? openReadOnly : openStore)(
          args.store ?? defaultStoreDir()
        );
        let service;
        try {
          const requestId =
            args['request-id'] ??
            (operation === 'start' ? randomUUID() : undefined);
          let result;
          if (read) {
            result = await readExperiencePlan(store, { requestId });
          } else {
            service = createExperiencePlanningService({ store, ...options });
            result =
              operation === 'start'
                ? await foregroundPrivateCvJob(
                    service,
                    {
                      requestId,
                      hh: args.hh,
                      linkedin: args.linkedin,
                      to: args.to,
                      ...(args['as-of'] ? { asOf: args['as-of'] } : {}),
                    },
                    { running: experiencePlanRunning, wait: options.wait }
                  )
                : await service.stop({ requestId });
          }
          log(JSON.stringify(result, null, 2));
          return operation === 'start' && result.phase !== 'completed' ? 1 : 0;
        } finally {
          try {
            await service?.close();
          } finally {
            await store.close?.();
          }
        }
      },
    ])
  );
