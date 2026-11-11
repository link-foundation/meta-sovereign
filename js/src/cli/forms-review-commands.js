import { createInterface } from 'node:readline';
import { questionMatchingFlags } from './question-matching-flags.js';
import { createFormReader, formUrl } from '../forms/reader.js';
import { decodeWire } from '../transport/lino.js';
import { loadResumePdf } from './forms-resume-file.js';
import { defaultStoreDir } from '../storage/app-directory.js';
import { createFormReportWriter } from '../forms/report-file.js';
import { formReportOutput } from '../forms/report-markdown.js';
import { browserName } from '../browser/policy.js';
import { reviewCapacityValue } from '../forms/review-capacity.js';
import { modelDraftFlag } from './answer-model-commands.js';
import { createLocalAnswerModel } from '../automation/local-answer-model.js';
import { formReportSnapshot } from '../forms/review-journal.js';

export const FORMS_REVIEW_HELP =
  '  forms-review  <url> [<url> ...] | --url=<http-url> | --urls=<Lino-list> [--prefill] [--max-sessions=<n>] [--format=json|markdown] [--capture-pages=false] [--no-learn] [--browser-slot=<name>] [--resume-pdf=<path>] [--profile-id=<id>] [--salary=<Lino>] [--vacancy=<Lino>] [--approximate=false] [--threshold=0.78] [--case-sensitive=false] [--model-draft] [--headed|--headless] [--store=<dir>]';
const inputs = (args) => {
  const sources = [
    args.urls !== undefined,
    args.url !== undefined,
    Boolean(args._?.length),
  ];
  if (sources.filter(Boolean).length !== 1) {
    throw new Error('Use positional URLs, --url or --urls.');
  }
  const urls =
    args.urls !== undefined
      ? decodeWire(args.urls)
      : args.url !== undefined
        ? [args.url]
        : args._;
  if (!Array.isArray(urls) || !urls.length) {
    throw new Error('Supply one or more form URLs.');
  }
  if (
    args.headless !== undefined &&
    ![true, false, 'true', 'false'].includes(args.headless)
  ) {
    throw new Error('--headless must be true or false');
  }
  if (
    args['no-learn'] !== undefined &&
    ![true, false, 'true', 'false'].includes(args['no-learn'])
  ) {
    throw new Error('--no-learn must be true or false');
  }
  if (
    args['capture-pages'] !== undefined &&
    ![true, false, 'true', 'false'].includes(args['capture-pages'])
  ) {
    throw new Error('--capture-pages must be true or false');
  }
  return urls.map((url, i) => ({
    url: formUrl(url),
    browserSlot: browserName(
      urls.length === 1
        ? (args['browser-slot'] ?? 'form-1')
        : `${args['browser-slot'] ?? 'form'}-${i + 1}`
    ),
    headless: [true, 'true'].includes(args.headed)
      ? false
      : args.headless === undefined
        ? undefined
        : [true, 'true'].includes(args.headless),
    autoCapture:
      args['capture-pages'] === undefined
        ? undefined
        : [true, 'true'].includes(args['capture-pages']),
    learn: ![true, 'true'].includes(args['no-learn']),
  }));
};
const command = async (reader, line, options) => {
  const [action, slot, planId, fieldIds, replace] = line.trim().split(/\s+/u);
  if (action === 'list') {
    return reader.listReviews();
  }
  const session = reader
    .listReviews()
    .sessions.find((entry) => entry.browserSlot === slot);
  if (
    !session ||
    ![
      'read',
      'history',
      'focus',
      'close',
      'plan',
      'apply',
      'disclose',
      'attach',
      'prefill',
    ].includes(action)
  ) {
    throw new Error(
      'Use list, read/history/plan/prefill/focus/close <slot>, disclose <slot> <plan-id> <field-id>, attach <slot> <plan-id> <field-id> [replace], apply <slot> <plan-id> <field-id,...> [replace] or quit.'
    );
  }
  if (action === 'plan') {
    const result = await reader.planReview({ id: session.id, ...options });
    options.plans.set(slot, {
      id: result.reviewPlan.id,
      resume: result.reviewPlan.resume,
    });
    return result;
  }
  if (action === 'prefill') {
    return reader.prefillReview({
      ...options,
      id: session.id,
      requestId: globalThis.crypto.randomUUID(),
    });
  }
  if (action === 'apply') {
    return reader.applyReview({
      id: session.id,
      planId,
      fields: fieldIds?.split(','),
      replaceExisting: replace === 'replace',
    });
  }
  if (action === 'attach') {
    return reader.attachReview({
      id: session.id,
      planId,
      fieldId: fieldIds,
      ...(options.file
        ? { file: options.file }
        : {
            resumeRevision:
              options.plans.get(slot)?.id === planId
                ? options.plans.get(slot).resume?.revision
                : undefined,
          }),
      replaceExisting: replace === 'replace',
    });
  }
  if (action === 'disclose') {
    return reader.discloseReview({ id: session.id, planId, fieldId: fieldIds });
  }
  return reader[`${action}Review`](session.id);
};

const reviewOutput = (result, output, format) =>
  format === 'markdown' && result.mode === 'prefill-result' && result.report
    ? output(formReportSnapshot(result))
    : format === 'markdown' &&
        ['read-only', 'answer-plan', 'review-journal'].includes(result.mode)
      ? output(result)
      : JSON.stringify(result);

