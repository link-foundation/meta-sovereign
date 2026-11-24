import { browserName } from '../browser/policy.js';
import { resumeExportRequestId } from './resume-export-options.js';
import { jobsFailure } from './options.js';
import { resumeHash } from './resume-list.js';
import { sanitizedResumeCv } from './resume-cv.js';

export const cvWatchOptions = (input) => {
  const durationMs = input.durationMs ?? 900000;
  if (
    !Number.isInteger(durationMs) ||
    durationMs < 1000 ||
    durationMs > 7200000 ||
    (input.targetId !== undefined &&
      !/^[a-zA-Z\d]{1,100}$/u.test(input.targetId))
  ) {
    throw jobsFailure(
      'cv-input',
      'Choose a finite CV watch duration and an exact existing tab.'
    );
  }
  return {
    browserSlot: browserName(input.browserSlot ?? 'jobs'),
    requestId: resumeExportRequestId(input.requestId),
    durationMs,
    ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
  };
};
const states = [
  'starting',
  'watching',
  'verifying',
  'saved',
  'not-saved',
  'cancelled',
  'edited',
  'failed',
  'stopped',
  'expired',
  'interrupted',
];
const workplaceEvidence = (raw) => {
  if (raw === undefined) {
    return {};
  }
  if (
    !raw ||
    typeof raw.recordId !== 'string' ||
    !/^\d{1,100}$/u.test(raw.recordId) ||
    !/^[a-f\d]{64}$/u.test(raw.sha256) ||
    typeof raw.checked !== 'boolean'
  ) {
    throw jobsFailure('cv-state', 'The saved workplace evidence is invalid.');
  }
  return {
    workplace: {
      recordId: raw.recordId,
      sha256: raw.sha256,
      checked: raw.checked,
    },
  };
};
const validWatchTimes = (raw) =>
  typeof raw.active === 'boolean' &&
  typeof raw.startedAt === 'string' &&
  Number.isFinite(Date.parse(raw.startedAt)) &&
  Number.isFinite(Date.parse(raw.expiresAt)) &&
  Date.parse(raw.expiresAt) > Date.parse(raw.startedAt) &&
  Date.parse(raw.expiresAt) - Date.parse(raw.startedAt) <= 7200000 &&
  (raw.code === null || /^jobs-[a-z\d-]+$/u.test(raw.code)) &&
  Number.isInteger(raw.saves) &&
  raw.saves >= 0 &&
  (raw.lastSavedAt === null || Number.isFinite(Date.parse(raw.lastSavedAt)));
export const cvWatchResult = (raw, input = {}) => {
  if (
    !raw ||
    raw.version !== 1 ||
    !states.includes(raw.state) ||
    raw.passive !== true ||
    !validWatchTimes(raw)
  ) {
    throw jobsFailure(
      'cv-state',
      'The saved CV watch state was not confirmed.'
    );
  }
  const browserSlot = browserName(raw.browserSlot);
  const requestId = resumeExportRequestId(raw.requestId);
  if (
    (input.browserSlot !== undefined && input.browserSlot !== browserSlot) ||
    (input.requestId !== undefined && input.requestId !== requestId)
  ) {
    throw jobsFailure('cv-state', 'The CV watch identity changed.');
  }
  return {
    version: 1,
    requestId,
    browserSlot,
    state: raw.state,
    active: raw.active,
    passive: true,
    startedAt: raw.startedAt,
    expiresAt: raw.expiresAt,
    lastSavedAt: raw.lastSavedAt,
    saves: raw.saves,
    code: raw.code,
  };
};

export const cvSnapshotsResult = (raw, input = {}) => {
  const browserSlot = browserName(raw?.browserSlot);
  if (
    (input.browserSlot !== undefined && input.browserSlot !== browserSlot) ||
    !Array.isArray(raw?.snapshots) ||
    raw.snapshots.length > 100 ||
    JSON.stringify(raw).length > 8 * 1024 ** 2 + 4096
  ) {
    throw jobsFailure('cv-state', 'Saved CV snapshots were not confirmed.');
  }
  const snapshots = raw.snapshots.map((row) => {
    if (
      row.evidence !== 'verified-owner-save-native-export' ||
      !/^[a-f\d]{64}$/u.test(row.sha256) ||
      typeof row.savedAt !== 'string' ||
      !Number.isFinite(Date.parse(row.savedAt))
    ) {
      throw jobsFailure('cv-state', 'The native saved CV evidence is invalid.');
    }
    return {
      hash: resumeHash(row.hash),
      cv: sanitizedResumeCv(row.cv).cv,
      sha256: row.sha256,
      savedAt: row.savedAt,
      attemptId: resumeExportRequestId(row.attemptId),
      evidence: row.evidence,
      ...workplaceEvidence(row.workplace),
    };
  });
  if (new Set(snapshots.map((row) => row.hash)).size !== snapshots.length) {
    throw jobsFailure('cv-state', 'Saved CV snapshot identities conflict.');
  }
  return { browserSlot, snapshots };
};
