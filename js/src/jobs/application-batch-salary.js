import { applicationSalaryDecision } from './application-salary.js';
import { applicationKey } from './application-options.js';

export const batchSalaryFloor = (review) =>
  applicationSalaryDecision(review, null)?.floorRub ?? null;
export const batchSalaryProgress = (record) =>
  record.salaryTier === undefined
    ? {}
    : {
        salaryTier: record.salaryTier,
        salaryFloorRub: record.salaryFloorRub,
        salaryDeferred: record.salaryDeferred,
      };
export const validBatchSalary = (record, review, total) => {
  if (record.salaryTier === undefined) {
    return (
      record.salaryFloorRub === undefined && record.salaryDeferred === undefined
    );
  }
  const initial = batchSalaryFloor(review);
  return (
    initial !== null &&
    Number.isInteger(record.salaryTier) &&
    record.salaryTier >= 0 &&
    record.salaryTier <= Math.ceil(initial / 50000) &&
    record.salaryFloorRub ===
      Math.max(0, initial - record.salaryTier * 50000) &&
    Number.isInteger(record.salaryDeferred) &&
    record.salaryDeferred >= 0 &&
    record.salaryDeferred <= total
  );
};

/** Only this explicit finite worker owns revisits; snapshots never recreate them. */
export class ApplicationBatchSalary {
  constructor(batch) {
    this.batch = batch;
    this.service = batch.service;
  }
  floor(options) {
    const record = this.batch.runtime?.record;
    if (
      !record ||
      record.salaryTier === undefined ||
      record.currentUrl !== options.url
    ) {
      return undefined;
    }
    const { id: _id, url: _url, ...review } = options;
    return JSON.stringify(review) === JSON.stringify(record.options.review)
      ? record.salaryFloorRub
      : undefined;
  }
  due(runtime) {
    return [...runtime.salaryPending.entries()].find(
      ([, floor]) => floor > runtime.record.salaryFloorRub
    )?.[0];
  }
  async advance(runtime) {
    if (!runtime.salaryPending.size || runtime.record.salaryFloorRub <= 0) {
      return false;
    }
    await this.batch.save(runtime, {
      salaryTier: runtime.record.salaryTier + 1,
      salaryFloorRub: Math.max(0, runtime.record.salaryFloorRub - 50000),
      phase: 'starting',
      currentUrl: null,
      nextAt: null,
    });
    this.service.trace({
      event: 'application-salary-tier',
      ...batchSalaryProgress(runtime.record),
    });
    return true;
  }
  async remove(runtime, url) {
    if (runtime.salaryPending.delete(url)) {
      this.forget(runtime, url);
      await this.batch.save(runtime, {
        salaryDeferred: runtime.salaryPending.size,
      });
    }
  }
  forget(runtime, url) {
    this.service.salary.deferred.delete(
      applicationKey({ ...runtime.record.options, url }).id
    );
  }
  clear(runtime) {
    for (const url of runtime.salaryPending.keys()) {
      this.forget(runtime, url);
    }
    runtime.salaryPending.clear();
  }
  async preserve(runtime, record, signal) {
    if (!(await this.service.salary.preserve(record, signal))) {
      return false;
    }
    const decision = this.service.salary.decision(record);
    const skipped = [...runtime.record.skipped];
    if (decision.action === 'defer') {
      runtime.salaryPending.set(record.url, decision.floorRub);
    } else {
      runtime.salaryPending.delete(record.url);
      if (!skipped.includes(record.url)) {
        skipped.push(record.url);
      }
    }
    await this.batch.save(runtime, {
      skipped,
      ...(runtime.record.salaryTier === undefined
        ? {}
        : { salaryDeferred: runtime.salaryPending.size }),
    });
    signal.throwIfAborted();
    await this.service.close();
    return true;
  }
}
