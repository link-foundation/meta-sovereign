import path from 'node:path';
import { defaultStoreDir } from '../storage/app-directory.js';
import { createLinkedinPositionReviews } from '../cv/linkedin-position-review.js';
import {
  createLinkedinPositionJobs,
  readLinkedinPositionJob,
} from '../cv/linkedin-position-job.js';
import { foregroundLinkedinPosition } from './cv-linkedin-position-foreground.js';
import { randomUUID } from 'node:crypto';

export const createLinkedinPositionCommands = (
  { openStore, openReadOnly },
  { artifactRoot, position = {} } = {}
) =>
  Object.fromEntries(
    ['stage', 'stored', 'review', 'start', 'status', 'stop'].map(
      (operation) => [
        `cv-experience-linkedin-position-${operation}`,
        async (args, log) => {
          const dir = args.store ?? defaultStoreDir();
          const open = ['stored', 'status'].includes(operation)
            ? openReadOnly
            : openStore;
          const store = await open(dir);
          const context = {
            store,
            artifactRoot: artifactRoot ?? path.join(dir, 'experience-exports'),
            ...position,
          };
          const input = {
            fingerprint: args.fingerprint,
            requestId: args['request-id'],
          };
          if (operation === 'stage') {
            input.requestId = args['plan-request-id'];
            const index = args['job-index'];
            input.jobIndex = /^\d{1,3}$/u.test(index ?? '')
              ? Number(index)
              : null;
          }
          let jobs;
          try {
            let row;
            if (operation === 'status') {
              row = await readLinkedinPositionJob(store, input);
            } else if (['start', 'stop'].includes(operation)) {
              jobs = createLinkedinPositionJobs(context);
              if (operation === 'start') {
                input.requestId ??= randomUUID();
                row = await foregroundLinkedinPosition(jobs, input, position);
              } else {
                row = await jobs.stop(input);
              }
            } else {
              row =
                await createLinkedinPositionReviews(context)[operation](input);
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
      ]
    )
  );
