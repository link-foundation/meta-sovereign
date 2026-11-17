import { hhSearchUrl, jobsBrowserOptions, jobsFailure } from './options.js';
import { resumeExportRequestId } from './resume-export-options.js';
import { validateVacancySearch } from './search-result.js';
import {
  salaryLadderSettings,
  salaryLadderStart,
  salaryTierSearch,
  salaryTierFloor,
  assessVacancySalary,
} from './salary-ladder.js';
import {
  vacancySelectionOptions,
  vacancySelectionResult,
} from './vacancy-selection.js';

export const discoveryFailure = () =>
  jobsFailure('discovery-unconfirmed', 'Vacancy discovery was not confirmed.');
const fail = () => {
  throw discoveryFailure();
};
const integer = (value, max) =>
  Number.isInteger(value) && value >= 0 && value <= max;
export const discoveryKey = (input) => {
  const { browserSlot } = jobsBrowserOptions(input);
  const requestId = resumeExportRequestId(input.requestId);
  return {
    browserSlot,
    requestId,
    id: `secret:jobs-discovery:${browserSlot}:${requestId}`,
  };
};
export const discoveryOptions = (input) => {
  const key = discoveryKey(input);
  const search = frozenSearch(input.search ?? input);
  const maxPages = input.maxPages ?? 10;
  const maxVacancies = input.maxVacancies ?? 100;
  const durationMs = input.durationMs ?? 900000;
  const filters = discoveryFilters(input);
  validateBounds({
    maxPages,
    maxVacancies,
    durationMs,
    refresh: input.refresh,
  });
  return {
    ...key,
    ...jobsBrowserOptions(input),
    search,
    filters,
    maxPages,
    maxVacancies,
    durationMs,
    refresh: input.refresh === true,
    ...salaryLadderSettings(input),
  };
};
const frozenSearch = (input) => {
  const url = new URL(hhSearchUrl(input));
  const search = {
    query: url.searchParams.get('text') ?? '',
    resume: url.searchParams.get('resume') ?? '',
    area: url.searchParams.get('area') ?? '',
    currency: url.searchParams.get('currency'),
    order: url.searchParams.get('order_by'),
    page: Number(url.searchParams.get('page')),
    remote: url.searchParams.get('work_format') === 'REMOTE',
    ...(url.searchParams.has('salary')
      ? { salary: Number(url.searchParams.get('salary')) }
      : {}),
  };
  return search;
};
const validateBounds = ({ maxPages, maxVacancies, durationMs, refresh }) => {
  if (
    !integer(maxPages, 100) ||
    maxPages < 1 ||
    !integer(maxVacancies, 1000) ||
    maxVacancies < 1 ||
    !integer(durationMs, 86400000) ||
    durationMs < 1000 ||
    (refresh !== undefined && typeof refresh !== 'boolean')
  ) {
    fail();
  }
};
const discoveryFilters = (input) => {
  if (
    input.filters !== undefined &&
    (!input.filters || !Array.isArray(input.filters.excludeText))
  ) {
    fail();
  }
  return vacancySelectionOptions(
    input.filters
      ? {
          skipResponded: input.filters.skipResponded,
          excludeText: input.filters.excludeText.join('\n'),
        }
      : input
  );
};
const date = (value) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const entryPay = (raw, options) => {
  const pay = raw?.pay;
  if (
    pay !== undefined &&
    (!pay ||
      !salaryLadderStart(options) ||
      !integer(pay.tier, 100) ||
      JSON.stringify(pay) !==
        JSON.stringify({
          tier: pay.tier,
          ...assessVacancySalary(
            raw.card?.salary,
            options.salaryConfig,
            salaryTierFloor(options, pay.tier)
          ),
        }))
  ) {
    fail();
  }
  if (salaryLadderStart(options) && pay === undefined) {
    fail();
  }
  return pay;
};
export const discoveryEntry = (raw, options) => {
  const pay = entryPay(raw, options);
  const result = validateVacancySearch(
    { url: hhSearchUrl(options.search), cards: [raw?.card], next: null },
    hhSearchUrl(options.search)
  );
  const selection = vacancySelectionResult(
    {
      version: 1,
      browserSlot: options.browserSlot,
      filters: options.filters,
      choiceRevision: raw.choiceRevision,
      decisions: [raw.decision],
    },
    result,
    {
      browserSlot: options.browserSlot,
      skipResponded: options.filters.skipResponded,
      excludeText: options.filters.excludeText.join('\n'),
    }
  );
  if (raw.capturedAt !== null && !date(raw.capturedAt)) {
    fail();
  }
  if (
    raw.decision.reason === 'review' &&
    raw.capturedAt === null &&
    (!pay || pay.action === 'apply')
  ) {
    fail();
  }
  return {
    card: result.cards[0],
    decision: selection.decisions[0],
    choiceRevision: raw.choiceRevision,
    capturedAt: raw.capturedAt,
    ...(pay ? { pay } : {}),
  };
};
const validateProgress = (raw, options) => {
  const ladder = salaryLadderStart(options);
  if (
    ladder
      ? !integer(raw.salaryTier, Math.min(raw.pages, 100))
      : raw.salaryTier !== undefined
  ) {
    fail();
  }
  if (
    ![
      'running',
      'completed',
      'stopped',
      'expired',
      'failed',
      'interrupted',
    ].includes(raw.phase) ||
    ![null, 'exhausted', 'page-limit', 'vacancy-limit'].includes(raw.reason) ||
    !integer(raw.pages, options.maxPages) ||
    !integer(raw.duplicates, 10000) ||
    (raw.nextPage !== null &&
      (!integer(raw.nextPage, 999) ||
        raw.nextPage < salaryTierSearch(options, raw.salaryTier).page))
  ) {
    fail();
  }
  validateLifetime(raw, options);
};
const validateLifetime = (raw, options) => {
  if (
    !date(raw.startedAt) ||
    !date(raw.expiresAt) ||
    Date.parse(raw.expiresAt) - Date.parse(raw.startedAt) !==
      options.durationMs ||
    (raw.phase === 'completed' && raw.reason === null) ||
    (raw.code !== null &&
      (typeof raw.code !== 'string' || !/^[a-z\d-]{1,120}$/u.test(raw.code)))
  ) {
    fail();
  }
};
export const discoveryRecord = (raw, key) => {
  const options = discoveryOptions(raw?.options ?? {});
  if (
    !raw ||
    raw.version !== 1 ||
    raw.id !== key.id ||
    options.id !== key.id ||
    raw.signature !== JSON.stringify(options) ||
    !Array.isArray(raw.entries) ||
    raw.entries.length > options.maxVacancies
  ) {
    fail();
  }
  validateProgress(raw, options);
  const entries = raw.entries.map((entry) => discoveryEntry(entry, options));
  if (entries.some((entry) => entry.pay && entry.pay.tier > raw.salaryTier)) {
    fail();
  }
  if (new Set(entries.map((entry) => entry.card.url)).size !== entries.length) {
    fail();
  }
  return { ...raw, options, entries };
};
export const discoveryView = (record, active) => ({
  ok: true,
  mode: 'hh-vacancy-discovery',
  discovery: record
    ? {
        ...record,
        phase:
          record.phase === 'running' && !active ? 'interrupted' : record.phase,
      }
    : null,
});
export const discoveryResult = (raw, input, expected) => {
  if (raw?.ok !== true || raw.mode !== 'hh-vacancy-discovery') {
    fail();
  }
  if (raw.discovery === null) {
    if (expected) {
      fail();
    }
    return { ok: true, mode: 'hh-vacancy-discovery', discovery: null };
  }
  const key = discoveryKey(raw.discovery.options);
  if (
    (input.requestId !== undefined && key.requestId !== input.requestId) ||
    key.browserSlot !== (input.browserSlot ?? 'jobs')
  ) {
    fail();
  }
  const record = discoveryRecord(raw.discovery, key);
  if (expected && record.signature !== JSON.stringify(expected)) {
    fail();
  }
  return { ok: true, mode: 'hh-vacancy-discovery', discovery: record };
};
