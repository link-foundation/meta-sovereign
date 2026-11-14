import { loadFormInspection } from './forms-inspection-file.js';
import {
  FORMS_ASSIGNMENT_HELP,
  formsAssignmentCommands,
} from './forms-assignment-commands.js';
import { questionMatchingFlags } from './question-matching-flags.js';
import { modelDraftFlag, withAnswerModel } from './answer-model-commands.js';
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
import {
  FORMS_RESUME_HELP,
  formResumeCommands,
} from './forms-resume-commands.js';

export const FORMS_HELP = `  forms-read    --url=<http-url> [--format=json|markdown] [--browser-slot=<name>] [--headed|--headless] [--store=<dir>]
  forms-plan    --file=<inspection.json> [--format=json|markdown] [--profile-id=<id>] [--profile=<Lino>] [--salary=<Lino>] [--vacancy=<Lino>] [--approximate=false] [--threshold=0.78] [--case-sensitive=false] [--model-draft] [--source=<provider>] [--chat=<id>] [--store=<dir>]
${FORMS_REVIEW_HELP}
${FORMS_WATCHERS_HELP}
${FORMS_RESUME_HELP}
${FORMS_ASSIGNMENT_HELP}`;

export const createFormsCommands = ({ openStore, ...readerOptions }) => ({
  ...formWatcherCommands,
  ...formsAssignmentCommands({ openStore, ...readerOptions }),
  ...formResumeCommands({ openStore }),
  ...createFormReviewCommands({ openStore, ...readerOptions }),
  'forms-plan': async (args, log) => {
    const output = formReportOutput(args.format);
    const inspection = await loadFormInspection(args.file);
    const store = await openStore(args.store ?? defaultStoreDir());
    try {
      const report = await withAnswerModel(
        readerOptions.modelRunner,
        (runner) =>
          planFormAnswers(
            store,
            {
              inspection,
              ...questionMatchingFlags(args),
              profileId: args['profile-id'],
              profile: args.profile ? decodeWire(args.profile) : undefined,
              approximate: ![false, 'false'].includes(args.approximate),
              source: args.source,
              chat: args.chat,
              salary: args.salary ? decodeWire(args.salary) : undefined,
              vacancy: args.vacancy ? decodeWire(args.vacancy) : undefined,
              modelDraft: modelDraftFlag(args['model-draft']),
            },
            { runner }
          )
      );
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
