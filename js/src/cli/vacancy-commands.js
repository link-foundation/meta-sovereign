import { createApplicationCommands } from './application-command.js';
import { createVacancyService } from '../jobs/service.js';
import { defaultStoreDir } from '../storage/app-directory.js';
import { encodeWire, decodeWire } from '../transport/lino.js';
import { randomUUID } from 'node:crypto';
import { typedFlag } from './lino-args.js';
import { foregroundResumeExport } from './resume-export-command.js';
import { technologyCommandInput } from './technology-command.js';
import { foregroundCvWatch } from './cv-watch-command.js';
import { foregroundJobLogin } from './job-login-command.js';
import { cvTranslationCommandInput } from './cv-translation-command.js';
import { cvWorkplaceCommandInput } from './cv-workplace-command.js';
import { foregroundVacancyDiscovery } from './discovery-command.js';
import {
  cvPublicationCommandInput,
  foregroundCvPublication,
} from './cv-publication-command.js';

const translationIncomplete = (result) =>
  result.comparison?.state !== 'completed' ||
  result.comparison.rows.some((row) => !row.chosen);
const vacancyCommandExit = (operation, result) =>
  (operation === 'discovery-start' &&
    result.discovery?.phase !== 'completed') ||
  (operation === 'resume-export' && result.state !== 'completed') ||
  (operation === 'cv-publish' &&
    !['published', 'unchanged'].includes(result.publication?.state)) ||
  (operation === 'cv-prepare' && result.preparation?.state !== 'prepared') ||
  (operation === 'cv-translate' && translationIncomplete(result))
    ? 1
    : 0;

export { VACANCY_HELP } from './help.js';

const salaryDiscoveryInput = (args) => ({
  collectVacancies:
    args['no-collect-vacancies'] === undefined
      ? undefined
      : !typedFlag(args, 'no-collect-vacancies', 'boolean'),
  salaryConfig: args['salary-config']
    ? decodeWire(args['salary-config'])
    : undefined,
  salaryLadder:
    typedFlag(args, 'no-salary-ladder', 'boolean') === true ? false : undefined,
});
const vacancyOperations = [
  'search',
  'login-open',
  'login-status',
  'login-close',
  'discovery-start',
  'discovery-status',
  'discovery-stop',
  'collect',
  'stored',
  'choices-stored',
  'skips-stored',
  'questions-stored',
  'question-change',
  'skip-clear',
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
  'cv-publish-plan',
  'cv-publish',
  'cv-publish-status',
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
];
export const createVacancyCommands = ({
  openStore,
  readLoginInput,
  ...options
}) =>
  Object.assign(
    createApplicationCommands({ openStore, ...options }),
    Object.fromEntries(
      vacancyOperations.map((operation) => [
        `vacancies-${operation}`,
        async (args, log) => {
          const input = operation.startsWith('cv-publish')
            ? cvPublicationCommandInput(operation, args)
            : [
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
                          'reason',
                          'action',
                          'question',
                          'mode',
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
                      ...salaryDiscoveryInput(args),
                      skipResponded: typedFlag(
                        args,
                        'skip-responded',
                        'boolean'
                      ),
                      excludeText: args['exclude-text'],
                      entryId: args['entry-id'],
                      page: typedFlag(args, 'page', 'number'),
                      browserSlot: args['browser-slot'],
                      resumeLanguage: args['resume-language'],
                      requestId:
                        args['request-id'] ??
                        ([
                          'resume-export',
                          'login-open',
                          'cv-watch',
                          'cv-prepare',
                          'discovery-start',
                        ].includes(operation)
                          ? randomUUID()
                          : undefined),
                      durationMs: typedFlag(args, 'duration-ms', 'number'),
                      maxPages: typedFlag(args, 'max-pages', 'number'),
                      maxVacancies: typedFlag(args, 'max-vacancies', 'number'),
                      targetId: args['target-id'],
                      fingerprint: args.fingerprint,
                      changeId: args['change-id'],
                      recordId: args['record-id'],
                      reviewKind: args['review-kind'],
                      ...(operation === 'cv-prepare' &&
                      args.operation !== undefined
                        ? { operation: args.operation }
                        : {}),
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
            const result = ['cv-publish', 'cv-publish-plan'].includes(operation)
              ? await foregroundCvPublication(service, operation, input)
              : operation === 'discovery-start'
                ? await foregroundVacancyDiscovery(service, input, (receipt) =>
                    log(encodeWire(receipt))
                  )
                : operation === 'resume-export'
                  ? await foregroundResumeExport(service, input, args.out)
                  : operation === 'cv-watch'
                    ? await foregroundCvWatch(service, input, log)
                    : operation === 'login-open'
                      ? await foregroundJobLogin(
                          service,
                          input,
                          log,
                          readLoginInput
                        )
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
