/** Only definitive native refusals qualify; uncertain dispatch stays reserved. */
export const transientVacancySkipReasons = Object.freeze([
  'apply_button_disabled',
  'button_disabled',
  'apply_click_failed',
  'click_failed',
]);

export const transientVacancySkip = (entry) =>
  transientVacancySkipReasons.includes(entry.reason);

export const vacancySkipRecovery = (entry) =>
  !transientVacancySkip(entry)
    ? 'until-cleared'
    : entry.attempts >= 2
      ? 'retry-exhausted'
      : 'next-run';

/** Missing execution context is conservative. Reads never consume a retry. */
export const vacancySkipBlocks = (entry, { runId } = {}) =>
  !transientVacancySkip(entry) ||
  entry.attempts >= 2 ||
  !runId ||
  !entry.runId ||
  entry.runId === runId;

export const disabledVacancyControl = (record) => {
  const page = record.page;
  if (
    record.delivery !== 'none' ||
    record.attempted?.submit ||
    page.error ||
    page.delivered ||
    record.hold ||
    record.paused
  ) {
    return null;
  }
  if (page.scope && page.submit?.disabled) {
    return 'button_disabled';
  }
  return !page.scope && page.enter?.disabled ? 'apply_button_disabled' : null;
};
