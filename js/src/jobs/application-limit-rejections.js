import { createHash } from 'node:crypto';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import {
  applicationFailure as fail,
  applicationView,
} from './application-options.js';
import {
  applicationLimitRejection,
  readLimitRejection,
  sameLimitAttempts,
} from './application-limit-rejection-data.js';

const digest = (proof) =>
  createHash('sha256').update(JSON.stringify(proof)).digest('hex');
const sameReservation = (proof, record) =>
  proof.applicationId === record.id &&
  proof.requestId === record.requestId &&
  proof.signature === record.signature &&
  sameLimitAttempts(proof.attempted, record.attempted) &&
  proof.delivery === record.delivery;
const backed = (record, documentKey, until) =>
  record.draft?.limit?.documentKey === documentKey &&
  record.draft.limit.until === until;
const failedForm = (record) =>
  record.state === 'daily-limit' &&
  record.page.bound &&
  record.page.scope &&
  record.page.submit &&
  record.page.dailyLimit &&
  !record.page.challenge &&
  !record.page.external &&
  !record.page.resumeNotVisible &&
  !record.page.vacancyUnavailable &&
  !record.page.delivered &&
  !record.paused &&
  !record.options.testMode &&
  record.applicationLimit?.active &&
  record.applicationLimit.saved;

/** A native refusal witnessed after a confirmed dispatch is distinct from unknown delivery. */
export class ApplicationLimitRejections {
  constructor(service, now) {
    Object.assign(this, { service, now });
    this.witnesses = new WeakMap();
  }
  issued(record, action) {
    this.witnesses.set(record, {
      applicationId: record.id,
      requestId: record.requestId,
      signature: record.signature,
      documentKey: record.page.documentKey,
      reservationRevision: record.revision,
      action,
      attempted: { ...record.attempted },
      delivery: record.delivery,
    });
  }
  async observe(signal) {
    const { service } = this;
    const record = service.current;
    const witness = record && this.witnesses.get(record);
    if (!witness) {
      return;
    }
    if (
      record.page.documentKey !== witness.documentKey ||
      !sameReservation(witness, record) ||
      !record.page.dailyLimit
    ) {
      this.witnesses.delete(record);
      return;
    }
    const until = record.applicationLimit?.until;
    if (!failedForm(record) || !backed(record, witness.documentKey, until)) {
      return;
    }
    const check = async () => {
      signal.throwIfAborted();
      await service.review.check(record, 'submit', signal, true, 'daily-limit');
    };
    await check();
    const proof = readLimitRejection({
      ...witness,
      id: `secret:jobs-application-rejection:${globalThis.crypto.randomUUID()}`,
      version: 1,
      reason: 'daily-limit',
      observedAt: new Date(this.now()).toISOString(),
      until,
      draftId: record.draft.id,
    });
    await saveAcknowledgedRecord(service.store, proof);
    await check();
    record.limitRejection = {
      id: proof.id,
      state: 'recorded',
      digest: digest(proof),
    };
    await service.save(record);
    this.witnesses.delete(record);
    service.trace({
      event: 'application-limit-rejection-saved',
      action: proof.action,
    });
    return applicationView(record);
  }
  async proof(record) {
    const pointer = applicationLimitRejection(record.limitRejection);
    if (pointer?.state !== 'recorded') {
      throw fail('state');
    }
    const proof = readLimitRejection(await this.service.store.get(pointer.id));
    const journal = await this.service.store.get(record.id);
    if (
      digest(proof) !== pointer.digest ||
      !sameReservation(proof, record) ||
      !sameReservation(proof, journal ?? {}) ||
      journal.revision !== record.revision ||
      journal.limitRejection?.id !== pointer.id ||
      journal.limitRejection.digest !== pointer.digest ||
      journal.limitRejection.state !== 'recorded' ||
      !backed(record, proof.documentKey, proof.until)
    ) {
      throw fail('limit-rejection');
    }
    return proof;
  }
  async consent(record) {
    if (!record.attempted.submit && record.delivery === 'none') {
      return null;
    }
    return (await this.proof(record)).id;
  }
  async restoreConsent(record, input, signal, policy) {
    if (input.confirm === true && record.limitRejection?.state === 'recorded') {
      await this.release(record, record.limitRejection.id, signal, policy);
    }
  }
  async release(record, id, signal, policy = () => signal.throwIfAborted()) {
    if (!id) {
      return;
    }
    const proof = await this.proof(record);
    await this.service.limits.admit(record);
    policy();
    if (
      proof.id !== id ||
      this.now() < Date.parse(proof.until) ||
      record.page.documentKey === proof.documentKey ||
      record.state !== 'review' ||
      record.page.challenge ||
      record.page.dailyLimit ||
      record.page.error ||
      [
        record.page.external,
        record.page.resumeNotVisible,
        record.page.vacancyUnavailable,
      ].some(Boolean) ||
      record.page.delivered ||
      !record.page.bound ||
      !record.page.scope ||
      !record.page.submit
    ) {
      throw fail('state');
    }
    record.attempted = { ...record.attempted, submit: false };
    record.delivery = 'none';
    record.limitRejection = { ...record.limitRejection, state: 'released' };
    await this.service.save(record);
    this.service.trace({ event: 'application-limit-rejection-released' });
  }
}
