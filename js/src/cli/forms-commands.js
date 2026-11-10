import { promises as fs } from 'node:fs';
import { decodeWire } from '../transport/lino.js';
import { createFormReader, planFormAnswers } from '../forms/reader.js';
import { defaultStoreDir } from '../storage/app-directory.js';
import {
  createFormReportWriter,
  persistFormReport,
} from '../forms/report-file.js';
import { formReportOutput } from '../forms/report-markdown.js';
import {
  createFormReviewCommands,
  FORMS_REVIEW_HELP,
} from './forms-review-commands.js';
import {
  FORMS_WATCHERS_HELP,
  formWatcherCommands,
} from './forms-watcher-commands.js';

export const FORMS_HELP = `  forms-read    --url=<http-url> [--format=json|markdown] [--browser-slot=<name>] [--headed|--headless] [--store=<dir>]
  forms-plan    --file=<inspection.json> [--format=json|markdown] [--profile-id=<id>] [--profile=<Lino>] [--approximate=false] [--source=<provider>] [--chat=<id>] [--store=<dir>]
${FORMS_REVIEW_HELP}
${FORMS_WATCHERS_HELP}`;

export const createFormsCommands = ({ openStore, ...readerOptions }) => ({
  ...formWatcherCommands,
  ...createFormReviewCommands({ openStore, ...readerOptions }),
  'forms-plan': async (args, log) => {
    const output = formReportOutput(args.format);
    if (!args.file || (await fs.stat(args.file)).size > 4 * 1024 ** 2) {
      throw new Error('--file requires an inspection JSON file up to 4 MiB');
    }
    const raw = await fs.readFile(args.file, 'utf8');
    if (Buffer.byteLength(raw) > 4 * 1024 ** 2) {
      throw new Error('inspection file exceeds 4 MiB');
    }
    const inspection = JSON.parse(raw);
    const store = await openStore(args.store ?? defaultStoreDir());
    try {
      const report = await planFormAnswers(store, {
        inspection,
        profileId: args['profile-id'],
        profile: args.profile ? decodeWire(args.profile) : undefined,
        approximate: ![false, 'false'].includes(args.approximate),
        source: args.source,
        chat: args.chat,
      });
      const writer =
        readerOptions.reportWriter === undefined
          ? createFormReportWriter()
          : readerOptions.reportWriter;
      if (writer) {
        report.reportFile = await persistFormReport(writer, report);
      }
      log(output(report));
      return 0;
    } finally {
      await store.close?.();
    }
  },
  'forms-read': async (args, log) => {
    const output = formReportOutput(args.format);
    if (
      args.headless !== undefined &&
      ![true, false, 'true', 'false'].includes(args.headless)
    ) {
      throw new Error('--headless must be true or false');
    }
    const store = await openStore(args.store ?? defaultStoreDir());
    const reader = createFormReader({
      store,
      reportWriter: createFormReportWriter(),
      ...readerOptions,
    });
    try {
      log(
        output(
          await reader.read({
            url: args.url,
            browserSlot: args['browser-slot'],
            headless:
              args.headed === true || args.headed === 'true'
                ? false
                : args.headless === undefined
                  ? undefined
                  : args.headless === true || args.headless === 'true',
          })
        )
      );
      return 0;
    } finally {
      try {
        await reader.stop();
      } finally {
        await store.close?.();
      }
    }
  },
});
