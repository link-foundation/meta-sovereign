import { createInterface } from 'node:readline';
import { createFormReader, formUrl } from '../forms/reader.js';
import { decodeWire } from '../transport/lino.js';
import { loadResumePdf } from './forms-resume-file.js';
import { defaultStoreDir } from '../storage/app-directory.js';
import { createFormReportWriter } from '../forms/report-file.js';
import { formReportOutput } from '../forms/report-markdown.js';

export const FORMS_REVIEW_HELP =
  '  forms-review  --url=<http-url> | --urls=<Lino-list> [--format=json|markdown] [--browser-slot=<name>] [--resume-pdf=<path>] [--profile-id=<id>] [--approximate=false] [--headed|--headless] [--store=<dir>]';
const inputs = (args) => {
  const urls = args.urls ? decodeWire(args.urls) : [args.url];
  if (!Array.isArray(urls) || !urls.length || urls.length > 4) {
    throw new Error('Review one to four form URLs at a time.');
  }
  if (
    args.headless !== undefined &&
    ![true, false, 'true', 'false'].includes(args.headless)
  ) {
    throw new Error('--headless must be true or false');
  }
  return urls.map((url, i) => ({
    url: formUrl(url),
    browserSlot:
      urls.length === 1
        ? (args['browser-slot'] ?? 'form-1')
        : `${args['browser-slot'] ?? 'form'}-${i + 1}`,
    headless: [true, 'true'].includes(args.headed)
      ? false
      : args.headless === undefined
        ? undefined
        : [true, 'true'].includes(args.headless),
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
    ].includes(action)
  ) {
    throw new Error(
      'Use list, read/history/plan/focus/close <slot>, disclose <slot> <plan-id> <field-id>, attach <slot> <plan-id> <field-id> [replace], apply <slot> <plan-id> <field-id,...> [replace] or quit.'
    );
  }
  if (action === 'plan') {
    return reader.planReview({ id: session.id, ...options });
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
      file: options.file,
      replaceExisting: replace === 'replace',
    });
  }
  if (action === 'disclose') {
    return reader.discloseReview({ id: session.id, planId, fieldId: fieldIds });
  }
  return reader[`${action}Review`](session.id);
};

const reviewOutput = (result, output, format) =>
  format === 'markdown' &&
  ['read-only', 'answer-plan', 'review-journal'].includes(result.mode)
    ? output(result)
    : JSON.stringify(result);

export const createFormReviewCommands = ({
  openStore,
  reviewInput = () =>
    createInterface({ input: process.stdin, terminal: false }),
  ...options
}) => ({
  'forms-review': async (args, log) => {
    const output = formReportOutput(args.format);
    const forms = inputs(args);
    const file = args['resume-pdf']
      ? await loadResumePdf(args['resume-pdf'])
      : null;
    const store = await openStore(args.store ?? defaultStoreDir());
    const reader = createFormReader({
      store,
      reportWriter: createFormReportWriter(),
      ...options,
    });
    let stream;
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
      for (const form of forms) {
        log(JSON.stringify(await reader.openReview(form)));
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
            'apply <slot> <plan-id> <field-id,...> [replace]',
            'disclose <slot> <plan-id> <field-id>',
            'attach <slot> <plan-id> <field-id> [replace]',
            'quit',
          ],
          note: 'Review browsers stay open until closed, idle expiry, quit or process shutdown. Plan and explicitly select fields to apply; forms are never submitted.',
        })
      );
      stream = reviewInput();
      for await (const line of stream) {
        if (cancelled || line.trim() === 'quit') {
          break;
        }
        try {
          const result = await command(reader, line, {
            file,
            profileId: args['profile-id'] ?? '',
            approximate: ![false, 'false'].includes(args.approximate),
          });
          log(reviewOutput(result, output, args.format));
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
      return cancelled ? 130 : 0;
    } finally {
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
      stream?.close?.();
      try {
        await (stopping ?? reader.stop());
      } finally {
        await store.close?.();
      }
    }
  },
});
