import {
  applicationFailure as fail,
  applicationView,
} from './application-options.js';
import {
  applicationConfirmationPolicy,
  applicationConfirmationSteps,
} from './application-confirmations.js';
import { applicationLetterRequested } from './application-letters.js';
import {
  continuationFields,
  continuationWrites,
  continuationAnswered,
  continuationEmpty,
} from './application-continuation-fields.js';

const guard = (record) => JSON.stringify(record.guard);

/** Explicit bounded continuation; status/recovery never schedule an action. */
export class ApplicationContinuation {
  constructor(service) {
    this.service = service;
    this.entries = new WeakMap();
  }
  entry(record, input) {
    let entry = this.entries.get(record);
    const valid =
      entry?.documentKey === record.page.documentKey &&
      entry.revision === record.revision &&
      entry.guard === guard(record);
    if (
      input.step !== undefined &&
      (!valid ||
        record.continuation?.step !== input.step ||
        !record.continuation.confirmationRequired)
    ) {
      throw fail('confirmation');
    }
    if (!valid) {
      entry = {
        documentKey: record.page.documentKey,
        guard: guard(record),
        revision: record.revision,
        done: new Set(),
        autofilled: false,
      };
      this.entries.set(record, entry);
    }
    return entry;
  }
  pending(record, entry, step, confirmationRequired = true) {
    record.continuation = { step, confirmationRequired };
    entry.guard = guard(record);
    entry.revision = record.revision;
    this.service.trace({
      event: 'application-continuation-held',
      step,
      confirmationRequired,
    });
    return applicationView(record);
  }
  needs(record, input, step) {
    return (
      applicationConfirmationPolicy(record.options).includes(step) &&
      input.step !== step
    );
  }
  async answers(record, entry, signal) {
    const fields = continuationFields(record);
    const writes = continuationWrites(record);
    const empty = fields.length > 0 && fields.every(continuationEmpty);
    await this.service.actions.prefill(
      record,
      { part: 'answers', confirm: true },
      signal
    );
    entry.autofilled = empty && writes.length > 0;
  }
  async runStep(record, entry, step, signal) {
    const { service } = this;
    if (step === 'answers') {
      await this.answers(record, entry, signal);
    } else if (step === 'cover-letter') {
      await service.actions.prefill(
        record,
        { part: 'cover-letter', confirm: true },
        signal
      );
    }
    entry.done.add(step);
    entry.guard = guard(record);
    entry.revision = record.revision;
  }
  next(record, entry) {
    if (!record.resumeUrl && !entry.done.has('popup')) {
      return 'popup';
    }
    if (!entry.done.has('answers') && continuationWrites(record).length) {
      return 'answers';
    }
    if (
      !entry.done.has('cover-letter') &&
      applicationLetterRequested(record.options) &&
      record.letter !== 'verified'
    ) {
      return 'cover-letter';
    }
    const fields = continuationFields(record);
    if (
      (record.page.questions && !fields.length) ||
      !fields.every((field) => continuationAnswered(field, fields))
    ) {
      return 'missing-answers';
    }
    return 'send';
  }
  async send(record, entry, input, signal) {
    const exact =
      entry.autofilled &&
      record.exact &&
      record.options.autoExact &&
      !record.options.supervised;
    const needs =
      this.needs(record, input, 'send') &&
      (record.page.questions ||
        continuationFields(record).length > 0 ||
        record.options.supervised) &&
      !exact;
    if (needs) {
      return this.pending(record, entry, 'send');
    }
    const result = await this.service.actions.advance(
      record,
      {
        action: 'submit',
        confirm: true,
        ...(exact ? { automatic: true } : {}),
      },
      signal
    );
    record.continuation =
      result.delivery === 'provider-confirmed'
        ? { step: 'complete', confirmationRequired: false }
        : null;
    entry.guard = guard(record);
    entry.revision = record.revision;
    return applicationView(record);
  }
  validate(input) {
    if (
      input.step === undefined
        ? input.confirm !== undefined
        : !applicationConfirmationSteps.includes(input.step) ||
          input.confirm !== true
    ) {
      throw fail('confirmation');
    }
  }
  async run(record, input, signal) {
    this.validate(input);
    if (record.options.testMode) {
      return applicationView({ ...record, state: 'test-preview' });
    }
    if (
      !['ready', 'review'].includes(record.state) ||
      record.hold ||
      record.attempted.submit ||
      record.delivery !== 'none'
    ) {
      throw fail('state');
    }
    await this.service.review.check(
      record,
      record.state === 'ready' ? 'enter' : 'submit',
      signal
    );
    if (record.state === 'ready') {
      if (input.step !== undefined) {
        throw fail('confirmation');
      }
      await this.service.actions.advance(
        record,
        { action: 'form', confirm: true },
        signal
      );
    }
    if (record.state !== 'review') {
      return applicationView(record);
    }
    return this.walk(record, input, signal);
  }
  async walk(record, input, signal) {
    const entry = this.entry(record, input);
    record.continuation = null;
    // Four distinct stages; each action reuses the existing acknowledgement and guards.
    for (let count = 0; count < 4; count++) {
      const step = this.next(record, entry);
      if (step === 'missing-answers') {
        return this.pending(record, entry, step, false);
      }
      if (step === 'send') {
        return this.send(record, entry, input, signal);
      }
      if (this.needs(record, input, step)) {
        return this.pending(record, entry, step);
      }
      await this.runStep(record, entry, step, signal);
      if (
        record.state !== 'review' ||
        record.hold ||
        (step === 'cover-letter' && record.letter !== 'verified')
      ) {
        return applicationView(record);
      }
    }
    throw fail('incomplete');
  }
}
