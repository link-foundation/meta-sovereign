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
export const assertVacancyNotSkipped = async (store, options) => {
  if (
    (await storedVacancySkips(store, options)).entries.some(
      (row) => row.url === options.url
    )
  ) {
    throw jobsFailure(
      'application-skipped',
      'Clear the recorded native refusal before opening this vacancy again.'
    );
  }
};
const nativeSkipReason = (page) =>
  page.external
    ? 'external_site'
    : page.resumeNotVisible
      ? 'resume_not_visible'
      : page.vacancyUnavailable
        ? 'vacancy_unavailable'
        : null;
const observedEntry = (record, previous, reason, now) =>
  vacancySkipEntry({
    url: record.url,
    reason,
    title: record.vacancy?.title || previous?.title || '',
    externalUrl: record.page.externalUrl ?? previous?.externalUrl ?? null,
    time: new Date(now()).toISOString(),
    attempts: (previous?.attempts ?? 0) + 1,
    requestId: record.requestId,
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

/** Run inside the existing application writer; reads never synthesize refusals. */
export const observeVacancySkip = async (store, record, now = Date.now) => {
  const page = record.page;
  if (!page?.bound || page.challenge || page.dailyLimit) {
    return;
  }
  const delivered = record.delivery === 'provider-confirmed' && page.delivered;
  const reason = nativeSkipReason(page);
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
  if (previous?.requestId === record.requestId && previous.reason === reason) {
    return refreshMetadata(store, before, previous, record);
  }
  const entry = observedEntry(record, previous, reason, now);
  return save(store, before, [
    entry,
    ...before.entries.filter((row) => row.url !== record.url),
  ]);
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
