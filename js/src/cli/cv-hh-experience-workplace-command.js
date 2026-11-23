import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultStoreDir } from '../storage/app-directory.js';
import {
  createHhExperienceWorkplaceJobs,
  readHhExperienceWorkplaceJob,
} from '../cv/experience-hh-workplace-job.js';
import { hhExperienceWorkplaceRunning } from '../cv/experience-hh-workplace-receipt.js';
import { foregroundPositionReview } from './cv-linkedin-position-foreground.js';

export const createHhExperienceWorkplaceCommands = (
  { openStore, openReadOnly },
  options = {}
) =>
  Object.fromEntries(
    ['workplace', 'about'].flatMap((kind) =>
      ['start', 'status', 'stop'].map((operation) => [
        `cv-experience-hh-${kind}-${operation}`,
        async (args, log) => {
          const storeDir = args.store ?? defaultStoreDir();
          const store = await (
            operation === 'status' ? openReadOnly : openStore
          )(storeDir);
          const input = {
            requestId:
              args['request-id'] ??
              (operation === 'start' ? randomUUID() : undefined),
            fingerprint: args.fingerprint,
            ...(kind === 'about'
              ? { planRequestId: args['plan-request-id'] ?? '' }
              : { browserSlot: args['browser-slot'] }),
          };
          let jobs;
          try {
            let row;
            if (operation === 'status') {
              row = await readHhExperienceWorkplaceJob(store, input);
            } else {
              jobs = createHhExperienceWorkplaceJobs({
                store,
                storeDir,
                artifactRoot: path.join(storeDir, 'resume-exports'),
                ...options,
              });
              row =
                operation === 'stop'
                  ? await jobs.stop(input)
                  : await foregroundPositionReview(jobs, input, {
                      ...options,
                      provider: 'HeadHunter Experience',
                      label: kind === 'about' ? 'About text' : 'workplace',
                      running: hhExperienceWorkplaceRunning,
                      awaitingLogin:
                        'Sign in to HeadHunter in the Experience window.',
                    });
            }
            log(JSON.stringify(row, null, 2));
            return operation === 'start' &&
              ['failed', 'unconfirmed', 'interrupted', 'unknown'].includes(
                row.phase
              )
              ? 1
              : 0;
          } finally {
            try {
              await jobs?.close();
            } finally {
              await store.close?.();
            }
          }
        },
      ])
    )
  );
