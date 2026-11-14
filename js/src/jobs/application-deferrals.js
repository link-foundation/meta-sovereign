import { formAnswerPairs } from '../forms/answer-pairs.js';
import { learnFormAnswerPairs } from '../forms/answer-learning.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { storedVacancyChoices } from './vacancy-choice-service.js';
import { vacancyChoiceSlot } from './vacancy-choice.js';
import {
  applicationKey,
  applicationFailure as fail,
  applicationView,
} from './application-options.js';
import { applicationQueueResult } from './application-deferral-data.js';
import { nativeDraftFields } from './application-drafts.js';
import { readApplicationJournal } from './application-journal.js';

/** Worker-owned queue: durable backups are never interpreted as exclusions. */
export class ApplicationDeferrals {
  constructor(service) {
    this.service = service;
    this.entries = new Map();
    this.revision = globalThis.crypto.randomUUID();
  }
  list(input) {
    const browserSlot = vacancyChoiceSlot(input);
    return applicationQueueResult(
      {
        ok: true,
        mode: 'hh-application-queue',
        browserSlot,
        revision: this.revision,
        entries: [...this.entries.values()]
          .filter((row) => row.browserSlot === browserSlot)
          .map((row) => ({
            ...row,
            ...(row.reason === 'generic-error'
              ? { ready: this.service.retries.ready(row) }
              : {}),
          })),
      },
      input
    );
  }
  async preserve(record, input, signal, policyCheck, capture) {
    const service = this.service;
    const check = async () => {
      policyCheck();
      await (capture
        ? capture()
        : service.review.check(record, 'submit', signal, true));
      policyCheck();
    };
    await check();
    if (!capture) {
      await service.drafts.admit(record, input, signal);
    }
    const fields = nativeDraftFields(record);
    const report = { ...record.reviewPlan.inspection, fields };
    const pairs = formAnswerPairs(report);
    // Preserve all native answers in a full recovery draft and a private Q&A
    // observation. Reusable learning remains subject to the existing exclusions
    // (e.g. salary and assignments), contraction and owner approval policy.
    await service.drafts.backup(
      record,
      input,
      signal,
      capture ? check : undefined
    );
    await check();
    await saveAcknowledgedRecord(service.store, {
      id: record.id.replace(
        'secret:jobs-application:',
        'secret:jobs-application-answers:'
      ),
      version: 1,
      url: record.url,
      browserSlot: record.browserSlot,
      draftId: record.draft.id,
      capturedAt: record.draft.capturedAt,
      fields: record.draft.fields,
      pairs,
    });
    await learnFormAnswerPairs(
      service.store,
      pairs
        .filter(
          (pair) => pair.field.type !== 'radio' || pair.field.group?.label
        )
        .map((pair) => ({
          ...pair,
          evidence: `form:${record.draft.id}:${pair.controls.join(',')}`,
        })),
      { check, source: 'hh' }
    );
    await service.store.flush?.();
    // Neither a slow checkpoint nor the shared Q&A writer can admit stale form
    // values to the queue. A refusal retains the browser and all owner controls.
    await check();
  }
  async defer(record, input, signal, policyCheck = () => {}) {
    if (
      !record.page?.questions ||
      (this.entries.size >= 1000 && !this.entries.has(record.id))
    ) {
      throw fail('queue');
    }
    await this.preserve(record, input, signal, policyCheck);
    this.enqueue(record, 'questionnaire');
    return this.service.close();
  }
  enqueue(record, reason, extra = {}) {
    const entry = {
      id: globalThis.crypto.randomUUID(),
      url: record.url,
      browserSlot: record.browserSlot,
      requestId: record.requestId,
      title: record.vacancy.title,
      queuedAt: new Date().toISOString(),
      reason,
      ...extra,
    };
    this.entries.set(record.id, entry);
    this.revision = globalThis.crypto.randomUUID();
    this.service.trace({
      event: 'application-retry-queued',
      reason,
      count: this.entries.size,
    });
    return entry;
  }
  async automatic(signal) {
    const service = this.service;
    const record = service.current;
    if (
      !record?.noQuestionnaires ||
      record.paused ||
      record.options.testMode ||
      record.hold ||
      record.state !== 'deferred' ||
      !record.page?.questions ||
      record.attempted.submit ||
      record.delivery !== 'none' ||
      !record.guard
    ) {
      return;
    }
    const version = service.modes.version(record.browserSlot);
    const check = () => {
      signal.throwIfAborted();
      if (
        service.current !== record ||
        !record.noQuestionnaires ||
        record.paused ||
        service.modes.version(record.browserSlot) !== version
      ) {
        throw fail('mode-changed');
      }
    };
    try {
      return await this.defer(record, { confirm: true }, signal, check);
    } catch (error) {
      if (error.code !== 'jobs-application-mode-changed') {
        throw error;
      }
      service.trace({ event: 'application-automatic-deferral-cancelled' });
      return applicationView(record);
    }
  }
  async retry(input, signal) {
    const key = applicationKey(input);
    const entry = this.entries.get(key.id);
    if (
      input.confirm !== true ||
      !entry ||
      entry.id !== input.queueId ||
      entry.requestId !== input.requestId
    ) {
      throw fail('queue');
    }
    const service = this.service;
    if (service.current) {
      throw fail('busy');
    }
    const previous = readApplicationJournal(
      await service.store.get(key.id),
      key
    );
    if (
      previous.requestId !== entry.requestId ||
      (entry.reason !== 'generic-error' &&
        (previous.attempted.submit || previous.delivery !== 'none')) ||
      !previous.draft
    ) {
      throw fail('state');
    }
    const choices = await storedVacancyChoices(service.store, key);
    if (choices.entries.some((row) => row.url === key.url)) {
      throw fail('excluded');
    }
    if (
      entry.reason === 'questionnaire' &&
      service.modes.read(key.browserSlot).noQuestionnaires
    ) {
      throw fail('questionnaires-held');
    }
    signal.throwIfAborted();
    if (entry.reason === 'generic-error') {
      await service.retries.admit(entry, previous, signal);
    }
    const receipt = await service.open({ ...entry, recover: true }, signal);
    // Opening creates a freshly inspected review. Filling/restoration and native
    // sending each retain their own confirmation; a lost reply never retries.
    this.entries.delete(key.id);
    this.revision = globalThis.crypto.randomUUID();
    return service.retries.release(entry, receipt);
  }
  clear() {
    this.entries.clear();
    this.revision = globalThis.crypto.randomUUID();
  }
}
