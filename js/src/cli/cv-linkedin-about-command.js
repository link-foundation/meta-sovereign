import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultStoreDir } from '../storage/app-directory.js';
import { createLinkedinAboutJobs } from '../cv/linkedin-about-job.js';
import { linkedinAboutRunning } from '../cv/linkedin-about-receipt.js';
import { foregroundPositionReview } from './cv-linkedin-position-foreground.js';

export const createLinkedinAboutCommands = (
  { openStore, openReadOnly },
  options = {}
) =>
  Object.fromEntries(
    ['start', 'status', 'stop'].map((operation) => [
      `cv-experience-linkedin-about-${operation}`,
      async (args, log) => {
        const storeDir = args.store ?? defaultStoreDir();
        const store = await (operation === 'status' ? openReadOnly : openStore)(
          storeDir
        );
        const input = {
          requestId:
            args['request-id'] ??
            (operation === 'start' ? randomUUID() : undefined),
          planRequestId: args['plan-request-id'],
          fingerprint: args.fingerprint,
        };
        const job = createLinkedinAboutJobs({
          artifactRoot: path.join(storeDir, 'experience-exports'),
          ...options,
          ...options.about,
          store,
        });
        try {
          const row =
            operation === 'start'
              ? await foregroundPositionReview(job, input, {
                  ...options,
                  provider: 'LinkedIn',
                  label: 'About text',
                  running: linkedinAboutRunning,
                })
              : await job[operation](input);
          log(JSON.stringify(row, null, 2));
          return operation === 'start' &&
            ['failed', 'unconfirmed', 'interrupted'].includes(row.phase)
            ? 1
            : 0;
        } finally {
          try {
            await job.close();
          } finally {
            await store.close?.();
          }
        }
      },
    ])
  );
