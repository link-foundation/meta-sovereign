import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { defaultStoreDir } from '../storage/app-directory.js';
import { createLinkedinExperienceService } from '../cv/linkedin-experience-service.js';
import {
  linkedinExportRunning,
  linkedinExportKey,
  checkedLinkedinExport,
  linkedinExportView,
} from '../cv/linkedin-experience-record.js';
import { readLinkedinEvidence } from '../cv/linkedin-experience-evidence.js';

const readonlyService = (store, artifactRoot) => {
  const status = async ({ requestId }) =>
    linkedinExportView(
      checkedLinkedinExport(
        await store.get(linkedinExportKey(requestId)),
        requestId
      ),
      null
    );
  return {
    status,
    evidence: async (input) =>
      readLinkedinEvidence(artifactRoot, await status(input), input.name),
    close: async () => {},
  };
};

/** The foreground command owns cancellation and waits for native detach. */
export const foregroundLinkedinExperience = async (
  service,
  input,
  { wait = () => delay(250), notice = (text) => console.error(text) } = {}
) => {
  let stopping;
  const stop = () => {
    stopping ??= service.stop({ requestId: input.requestId });
    stopping.catch(() => {});
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  let announced = false;
  try {
    let row = await service.start(input);
    while (linkedinExportRunning(row)) {
      if (row.phase === 'waiting-login' && !announced) {
        announced = true;
        notice(
          'Sign in in the visible LinkedIn experience window. Waiting up to 30 minutes; Ctrl+C stops the export.'
        );
      }
      await wait();
      row = await service.status({ requestId: input.requestId });
    }
    return row;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await stopping;
  }
};

export const createLinkedinExperienceCommands = (
  { openStore, openReadOnly = openStore },
  options = {}
) =>
  Object.fromEntries(
    ['start', 'status', 'stop', 'evidence'].map((operation) => [
      `cv-experience-linkedin-${operation}`,
      async (args, log) => {
        const dir = args.store ?? defaultStoreDir();
        const readOnly = ['status', 'evidence'].includes(operation);
        const store = await (readOnly ? openReadOnly : openStore)(dir);
        const artifactRoot =
          options.artifactRoot ?? path.join(dir, 'experience-exports');
        const service = readOnly
          ? readonlyService(store, artifactRoot)
          : createLinkedinExperienceService({
              store,
              ...options,
              artifactRoot,
            });
        const input = {
          requestId:
            args['request-id'] ??
            (operation === 'start' ? randomUUID() : undefined),
        };
        try {
          const row =
            operation === 'start'
              ? await foregroundLinkedinExperience(
                  service,
                  { ...input, url: args.url, language: args.language },
                  options
                )
              : await service[operation]({ ...input, name: args.name });
          log(JSON.stringify(row, null, 2));
          return operation === 'start' && row.phase !== 'completed' ? 1 : 0;
        } finally {
          try {
            await service.close();
          } finally {
            await store.close?.();
          }
        }
      },
    ])
  );
