import { formAnswerPairs } from '../forms/answer-pairs.js';
import { learnFormAnswerPairs } from '../forms/answer-learning.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { storedVacancyChoices } from './vacancy-choice-service.js';
import { vacancyChoiceSlot } from './vacancy-choice.js';
import {
  applicationKey,
  applicationFailure as fail,
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
          .map((row) => ({ ...row })),
      },
      input
    );
  }
  async preserve(record, input, signal) {
    const service = this.service;
    await service.drafts.admit(record, input, signal);
    const fields = nativeDraftFields(record);
    const report = { ...record.reviewPlan.inspection, fields };
    const pairs = formAnswerPairs(report);
    // Preserve all native answers in a full recovery draft and a private Q&A
    // observation. Reusable learning remains subject to the existing exclusions
    // (e.g. salary and assignments), contraction and owner approval policy.
    await service.drafts.backup(record, input, signal);
    const check = () => service.review.check(record, 'submit', signal, true);
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
  async defer(record, input, signal) {
    if (
      !record.page?.questions ||
      (this.entries.size >= 1000 && !this.entries.has(record.id))
    ) {
      throw fail('queue');
    }
    await this.preserve(record, input, signal);
    const entry = {
      id: globalThis.crypto.randomUUID(),
      url: record.url,
      browserSlot: record.browserSlot,
      requestId: record.requestId,
      title: record.vacancy.title,
      queuedAt: new Date().toISOString(),
      reason: 'questionnaire',
    };
    this.entries.set(record.id, entry);
    this.revision = globalThis.crypto.randomUUID();
    this.service.trace({
      event: 'application-questionnaire-queued',
      count: this.entries.size,
    });
    return this.service.close();
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
      previous.attempted.submit ||
      previous.delivery !== 'none' ||
      !previous.draft
    ) {
      throw fail('state');
    }
    const choices = await storedVacancyChoices(service.store, key);
    if (choices.entries.some((row) => row.url === key.url)) {
      throw fail('excluded');
    }
    signal.throwIfAborted();
    const receipt = await service.open({ ...entry, recover: true }, signal);
    // Opening creates a freshly inspected review. Filling/restoration and native
    // sending each retain their own confirmation; a lost reply never retries.
    this.entries.delete(key.id);
    this.revision = globalThis.crypto.randomUUID();
    return receipt;
  }
  clear() {
    this.entries.clear();
    this.revision = globalThis.crypto.randomUUID();
  }
}
