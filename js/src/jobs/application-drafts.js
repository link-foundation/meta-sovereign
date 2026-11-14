import {
  reviewSnapshotKey,
  writableReviewField,
} from '../forms/review-targets.js';
import { nativeApplicationFields } from './application-review.js';
import {
  applicationFailure as fail,
  applicationView,
} from './application-options.js';
import {
  applicationDraft,
  draftFailure,
  draftFieldKey,
  draftProposal,
} from './application-draft-data.js';

const completeReport = (report) =>
  report &&
  report.coverage === 'inspected' &&
  !report.challenge?.active &&
  !report.omissions?.length &&
  !report.navigation?.nextPage &&
  !report.navigation?.limited &&
  report.frames.length === 1 &&
  report.fields.every((field) => field.frame === 'frame-1');

const completeRadio = (field, fields) => {
  const peers = fields.filter(
    (peer) =>
      peer.type === 'radio' && peer.radioGroup?.id === field.radioGroup?.id
  );
  return (
    field.tag === 'input' &&
    field.radioGroup?.complete &&
    peers.length === field.radioGroup.size &&
    peers.filter((peer) => peer.checked).length <= 1
  );
};
const supportedField = (raw, fields) => {
  const field = { ...raw, answer: { proposal: draftProposal(raw) } };
  // Radio identity and completeness are independent of its saved selection.
  const supported =
    field.type === 'radio'
      ? completeRadio(field, fields)
      : writableReviewField(field);
  return (
    supported &&
    ['input', 'textarea', 'select'].includes(field.tag) &&
    !field.disabled &&
    !field.readOnly &&
    !field.indeterminate &&
    !field.multiple &&
    !field.valueOmitted &&
    typeof field.value === 'string' &&
    Boolean(field.label)
  );
};
export const nativeDraftFields = (record) => {
  const report = record.reviewPlan?.inspection;
  const page = record.page;
  if (
    !completeReport(report) ||
    !page.scope ||
    !page.bound ||
    page.ambiguousLetter ||
    !record.vacancy
  ) {
    throw draftFailure();
  }
  const fields = nativeApplicationFields(report, page);
  if (
    !fields.length ||
    fields.length > 25 ||
    fields.length !== page.fieldIndices.length ||
    !fields.every((field) => supportedField(field, fields))
  ) {
    throw draftFailure();
  }
  return fields;
};
const restoration = (state, result) => ({
  state,
  ...Object.fromEntries(
    ['applied', 'unchanged', 'uncertain'].map((status) => [
      status,
      result?.receipts.filter((receipt) => receipt.status === status).length ??
        0,
    ])
  ),
  code: result?.code ?? null,
});

export class ApplicationDrafts {
  constructor(service) {
    this.service = service;
  }
  async admit(record, input, signal, restoring = false) {
    if (input.confirm !== true) {
      throw fail('confirmation');
    }
    if (
      !['review', ...(restoring ? [] : ['paused', 'deferred'])].includes(
        record.state
      ) ||
      record.attempted.submit ||
      record.delivery === 'provider-confirmed'
    ) {
      throw fail('state');
    }
    await this.service.review.check(record, 'submit', signal, !restoring);
  }
  async backup(
    record,
    input,
    signal,
    check = () => this.admit(record, input, signal),
    limit = null
  ) {
    await check();
    const fields = nativeDraftFields(record);
    const next = applicationDraft({
      version: 1,
      id: globalThis.crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
      ...(limit ? { limit } : {}),
      fields: fields.map((field) => ({
        key: draftFieldKey(field),
        label: field.label,
        type: field.type,
        value: field.value,
        checked: field.checked,
      })),
    });
    await check();
    record.draft = next;
    record.restoration = null;
    await this.service.save(record);
    this.service.trace({
      event: 'application-draft-saved',
      fields: fields.length,
    });
    return applicationView(record);
  }
  async restore(record, input, signal) {
    await this.admit(record, input, signal, true);
    if (record.options.testMode) {
      return { ...applicationView(record), state: 'test-preview' };
    }
    const draft = applicationDraft(record.draft);
    const fields = nativeDraftFields(record);
    if (
      !draft ||
      fields.length !== draft.fields.length ||
      fields.some(
        (field, index) => draftFieldKey(field) !== draft.fields[index].key
      )
    ) {
      throw draftFailure();
    }
    const proposed = fields.map((field, index) => ({
      ...field,
      answer: { proposal: draftProposal(draft.fields[index]) },
    }));
    const pageKey = (page) =>
      JSON.stringify({
        ...page,
        scopeKey: null,
        letter: page.letter && { ...page.letter, value: null },
      });
    const expected = pageKey(record.page);
    const guard = async () => {
      signal.throwIfAborted();
      const page = await this.service.readPage(record.browser, record.url);
      if (
        pageKey(page) !== expected ||
        !page.bound ||
        !page.scope ||
        typeof page.scopeStructureKey !== 'string' ||
        !page.scopeStructureKey ||
        page.challenge ||
        page.dailyLimit ||
        page.external ||
        page.delivered ||
        !page.submit ||
        page.submit.disabled
      ) {
        throw fail('changed');
      }
    };
    record.restoration = restoration('restoring');
    await this.service.save(record);
    // A store acknowledgement may have waited for another writer; compare the
    // actual form again after it and before binding any proposed draft values.
    const previous = record.lastApplication;
    let result;
    try {
      if (
        reviewSnapshotKey(record.reviewPlan.inspection) !== record.guard.report
      ) {
        throw fail('changed');
      }
      result = await this.service.filling.restore(
        record,
        proposed,
        () => signal.throwIfAborted(),
        guard
      );
    } catch (error) {
      const attempted =
        record.lastApplication !== previous && record.lastApplication;
      record.restoration = restoration(
        attempted ? 'uncertain' : 'refused',
        attempted || undefined
      );
      record.restoration.code = error.code ?? 'form-write-uncertain';
      await this.service.save(record);
      throw error;
    }
    record.restoration = restoration(
      result.ok ? 'restored' : result.state,
      result
    );
    await this.service.review.inspect(record, signal);
    this.service.trace({
      event: 'application-draft-restored',
      state: record.restoration.state,
      applied: record.restoration.applied,
      uncertain: record.restoration.uncertain,
    });
    return applicationView(record);
  }
}
