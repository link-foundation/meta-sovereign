import { createVacancyService } from '../jobs/service.js';
import { defaultStoreDir } from '../storage/app-directory.js';
import { encodeWire } from '../transport/lino.js';
import { randomUUID } from 'node:crypto';
import { foregroundResumeExport } from './resume-export-command.js';
import { technologyCommandInput } from './technology-command.js';

export const VACANCY_HELP = `  vacancies-search [--query=<text>] [--resume=<hash>] [--area=<id>] [--salary=<amount>] [--currency=RUR|USD|EUR] [--remote=true|false] [--order=salary_desc|publication_time|relevance] [--page=0] [--browser-slot=jobs] [--headless=true|false] [--store=<dir>]
  vacancies-collect --url=<hh-vacancy-url> [--refresh=true|false] [--browser-slot=jobs] [--headless=true|false] [--store=<dir>]
  vacancies-stored [--store=<dir>]
  vacancies-resumes [--resume=<hash>] [--resume-language=ru|en|any] [--browser-slot=jobs] [--headless=true|false] [--store=<dir>]
  vacancies-resumes-stored [--store=<dir>]
  vacancies-resume-export [--resume=<hash>|--all=true] [--formats=pdf,doc,rtf,html] [--request-id=<id>] [--out=<directory>] [--browser-slot=jobs] [--headless=true|false] [--store=<dir>]
  vacancies-resume-export-status --request-id=<id> [--store=<dir>]
  vacancies-resume-export-cancel --request-id=<id> [--store=<dir>]
  vacancies-resume-exports-stored [--store=<dir>]
  vacancies-technology-catalog [--store=<dir>]
  vacancies-technology-catalog-save --file=<catalog.lino|catalog.bin|catalog.json> [--store=<dir>]
  vacancies-technology-analyze --export-id=<id> --resume=<hash> --revision=<catalog-revision> [--browser-slot=jobs] [--store=<dir>]
  vacancies-technology-analysis-stored [--browser-slot=jobs] [--store=<dir>]`;

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
  Object.fromEntries(
    [
      'search',
      'collect',
      'stored',
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
    ].map((operation) => [
      `vacancies-${operation}`,
      async (args, log) => {
        const input = operation.startsWith('technology-')
          ? await technologyCommandInput(operation, args)
          : {
              ...Object.fromEntries(
                ['query', 'resume', 'area', 'currency', 'order', 'url'].map(
                  (key) => [key, args[key]]
                )
              ),
              ...Object.fromEntries(
                ['remote', 'refresh', 'headless', 'all'].map((key) => [
                  key,
                  typedFlag(args, key, 'boolean'),
                ])
              ),
              salary: typedFlag(args, 'salary', 'number'),
              page: typedFlag(args, 'page', 'number'),
              browserSlot: args['browser-slot'],
              resumeLanguage: args['resume-language'],
              requestId:
                args['request-id'] ??
                (operation === 'resume-export' ? randomUUID() : undefined),
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
              : await service[operation](input);
          log(encodeWire(result));
          return operation === 'resume-export' && result.state !== 'completed'
            ? 1
            : 0;
        } finally {
          try {
            await service.stop();
          } finally {
            await store.close?.();
          }
        }
      },
    ])
  );
