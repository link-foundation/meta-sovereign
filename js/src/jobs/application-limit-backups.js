import { applicationView } from './application-options.js';
import { applicationPreservationPolicy } from './application-run-modes.js';
import { reviewSnapshotKey } from '../forms/review-targets.js';

const eligible = (record) =>
  record?.page?.bound &&
  record.page.scope &&
  record.vacancy &&
  record.guard &&
  record.report &&
  !(
    record.page.challenge ||
    record.page.external ||
    record.page.delivered ||
    record.paused ||
    record.options.testMode
  ) &&
  (record.applicationLimit?.active || record.page.dailyLimit);
const pendingRestoration = (record) =>
  record.draft?.limit &&
  record.draft.limit.documentKey !== record.page.documentKey &&
  record.restoration?.state !== 'restored';

/** Preserve actual native values during the pause without closing or dispatching. */
export class ApplicationLimitBackups {
  constructor(service) {
    this.service = service;
  }
  async automatic(signal) {
    const service = this.service;
    const record = service.current;
    if (!eligible(record) || pendingRestoration(record)) {
      return;
    }
    const fingerprint = JSON.stringify([
      record.applicationLimit?.until,
      record.page.documentKey,
      reviewSnapshotKey(record.reviewPlan.inspection),
    ]);
    if (
      record.limitBackup?.fingerprint === fingerprint &&
      record.limitBackup.draftId === record.draft?.id
    ) {
      return;
    }
    const policy = applicationPreservationPolicy(service, record, signal);
    const capture = () =>
      service.review.check(record, 'submit', signal, true, 'daily-limit');
    await service.deferrals.preserve(
      record,
      { confirm: true },
      signal,
      policy,
      capture,
      {
        documentKey: record.page.documentKey,
        until: record.applicationLimit.until,
      }
    );
    record.limitBackup = { fingerprint, draftId: record.draft.id };
    service.trace({
      event: 'application-limit-draft-saved',
      fields: record.draft.fields.length,
    });
    return applicationView(record);
  }
}
