import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { acknowledgedRead, acknowledgedWrite } from './acknowledged-store.js';
import { vacancyChoiceSlot } from './vacancy-choice.js';
import { jobsFailure } from './options.js';
import {
  vacancySkipId,
  vacancySkipResult,
  vacancySkipEntry,
  vacancySkipClearInput,
  vacancySkipFailure,
} from './vacancy-skip-data.js';
import {
  vacancySkipBlocks,
  transientVacancySkip,
  disabledVacancyControl,
} from './vacancy-skip-policy.js';

export const storedVacancySkips = async (store, input = {}) => {
  const browserSlot = vacancyChoiceSlot(input);
  return vacancySkipResult(
    (await store.get(vacancySkipId(browserSlot))) ?? {
      version: 1,
      browserSlot,
      revision: 'empty',
      entries: [],
    },
    { browserSlot }
  );
};
const save = async (store, before, entries) => {
  const next = vacancySkipResult(
    { ...before, entries, revision: globalThis.crypto.randomUUID() },
    before
  );
  await saveAcknowledgedRecord(store, {
    id: vacancySkipId(before.browserSlot),
    ...next,
  });
  return next;
};
export const assertVacancyNotSkipped = async (store, options, context) => {
  if (
    (await storedVacancySkips(store, options)).entries.some(
      (row) => row.url === options.url && vacancySkipBlocks(row, context)
    )
  ) {
    throw jobsFailure(
      'application-skipped',
      'Clear the recorded native refusal before opening this vacancy again.'
    );
  }
};
const nativeSkipReason = (record) => {
  const page = record.page;
  return page.external
    ? 'external_site'
    : page.resumeNotVisible
      ? 'resume_not_visible'
      : page.vacancyUnavailable
        ? 'vacancy_unavailable'
        : disabledVacancyControl(record);
};
const observedEntry = (record, previous, reason, now, context) =>
  vacancySkipEntry({
    url: record.url,
    reason,
    title: record.vacancy?.title || previous?.title || '',
    externalUrl: record.page.externalUrl ?? previous?.externalUrl ?? null,
    time: new Date(now()).toISOString(),
    attempts:
      transientVacancySkip({ reason }) &&
      previous?.runId === context.runId &&
      transientVacancySkip(previous)
        ? previous.attempts
        : (previous?.attempts ?? 0) + 1,
    requestId: record.requestId,
    ...(transientVacancySkip({ reason }) ? { runId: context.runId } : {}),
  });
const refreshMetadata = async (store, before, previous, record) => {
  const entry = vacancySkipEntry({
    ...previous,
    title: record.vacancy?.title || previous.title,
    externalUrl: record.page.externalUrl ?? previous.externalUrl,
  });
  return entry.title === previous.title &&
    entry.externalUrl === previous.externalUrl
    ? before
    : save(
        store,
        before,
        before.entries.map((row) => (row.url === record.url ? entry : row))
      );
};

const canObserveSkip = (record) =>
  record.options?.testMode !== true &&
  record.page?.bound &&
  !record.page.challenge &&
  !record.page.dailyLimit;

const observedReason = (record, context) => {
  if (!context.clickRefusal) {
    return nativeSkipReason(record);
  }
  if (
    !['apply_click_failed', 'click_failed'].includes(context.clickRefusal) ||
    record.delivery !== 'none' ||
    record.attempted?.submit
  ) {
    throw vacancySkipFailure('state');
  }
  return context.clickRefusal;
};
const sameObservation = (previous, record, reason, context) =>
  previous?.requestId === record.requestId &&
  previous.reason === reason &&
  (!transientVacancySkip(previous) || previous.runId === context.runId);

/** Run inside the existing application writer; reads never synthesize refusals. */
export const observeVacancySkip = async (
  store,
  record,
  now = Date.now,
  context = {}
) => {
  const page = record.page;
  if (!canObserveSkip(record)) {
    return;
  }
  const delivered = record.delivery === 'provider-confirmed' && page.delivered;
  const reason = observedReason(record, context);
  if (!delivered && !reason) {
    return;
  }
  const before = await storedVacancySkips(store, record);
  const previous = before.entries.find((row) => row.url === record.url);
  if (delivered) {
    if (previous) {
      return save(
        store,
        before,
        before.entries.filter((row) => row.url !== record.url)
      );
    }
    return;
  }
  if (sameObservation(previous, record, reason, context)) {
    return refreshMetadata(store, before, previous, record);
  }
  const entry = observedEntry(record, previous, reason, now, context);
  const saved = await save(store, before, [
    entry,
    ...before.entries.filter((row) => row.url !== record.url),
  ]);
  context.trace?.({
    event: 'application-vacancy-skip-observed',
    reason,
    attempts: entry.attempts,
  });
  return saved;
};

export const createVacancySkipService = ({ store, run }) => ({
  'skips-stored': (input) =>
    acknowledgedRead(store, () => storedVacancySkips(store, input)),
  'skip-clear': (input) => {
    const options = vacancySkipClearInput(input);
    return acknowledgedWrite(store, run, async (signal) => {
      const before = await storedVacancySkips(store, options);
      if (before.revision !== options.revision) {
        throw vacancySkipFailure('conflict');
      }
      signal.throwIfAborted();
      return save(
        store,
        before,
        before.entries.filter((row) =>
          options.url ? row.url !== options.url : row.reason !== options.reason
        )
      );
    });
  },
});
