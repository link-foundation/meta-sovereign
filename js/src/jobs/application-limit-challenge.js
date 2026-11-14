import { readFormDocument } from '../forms/read-document.js';
import { applicationLimitDocument } from './application-limit-document.js';
import { applicationSelectors } from './application-page.js';
import {
  applicationFailure as fail,
  applicationView,
} from './application-options.js';
import { applicationPreservationPolicy } from './application-run-modes.js';

const eligible = (record) =>
  record?.page?.challenge &&
  record.page.bound &&
  record.vacancy &&
  record.guard &&
  record.applicationLimit?.active &&
  record.applicationLimit.saved &&
  !record.page.external &&
  !record.page.delivered &&
  !record.paused &&
  !record.options.testMode;

const captureReport = (raw) => {
  if (
    raw.scope !== 'hh-limit-application-form' ||
    raw.reasons.length ||
    raw.navigation.nextPage ||
    raw.navigation.limited
  ) {
    throw fail('changed');
  }
  const { fields, documentKey: _documentKey, ...frame } = raw;
  return {
    url: raw.url,
    title: raw.title,
    coverage: 'inspected',
    omissions: [],
    navigation: raw.navigation,
    frames: [
      { id: 'frame-1', parent: null, ...frame, fieldCount: fields.length },
    ],
    fields: fields.map((field) => ({
      ...field,
      id: `frame-1:${field.id}`,
      frame: 'frame-1',
    })),
  };
};
const closeTarget = async (page, input) => {
  const handles = await page.$$('button[type="button"]');
  let chosen;
  let returned = false;
  try {
    if (handles.length > 200) {
      return null;
    }
    for (const handle of handles) {
      const result = await handle.evaluate(applicationLimitDocument, {
        ...input,
        action: 'candidate',
      });
      if (result?.candidate) {
        if (chosen) {
          return null;
        }
        chosen = handle;
      }
    }
    returned = true;
    return chosen ?? null;
  } finally {
    for (const handle of handles) {
      if (!returned || handle !== chosen) {
        await handle.dispose();
      }
    }
  }
};

/** Capture only the disjoint application form; acknowledge it before native close. */
export const preserveApplicationLimitChallenge = async (
  service,
  record,
  signal
) => {
  if (!eligible(record)) {
    return;
  }
  const policy = applicationPreservationPolicy(service, record, signal);
  const input = {
    url: record.url,
    documentKey: record.page.documentKey,
    submit: applicationSelectors.submit,
    until: record.applicationLimit.until,
    knownLimit: record.draft?.limit,
  };
  const read = () =>
    record.browser.commander.evaluate({
      fn: applicationLimitDocument,
      args: [null, input],
    });
  const first = await read();
  policy();
  if (typeof first?.guard !== 'string') {
    return;
  }
  const check = async () => {
    policy();
    const pause = await service.limits.read();
    policy();
    if (
      !pause?.active ||
      !pause.saved ||
      pause.until !== input.until ||
      (await read())?.guard !== first.guard
    ) {
      throw fail('changed');
    }
    policy();
  };
  const raw = await record.browser.commander.evaluate({
    fn: readFormDocument,
    args: [{ hhLimit: input }],
  });
  policy();
  const report = captureReport(raw);
  await check();
  const captured = {
    ...record,
    page: {
      ...record.page,
      scope: true,
      fieldIndices: report.fields.map((field) => field.index),
    },
    reviewPlan: { inspection: report },
  };
  try {
    await service.deferrals.preserve(
      captured,
      { confirm: true },
      signal,
      policy,
      check,
      { documentKey: input.documentKey, until: input.until }
    );
  } finally {
    // A later Q&A/checkpoint refusal must retain an already acknowledged full draft.
    for (const key of ['draft', 'restoration', 'revision', 'acknowledged']) {
      record[key] = captured[key];
    }
    if (!captured.guard) {
      record.guard = null;
    }
  }
  await check();
  const target = await closeTarget(record.browser.page, {
    ...input,
    guard: first.guard,
  });
  if (!target) {
    return applicationView(record);
  }
  try {
    await check();
    const result = await target.evaluate(applicationLimitDocument, {
      ...input,
      guard: first.guard,
      action: 'dismiss',
    });
    policy();
    if (!result?.requested) {
      throw fail('changed');
    }
    service.trace({
      event: 'application-limit-captcha-close-requested',
      fields: record.draft.fields.length,
    });
  } finally {
    await target.dispose();
  }
  await service.review.inspect(record, signal);
  policy();
  // Re-establish ordinary field identities after the dialog's controls disappear.
  if (!record.page.challenge) {
    await service.limitBackups.automatic(signal);
  }
  return applicationView(record);
};
