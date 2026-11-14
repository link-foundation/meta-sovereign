import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import {
  applicationKey,
  applicationFailure as fail,
  applicationView,
} from './application-options.js';
import { saveApplicationJournal } from './application-journal.js';

export const applicationRetryMs = 5 * 60 * 60 * 1000;
const retryAttempts = (previous) => ({
  enter: Boolean(previous.resumeUrl) && previous.attempted.enter,
  submit: false,
});
const sameAttempts = (left, right) =>
  ['enter', 'submit'].every((action) => left?.[action] === right?.[action]);
const sameRejection = (saved, expected) =>
  Object.entries(expected).every(([key, value]) =>
    key === 'attempted' ? sameAttempts(saved[key], value) : saved[key] === value
  );

/** Only fresh native generic-error evidence can release a failed reservation. */
export class ApplicationRetries {
  constructor(service, now = Date.now) {
    this.service = service;
    this.now = now;
    this.rejections = new Map();
    this.released = new Set();
  }
  ready(entry) {
    return this.now() >= Date.parse(entry.retryAt);
  }
  waiting(input) {
    const entry = this.service.deferrals.entries.get(applicationKey(input).id);
    return entry?.reason === 'generic-error' && !this.ready(entry);
  }
  async automatic(signal) {
    const service = this.service;
    const record = service.current;
    if (record?.delivery === 'provider-confirmed') {
      this.complete(record.id);
      return;
    }
    if (
      !record ||
      record.state !== 'provider-error' ||
      record.page?.error !== 'generic-error' ||
      record.hold !== 'generic-error' ||
      record.paused ||
      record.options.testMode ||
      !record.guard ||
      (service.deferrals.entries.size >= 1000 &&
        !service.deferrals.entries.has(record.id))
    ) {
      return;
    }
    const version = service.modes.version(record.browserSlot);
    const policy = () => {
      signal.throwIfAborted();
      if (
        service.current !== record ||
        record.paused ||
        service.modes.version(record.browserSlot) !== version
      ) {
        throw fail('mode-changed');
      }
    };
    const capture = () =>
      service.review.check(record, 'submit', signal, true, true);
    await service.deferrals.preserve(
      record,
      { confirm: true },
      signal,
      policy,
      capture
    );
    const rejection = {
      id: `secret:jobs-application-rejection:${globalThis.crypto.randomUUID()}`,
      version: 1,
      applicationId: record.id,
      requestId: record.requestId,
      signature: record.signature,
      draftId: record.draft.id,
      observedAt: new Date(this.now()).toISOString(),
      reason: 'generic-error',
      attempted: { ...record.attempted },
      delivery: record.delivery,
      reservationRevision: record.revision,
    };
    await saveAcknowledgedRecord(service.store, rejection);
    await capture();
    policy();
    const previous = service.deferrals.entries.get(record.id);
    this.rejections.delete(previous?.id);
    this.released.delete(previous?.id);
    const entry = service.deferrals.enqueue(record, 'generic-error', {
      retryAt: new Date(this.now() + applicationRetryMs).toISOString(),
    });
    this.rejections.set(entry.id, globalThis.structuredClone(rejection));
    service.trace({
      event: 'application-generic-error-backed',
      retryMs: applicationRetryMs,
    });
    return service.close();
  }
  async admit(entry, previous, signal) {
    if (!this.ready(entry)) {
      throw fail('retry-wait');
    }
    const rejection = this.rejections.get(entry.id);
    const saved = rejection && (await this.service.store.get(rejection.id));
    if (
      !saved ||
      !sameRejection(saved, rejection) ||
      rejection.applicationId !== previous.id ||
      rejection.requestId !== previous.requestId ||
      rejection.signature !== previous.signature ||
      rejection.draftId !== previous.draft?.id ||
      previous.delivery === 'provider-confirmed' ||
      !sameAttempts(
        this.released.has(entry.id)
          ? retryAttempts({ ...previous, attempted: rejection.attempted })
          : rejection.attempted,
        previous.attempted
      ) ||
      (this.released.has(entry.id) ? 'none' : rejection.delivery) !==
        previous.delivery
    ) {
      throw fail('state');
    }
    signal.throwIfAborted();
    // The immutable rejection receipt preserves the old dispatch history. Only
    // this acknowledged, explicitly reviewed retry may reserve another send.
    await saveApplicationJournal(this.service.store, {
      ...previous,
      attempted: retryAttempts(previous),
      delivery: 'none',
    });
    this.released.add(entry.id);
  }
  release(entry, receipt) {
    const record = this.service.current;
    this.rejections.delete(entry.id);
    this.released.delete(entry.id);
    if (
      entry.reason === 'generic-error' &&
      record?.page.bound &&
      !record.page.error &&
      record.hold === 'generic-error'
    ) {
      this.service.holds.entries.delete(record.id);
      record.hold = null;
      this.service.trace({ event: 'application-generic-retry-reviewed' });
      return applicationView(record);
    }
    return receipt;
  }
  complete(id) {
    const queue = this.service.deferrals;
    const entry = queue.entries.get(id);
    if (entry?.reason === 'generic-error') {
      queue.entries.delete(id);
      queue.revision = globalThis.crypto.randomUUID();
      this.rejections.delete(entry.id);
      this.released.delete(entry.id);
    }
  }
  clear() {
    this.rejections.clear();
    this.released.clear();
  }
}
