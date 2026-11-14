import { createApplicationCommands } from './application-command.js';
import { createVacancyService } from '../jobs/service.js';
import { defaultStoreDir } from '../storage/app-directory.js';
import { encodeWire } from '../transport/lino.js';
import { randomUUID } from 'node:crypto';
import { foregroundResumeExport } from './resume-export-command.js';
import { technologyCommandInput } from './technology-command.js';
import { foregroundCvWatch } from './cv-watch-command.js';
import { cvTranslationCommandInput } from './cv-translation-command.js';
import { cvWorkplaceCommandInput } from './cv-workplace-command.js';

const vacancyCommandExit = (operation, result) =>
  (operation === 'resume-export' && result.state !== 'completed') ||
  (operation === 'cv-prepare' && result.preparation?.state !== 'prepared') ||
  (operation === 'cv-translate' &&
    (result.comparison?.state !== 'completed' ||
      result.comparison.rows.some((row) => !row.chosen)))
    ? 1
    : 0;

export { VACANCY_HELP } from './help.js';

const typedFlag = (args, key, kind) => {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (kind === 'boolean' && [true, false, 'true', 'false'].includes(value)) {
    return value === true || value === 'true';
  }
  if (kind === 'number' && /^\d+$/u.test(String(value))) {
    return Number(value);
  }
  throw new Error(`--${key} must be a ${kind}`);
};
export const createVacancyCommands = ({ openStore, ...options }) =>
  Object.assign(
    createApplicationCommands({ openStore, ...options }),
    Object.fromEntries(
      [
        'search',
        'collect',
        'stored',
        'choices-stored',
        'choice-save',
        'choice-clear',
        'resumes',
        'resumes-stored',
        'resume-export',
        'resume-export-status',
        'resume-export-cancel',
        'resume-exports-stored',
        'technology-catalog',
        'technology-catalog-save',
        'technology-analyze',
        'technology-analysis-stored',
        'technology-review',
        'technology-review-stored',
        'technology-review-save',
        'cv-watch',
        'cv-watch-status',
        'cv-watch-stop',
        'cv-snapshots',
        'cv-workplace-membership',
        'cv-workplace-source',
        'cv-workplace-dictionaries',
        'cv-workplace-plan',
        'cv-workplace-plan-stored',
        'cv-workplace-review',
        'cv-prepare',
        'cv-prepare-status',
        'cv-prepare-cancel',
        'cv-translate',
        'cv-translation-status',
        'cv-translation-cancel',
      ].map((operation) => [
        `vacancies-${operation}`,
        async (args, log) => {
          const input = [
            'cv-translate',
            'cv-translation-status',
            'cv-translation-cancel',
          ].includes(operation)
            ? await cvTranslationCommandInput(operation, args)
            : operation.startsWith('technology-')
              ? await technologyCommandInput(operation, args)
              : operation.startsWith('cv-workplace-')
                ? await cvWorkplaceCommandInput(operation, args)
                : {
                    ...Object.fromEntries(
                      [
                        'query',
                        'resume',
                        'area',
                        'currency',
                        'order',
                        'url',
                        'title',
                        'state',
                        'revision',
                        'note',
                      ].map((key) => [key, args[key]])
                    ),
                    ...Object.fromEntries(
                      ['remote', 'refresh', 'headless', 'all'].map((key) => [
                        key,
                        typedFlag(args, key, 'boolean'),
                      ])
                    ),
                    salary: typedFlag(args, 'salary', 'number'),
                    skipResponded: typedFlag(args, 'skip-responded', 'boolean'),
                    excludeText: args['exclude-text'],
                    page: typedFlag(args, 'page', 'number'),
                    browserSlot: args['browser-slot'],
                    resumeLanguage: args['resume-language'],
                    requestId:
                      args['request-id'] ??
                      (['resume-export', 'cv-watch', 'cv-prepare'].includes(
                        operation
                      )
                        ? randomUUID()
                        : undefined),
                    durationMs: typedFlag(args, 'duration-ms', 'number'),
                    targetId: args['target-id'],
                    fingerprint: args.fingerprint,
                    changeId: args['change-id'],
                    recordId: args['record-id'],
                    reviewKind: args['review-kind'],
                    formats:
                      args.formats === undefined
                        ? undefined
                        : String(args.formats)
                            .split(',')
                            .map((format) => format.trim()),
                  };
          const storeDir = args.store ?? defaultStoreDir();
          const store = await openStore(storeDir);
          const service = createVacancyService({ store, storeDir, ...options });
          try {
            const result =
              operation === 'resume-export'
                ? await foregroundResumeExport(service, input, args.out)
                : operation === 'cv-watch'
                  ? await foregroundCvWatch(service, input, log)
                  : await service[operation](input);
            log(encodeWire(result));
            return vacancyCommandExit(operation, result);
          } finally {
            try {
              await service.stop();
            } finally {
              await store.close?.();
            }
          }
        },
      ])
    )
  );
