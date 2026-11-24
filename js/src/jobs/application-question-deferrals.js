import { approvedExactApplicationAnswer } from './application-review.js';
import { questionKey } from '../automation/question-match.js';
import { acknowledgedRead } from './acknowledged-store.js';
import {
  continuationFields,
  continuationAnswered,
} from './application-continuation-fields.js';
import { applicationFailure as fail } from './application-options.js';
import { applicationPreservationPolicy } from './application-run-modes.js';
import {
  deferredQuestionChange,
  deferredQuestionFailure,
} from './deferred-question-data.js';
import {
  storedDeferredQuestions,
  saveDeferredQuestions,
  associateDeferredQuestions,
  matchesDeferredQuestion,
  pendingDeferredVacancies,
} from './deferred-questions.js';

const fields = (record) => {
  const native = continuationFields(record);
  return native.map((field) => ({
    question: field.group?.label || field.label,
    answered: continuationAnswered(field, native),
    available: Boolean(
      continuationAnswered(field, native) ||
      (approvedExactApplicationAnswer(field) &&
        !field.answer.effects?.length &&
        !field.answer.missing?.length &&
        field.answer.complete &&
        field.answer.proposal)
    ),
  }));
};
const eligible = (record) =>
  record?.page?.questions &&
  record.guard &&
  !record.paused &&
  !record.options.testMode &&
  !record.hold &&
  !record.attempted.submit &&
  record.delivery === 'none' &&
  ['review', 'review-delay', 'deferred'].includes(record.state);
const matching = (record, entries) => {
  const native = fields(record);
  const budget = { remaining: 4 * 1024 ** 2 };
  return new Set(
    entries
      .filter((row) =>
        native.some(
          (field) =>
            (row.mode === 'always' || !field.available) &&
            matchesDeferredQuestion(field.question, row.question, budget)
        )
      )
      .map((row) => row.id)
  );
};

/** Persistent question policy is independent of the RAM-only questionnaire queue. */
export class ApplicationQuestionDeferrals {
  constructor(service, watchMs = 2000) {
    Object.assign(this, { service, watchMs });
  }
  async change(input, signal) {
    const options = deferredQuestionChange(input);
    const before = await storedDeferredQuestions(this.service.store, options);
    if (options.revision !== before.revision) {
      throw deferredQuestionFailure('conflict');
    }
    let entries = before.entries;
    if (options.action === 'remove') {
      if (!entries.some((row) => row.id === options.entryId)) {
        throw deferredQuestionFailure('conflict');
      }
      entries = entries.filter((row) => row.id !== options.entryId);
    } else {
      const previous = entries.find(
        (row) => questionKey(row.question) === questionKey(options.question)
      );
      entries = [
        {
          id: previous?.id ?? globalThis.crypto.randomUUID(),
          question: options.question,
          mode: options.mode,
          vacancies: previous?.vacancies ?? [],
          createdAt: previous?.createdAt ?? new Date().toISOString(),
        },
        ...entries.filter((row) => row !== previous),
      ];
    }
    signal.throwIfAborted();
    const saved = await saveDeferredQuestions(
      this.service.store,
      before,
      entries
    );
    const record = this.service.current;
    if (record?.browserSlot === options.browserSlot && eligible(record)) {
      // Read actual owner edits before deciding whether the new policy applies.
      await this.service.review.inspect(record, signal);
      await this.automatic(signal);
    }
    return this.service.current === record && record
      ? saved
      : storedDeferredQuestions(this.service.store, options);
  }
  async defer(record, input, signal) {
    if (!eligible(record)) {
      throw fail('state');
    }
    const questions = [
      ...new Set(
        fields(record)
          .filter((row) => !row.answered)
          .map((row) => row.question)
      ),
    ];
    if (!questions.length) {
      throw deferredQuestionFailure('input');
    }
    const before = await storedDeferredQuestions(this.service.store, record);
    const entries = associateDeferredQuestions(before, questions, record.url);
    return this.preserve(record, input, signal, before, entries);
  }
  async preserve(record, input, signal, before, entries) {
    const service = this.service;
    const check = applicationPreservationPolicy(service, record, signal);
    await service.deferrals.preserve(record, input, signal, check);
    await saveDeferredQuestions(service.store, before, entries);
    await service.review.check(record, 'submit', signal, true);
    check();
    service.trace({
      event: 'application-questions-deferred',
      count: entries.length,
    });
    const result = await service.close();
    await service.batch.questionDeferred(record);
    return result;
  }
  async automatic(signal) {
    const record = this.service.current;
    if (!record) {
      return;
    }
    const before = await storedDeferredQuestions(this.service.store, record);
    this.revision = before.revision;
    if (record.delivery === 'provider-confirmed' && record.page?.delivered) {
      const entries = before.entries.flatMap((row) => {
        const vacancies = row.vacancies.filter((url) => url !== record.url);
        return row.vacancies.length &&
          !vacancies.length &&
          row.mode !== 'always'
          ? []
          : [{ ...row, vacancies }];
      });
      if (JSON.stringify(entries) !== JSON.stringify(before.entries)) {
        await saveDeferredQuestions(this.service.store, before, entries);
      }
      return;
    }
    if (!eligible(record) || !before.entries.length) {
      return;
    }
    const matched = matching(record, before.entries);
    if (!matched.size) {
      return;
    }
    const entries = before.entries.map((row) =>
      matched.has(row.id) && !row.vacancies.includes(record.url)
        ? { ...row, vacancies: [...row.vacancies, record.url] }
        : row
    );
    return this.preserve(record, { confirm: true }, signal, before, entries);
  }
  async assertAllowed(record, signal) {
    const saved = await storedDeferredQuestions(this.service.store, record);
    signal.throwIfAborted();
    if (
      eligible(record) &&
      saved.entries.length &&
      matching(record, saved.entries).size
    ) {
      throw fail('state');
    }
  }
  async assertVacancyAllowed(options) {
    if (
      (await pendingDeferredVacancies(this.service.store, options)).has(
        options.url
      )
    ) {
      throw fail('question-deferred');
    }
  }
  stopWatch() {
    globalThis.clearTimeout(this.timer);
    this.token = null;
  }
  watch() {
    this.stopWatch();
    const service = this.service;
    const record = service.current;
    if (service.stopped || !eligible(record)) {
      return;
    }
    const token = {};
    this.token = token;
    this.timer = globalThis.setTimeout(() => {
      this.work = this.checkWatch(token, record);
    }, this.watchMs);
    this.timer.unref?.();
  }
  async checkWatch(token, record) {
    const service = this.service;
    try {
      const saved = await acknowledgedRead(service.store, () =>
        storedDeferredQuestions(service.store, record)
      );
      if (
        this.token !== token ||
        service.current !== record ||
        service.stopped
      ) {
        return;
      }
      if (saved.revision !== this.revision) {
        await service.operate((signal) =>
          service.review.inspect(record, signal)
        );
      }
    } catch (error) {
      service.trace({
        event: 'application-question-policy-watch-refused',
        code: error.code ?? 'unknown',
      });
    } finally {
      if (this.token === token) {
        this.watch();
      }
    }
  }
}
