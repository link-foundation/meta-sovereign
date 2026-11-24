import { loadFormInspection } from './forms-inspection-file.js';
import { formsAssignmentCommands } from './forms-assignment-commands.js';
import { questionMatchingFlags } from './question-matching-flags.js';
import { questionPeriodConfiguration } from './question-period-configuration.js';
import { modelDraftFlag, withAnswerModel } from './answer-model-commands.js';
import { decodeWire } from '../transport/lino.js';
import { createFormReader, planFormAnswers } from '../forms/reader.js';
import { defaultStoreDir } from '../storage/app-directory.js';
import {
  createFormReportWriter,
  persistFormReport,
} from '../forms/report-file.js';
import { formReportOutput } from '../forms/report-markdown.js';
import { createFormReviewCommands } from './forms-review-commands.js';
import { formWatcherCommands } from './forms-watcher-commands.js';
import { formResumeCommands } from './forms-resume-commands.js';

export { FORMS_HELP } from './help.js';

export const createFormsCommands = ({ openStore, ...readerOptions }) => ({
  ...formWatcherCommands,
  ...formsAssignmentCommands({ openStore, ...readerOptions }),
  ...formResumeCommands({ openStore }),
  ...createFormReviewCommands({ openStore, ...readerOptions }),
  'forms-plan': async (args, log) => {
    const output = formReportOutput(args.format);
    const answerFinalPeriod = await questionPeriodConfiguration(args);
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
              answerFinalPeriod,
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
            { runner, readVacancy: readerOptions.readAssignmentVacancy }
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
