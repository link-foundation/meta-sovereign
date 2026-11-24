import { randomUUID } from 'node:crypto';
import { defaultStoreDir } from '../storage/app-directory.js';
import {
  previewFormalExperienceReport,
  createFormalExperienceReports,
  readFormalExperienceReport,
} from '../cv/formal-report-service.js';
import { formalReportRunning } from '../cv/formal-report-record.js';
import { foregroundPrivateCvJob } from './private-cv-job-command.js';

const enabled = (value) => value === true || value === 'true';
const startInput = (args, requestId) => ({
  requestId,
  planRequestId: args['plan-request-id'],
  review: args.review,
  mode: enabled(args['no-report-formal-ai'])
    ? 'off'
    : enabled(args['dry-run-issues'])
      ? 'dry-run'
      : (args.mode ?? 'dry-run'),
  confirm: enabled(args.confirm),
});

export const createFormalReportCommands = (
  { openStore, openReadOnly = openStore },
  options = {}
) =>
  Object.fromEntries(
    ['preview', 'start', 'status', 'stop'].map((operation) => [
      `cv-experience-report-${operation}`,
      async (args, log) => {
        const read = ['preview', 'status'].includes(operation);
        const store = await (read ? openReadOnly : openStore)(
          args.store ?? defaultStoreDir()
        );
        let service;
        try {
          const requestId =
            args['request-id'] ??
            (operation === 'start' ? randomUUID() : undefined);
          let result;
          if (operation === 'preview') {
            result = await previewFormalExperienceReport(store, {
              planRequestId: args['plan-request-id'],
            });
          } else if (operation === 'status') {
            result = await readFormalExperienceReport(store, { requestId });
          } else {
            service = createFormalExperienceReports({ store, ...options });
            result =
              operation === 'stop'
                ? await service.stop({ requestId })
                : await foregroundPrivateCvJob(
                    service,
                    startInput(args, requestId),
                    { running: formalReportRunning, wait: options.wait }
                  );
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
