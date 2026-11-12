import { createVacancyService } from '../jobs/service.js';
import { defaultStoreDir } from '../storage/app-directory.js';
import { encodeWire } from '../transport/lino.js';

export const VACANCY_HELP = `  vacancies-search [--query=<text>] [--resume=<hash>] [--area=<id>] [--salary=<amount>] [--currency=RUR|USD|EUR] [--remote=true|false] [--order=salary_desc|publication_time|relevance] [--page=0] [--browser-slot=jobs] [--headless=true|false] [--store=<dir>]
  vacancies-collect --url=<hh-vacancy-url> [--refresh=true|false] [--browser-slot=jobs] [--headless=true|false] [--store=<dir>]
  vacancies-stored [--store=<dir>]
  vacancies-resumes [--resume=<hash>] [--resume-language=ru|en|any] [--browser-slot=jobs] [--headless=true|false] [--store=<dir>]
  vacancies-resumes-stored [--store=<dir>]`;

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
    ['search', 'collect', 'stored', 'resumes', 'resumes-stored'].map(
      (operation) => [
        `vacancies-${operation}`,
        async (args, log) => {
          const input = {
            ...Object.fromEntries(
              ['query', 'resume', 'area', 'currency', 'order', 'url'].map(
                (key) => [key, args[key]]
              )
            ),
            ...Object.fromEntries(
              ['remote', 'refresh', 'headless'].map((key) => [
                key,
                typedFlag(args, key, 'boolean'),
              ])
            ),
            salary: typedFlag(args, 'salary', 'number'),
            page: typedFlag(args, 'page', 'number'),
            browserSlot: args['browser-slot'],
            resumeLanguage: args['resume-language'],
          };
          const store = await openStore(args.store ?? defaultStoreDir());
          const service = createVacancyService({ store, ...options });
          try {
            const result = await service[operation](input);
            log(encodeWire(result));
            return 0;
          } finally {
            try {
              await service.stop();
            } finally {
              await store.close?.();
            }
          }
        },
      ]
    )
  );