const requestedCapacity = (args, count) => {
  const capacity =
    args['max-sessions'] === undefined
      ? null
      : reviewCapacityValue(
          typeof args['max-sessions'] === 'string'
            ? Number(args['max-sessions'])
            : args['max-sessions']
        );
  if (capacity !== null && count > capacity) {
    throw new Error('Review capacity must accommodate every requested form.');
  }
  return capacity;
};

const openReviews = async (
  reader,
  forms,
  capacity,
  log,
  isCancelled,
  automatic
) => {
  let failed = false;
  const limits = await reader.reviewCapacity();
  if (capacity !== null || forms.length > limits.maxSessions) {
    await reader.configureReviewCapacity({
      maxSessions: capacity ?? forms.length,
      revision: limits.revision,
    });
  }
  for (const form of forms) {
    if (isCancelled()) {
      break;
    }
    try {
      const opened = await reader.openReview(form);
      log(JSON.stringify(opened));
      if (automatic.enabled && !isCancelled()) {
        const result = await reader.prefillReview({
          ...automatic.settings,
          id: opened.session.id,
          requestId: globalThis.crypto.randomUUID(),
        });
        log(reviewOutput(result, automatic.output, automatic.format));
        failed ||= !result.ok;
      }
    } catch (error) {
      if (isCancelled()) {
        break;
      }
      failed = true;
      log(
        JSON.stringify({
          ok: false,
          browserSlot: form.browserSlot,
          code: error.code ?? 'form-review-failed',
          error: error.message,
        })
      );
    }
  }
  return failed;
};

const reviewLines = async ({
  reader,
  stream,
  settings,
  isCancelled,
  log,
  output,
  format,
}) => {
  for await (const line of stream) {
    if (isCancelled() || line.trim() === 'quit') {
      break;
    }
    try {
      const result = await command(reader, line, settings);
      log(reviewOutput(result, output, format));
    } catch (error) {
      log(
        JSON.stringify({
          ok: false,
          code: error.code ?? 'form-review-failed',
          error: error.message,
        })
      );
    }
  }
};

const reviewModel = (runner) =>
  runner ? { draft: runner, stop: async () => {} } : createLocalAnswerModel();

const prefillFlag = (value) => {
  if (value !== undefined && ![true, false, 'true', 'false'].includes(value)) {
    throw new Error('--prefill must be true or false');
  }
  return [true, 'true'].includes(value);
};
const reviewSettings = (args, file, modelDraft) => ({
  file,
  profileId: args['profile-id'] ?? '',
  salary: args.salary ? decodeWire(args.salary) : undefined,
  vacancy: args.vacancy ? decodeWire(args.vacancy) : undefined,
  approximate: ![false, 'false'].includes(args.approximate),
  ...questionMatchingFlags(args),
  modelDraft,
});

export const createFormReviewCommands = ({
  openStore,
  reviewInput = () =>
    createInterface({ input: process.stdin, terminal: false }),
  ...options
}) => ({
  'forms-review': async (args, log) => {
    const output = formReportOutput(args.format);
    const forms = inputs(args);
    const modelDraft = modelDraftFlag(args['model-draft']);
    const automatic = prefillFlag(args.prefill);
    const capacity = requestedCapacity(args, forms.length);
    const file = args['resume-pdf']
      ? await loadResumePdf(args['resume-pdf'])
      : null;
    const settings = reviewSettings(args, file, modelDraft);
    const store = await openStore(args.store ?? defaultStoreDir());
    const model = reviewModel(options.modelRunner);
    const reader = createFormReader({
      store,
      reportWriter: createFormReportWriter(),
      ...options,
      modelRunner: model.draft,
    });
    let stream;
    const plans = new Map();
    let cancelled = false;
    let stopping;
    const cancel = () => {
      cancelled = true;
      stream?.close?.();
      stopping ??= reader.stop();
      stopping.catch(() => {});
    };
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    try {
      const failed = await openReviews(
        reader,
        forms,
        capacity,
        log,
        () => cancelled,
        {
          enabled: automatic,
          settings,
          output,
          format: args.format,
        }
      );
      if (cancelled) {
        return 130;
      }
      log(
        JSON.stringify({
          ok: true,
          commands: [
            'list',
            'read <slot>',
            'history <slot>',
            'focus <slot>',
            'close <slot>',
            'plan <slot>',
            'prefill <slot>',
            'apply <slot> <plan-id> <field-id,...> [replace]',
            'disclose <slot> <plan-id> <field-id>',
            'attach <slot> <plan-id> <field-id> [replace]',
            'quit',
          ],
          note: 'Close stops a review browser and its watcher. Durable learning watchers remain open after quit or end of input, and close after 24 idle hours. Prefill fills supported empty answers and the selected or configured PDF. Review answers and navigate later pages yourself. Forms are never submitted.',
        })
      );
      stream = reviewInput();
      await reviewLines({
        reader,
        stream,
        settings: {
          ...settings,
          plans,
        },
        isCancelled: () => cancelled,
        log,
        output,
        format: args.format,
      });
      return cancelled ? 130 : failed ? 1 : 0;
    } catch (error) {
      if (cancelled) {
        return 130;
      }
      throw error;
    } finally {
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
      stream?.close?.();
      try {
        if (stopping) {
          await stopping;
        } else {
          log(JSON.stringify(await reader.detachReviews()));
        }
      } finally {
        try {
          await model.stop();
        } finally {
          await store.close?.();
        }
      }
    }
  },
});
