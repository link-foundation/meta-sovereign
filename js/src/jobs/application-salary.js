import { assessVacancySalary } from './salary-ladder.js';
import { salaryExchangeFresh } from '../automation/salary-exchange-state.js';
import { jobsFailure } from './options.js';
import { applicationPreservationPolicy } from './application-run-modes.js';

const fail = (kind) =>
  jobsFailure(
    `application-salary-${kind}`,
    'Review the vacancy salary policy before continuing this application.'
  );

const canPreserveSalary = (record) =>
  ['ready', 'review', 'deferred'].includes(record.state) &&
  !record.hold &&
  !record.paused &&
  !record.options.testMode &&
  !record.attempted.submit &&
  record.delivery === 'none';

// A finite batch may lower its runtime floor without rewriting frozen journals.
// A reopened worker has no override and returns to the acknowledged base policy.
export const applicationSalaryOptions = (record) =>
  record.salaryTierFloorRub === undefined
    ? record.options
    : { ...record.options, salaryFloorRub: record.salaryTierFloorRub };

/** Omitted controls preserve acknowledged legacy signatures. */
export const applicationSalarySettings = (input) => {
  if (
    (input.salaryLadder !== undefined &&
      typeof input.salaryLadder !== 'boolean') ||
    (input.salaryFloorRub !== undefined &&
      (!Number.isFinite(input.salaryFloorRub) ||
        input.salaryFloorRub < 0 ||
        input.salaryFloorRub > 1000000000))
  ) {
    throw fail('input');
  }
  return Object.fromEntries(
    ['salaryLadder', 'salaryFloorRub']
      .filter((key) => input[key] !== undefined)
      .map((key) => [key, input[key]])
  );
};

/** Derive the receipt from frozen targets and the full vacancy, never a UI claim. */
export const applicationSalaryDecision = (
  options,
  vacancy,
  now = Date.now()
) => {
  if (options.salaryLadder === false || !options.salary?.enabled) {
    return null;
  }
  const floorRub =
    options.salaryFloorRub ??
    options.salary.currencies.find((row) => row.code === 'RUB')?.net ??
    null;
  return {
    floorRub,
    ...(options.salary.exchange &&
    !salaryExchangeFresh(options.salary.exchange, now)
      ? { action: 'hold', reason: 'rates-stale' }
      : vacancy
        ? assessVacancySalary(vacancy.salary, options.salary, floorRub)
        : { action: 'hold', reason: 'missing-vacancy-context' }),
  };
};

export class ApplicationSalary {
  constructor(service, now = Date.now) {
    this.service = service;
    this.now = now;
    this.deferred = new Map();
  }
  decision(record) {
    const decision = applicationSalaryDecision(
      applicationSalaryOptions(record),
      record.vacancy,
      this.now()
    );
    if (!decision || decision.action === 'apply') {
      this.deferred.delete(record.id);
    }
    return decision;
  }
  admit(record) {
    const decision = this.decision(record);
    if (!decision) {
      return;
    }
    const exchange = record.options.salary.exchange;
    if (exchange && !salaryExchangeFresh(exchange, this.now())) {
      throw fail('rates-stale');
    }
    if (decision.action !== 'apply') {
      this.service.trace({ event: 'application-salary-held', ...decision });
      throw fail(decision.action);
    }
  }
  async refresh(record, signal) {
    if (
      !record.vacancy ||
      !record.options.salary?.enabled ||
      record.options.salaryLadder === false
    ) {
      return;
    }
    const before = JSON.stringify(record.vacancy);
    await (record.page.scope
      ? this.service.review.cachedVacancy(record, signal)
      : this.service.review.vacancy(record, signal));
    if (before !== JSON.stringify(record.vacancy)) {
      record.guard = null;
      throw fail('context-changed');
    }
  }
  async preserve(record, signal) {
    if (!canPreserveSalary(record)) {
      return false;
    }
    const decision = this.decision(record);
    if (
      !decision ||
      decision.action === 'apply' ||
      decision.action === 'hold'
    ) {
      return false;
    }
    const policy = applicationPreservationPolicy(this.service, record, signal);
    await this.service.review.check(
      record,
      record.page.scope ? 'submit' : 'enter',
      signal,
      true
    );
    policy();
    if (record.page.scope && record.page.fieldIndices.length) {
      await this.service.deferrals.preserve(
        record,
        { confirm: true },
        signal,
        policy
      );
    }
    policy();
    if (decision.action === 'defer') {
      if (this.deferred.size >= 1000 && !this.deferred.has(record.id)) {
        throw fail('queue');
      }
      this.deferred.set(record.id, { url: record.url, ...decision });
    } else {
      this.deferred.delete(record.id);
    }
    this.service.trace({ event: 'application-salary-preserved', ...decision });
    return true;
  }
  async automatic(signal) {
    const record = this.service.current;
    if (record?.state === 'deferred' && (await this.preserve(record, signal))) {
      return this.service.close();
    }
  }
}
