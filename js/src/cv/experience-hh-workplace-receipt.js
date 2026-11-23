export const HH_EXPERIENCE_SLOT = 'hh-experience-slot';
export const hhWorkplaceRunningPhases = [
  'opening',
  'waiting-login',
  'preparing',
  'prepared',
  'saving',
  'skipping',
  'verifying',
];
export const hhWorkplaceFinalPhases = [
  'saved',
  'skipped',
  'stopped',
  'closed',
  'failed',
  'unconfirmed',
];
export const hhExperienceWorkplaceRunning = (row) =>
  hhWorkplaceRunningPhases.includes(row?.phase);

const sha256 = /^[a-f\d]{64}$/u;
export const verifiedHhAboutSave = (save) =>
  save?.evidence === 'verified-hh-about-export' &&
  Array.isArray(save.exports) &&
  save.exports.length === 1 &&
  /^[a-zA-Z\d_-]{1,100}$/u.test(save.exports[0]?.hash ?? '') &&
  sha256.test(save.exports[0]?.sha256 ?? '') &&
  Object.keys(save.exports[0]).length === 2;

export const verifiedHhWorkplaceSave = (save) =>
  save?.evidence === 'verified-hh-workplace-export' &&
  Array.isArray(save.exports) &&
  save.exports.length >= 1 &&
  save.exports.length <= 100 &&
  new Set(save.exports.map((row) => row?.hash)).size === save.exports.length &&
  save.exports.some((row) => row?.workplace?.checked === true) &&
  save.exports.every(
    (row) =>
      /^[a-zA-Z\d_-]{1,100}$/u.test(row?.hash ?? '') &&
      sha256.test(row.sha256) &&
      /^\d{1,100}$/u.test(row.workplace?.recordId) &&
      sha256.test(row.workplace.sha256) &&
      typeof row.workplace.checked === 'boolean' &&
      row.workplace.recordId === save.exports[0]?.workplace?.recordId &&
      row.workplace.sha256 === save.exports[0]?.workplace?.sha256
  );

export const confirmedHhWorkplaceJob = (
  row,
  requestId,
  { fingerprint, browserSlot, planRequestId }
) => {
  if (
    row?.requestId !== requestId ||
    row.experienceSlot !== HH_EXPERIENCE_SLOT ||
    !hhWorkplaceRunningPhases
      .concat(hhWorkplaceFinalPhases, ['interrupted', 'unknown'])
      .includes(row.phase) ||
    (row.options
      ? row.options.fingerprint !== fingerprint ||
        row.options.requestId !== requestId ||
        row.options.browserSlot !== browserSlot ||
        row.options.planRequestId !== planRequestId
      : row.phase !== 'stopped') ||
    row.providerSaved !== (row.phase === 'saved') ||
    (row.providerSaved
      ? !(planRequestId ? verifiedHhAboutSave : verifiedHhWorkplaceSave)(
          row.save
        )
      : row.save !== null) ||
    typeof row.decisionPending !== 'boolean'
  ) {
    throw new Error('The native HeadHunter review receipt was not confirmed.');
  }
  return row;
};
