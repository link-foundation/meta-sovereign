import path from 'node:path';
import { defaultStoreDir } from '../storage/app-directory.js';
import { createLinkedinPositionReviews } from '../cv/linkedin-position-review.js';

export const createLinkedinPositionCommands = (
  { openStore, openReadOnly },
  { artifactRoot } = {}
) =>
  Object.fromEntries(
    ['stage', 'stored', 'review'].map((operation) => [
      `cv-experience-linkedin-position-${operation}`,
      async (args, log) => {
        const dir = args.store ?? defaultStoreDir();
        const open = operation === 'stored' ? openReadOnly : openStore;
        const store = await open(dir);
        const service = createLinkedinPositionReviews({
          store,
          artifactRoot: artifactRoot ?? path.join(dir, 'experience-exports'),
        });
        const input = { fingerprint: args.fingerprint };
        if (operation === 'stage') {
          input.requestId = args['plan-request-id'];
          const index = args['job-index'];
          input.jobIndex = /^\d{1,3}$/u.test(index ?? '')
            ? Number(index)
            : null;
        }
        try {
          log(JSON.stringify(await service[operation](input), null, 2));
          return 0;
        } finally {
          await store.close?.();
        }
      },
    ])
  );
