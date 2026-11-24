import { resumeExportRequestId } from '../jobs/resume-export-options.js';
import { experienceAutoOptions } from './experience-auto-record.js';

const running = [
  'acquiring',
  'selecting',
  'opening',
  'prepared',
  'refreshing',
  'replanning',
];
export const experienceReviewRunning = (row) => running.includes(row?.phase);
const resumable = [
  'selecting',
  'opening',
  'prepared',
  'refreshing',
  'replanning',
];
export const experienceReviewCanResume = (phase) => resumable.includes(phase);
const phases = [...running, 'completed', 'left', 'unconfirmed', 'failed'];
const digest = /^[a-f0-9]{64}$/u;
const itemKey = /^(?:about|position-(?:0|[1-9][0-9]{0,2}))$/u;
const codePattern = /^(?:cv|jobs|assignment)-[a-z0-9-]{1,100}$/u;
export const experienceReviewFailure = (reason) =>
  Object.assign(new Error('The experience review was not confirmed.'), {
    code: `cv-experience-review-${reason}`,
    status:
      { missing: 404, busy: 409, conflict: 409, decision: 409, stopped: 503 }[
        reason
      ] ?? 400,
  });
export const experienceReviewKey = (id) =>
  `secret:cv-experience-review:${resumeExportRequestId(id)}`;
export const experienceReviewCode = (code, fallback) =>
  codePattern.test(code) ? code : experienceReviewFailure(fallback).code;

export const experienceReviewOptions = (input) =>
  input.autoRequestId === undefined
    ? experienceAutoOptions(input)
    : {
        requestId: resumeExportRequestId(input.requestId),
        autoRequestId: resumeExportRequestId(input.autoRequestId),
      };
export const newExperienceReview = (
  requestId,
  options = null,
  token = null
) => ({
  id: experienceReviewKey(requestId),
  version: 1,
  requestId,
  options,
  token,
  phase: options ? 'acquiring' : 'left',
  auto: null,
  comparison: null,
  pending: [],
  groupNotes: [],
  history: [],
  current: null,
  freshRevision: null,
  refreshRequestId: null,
  replanRequestId: null,
  waitingLogin: false,
  code: null,
});
export const reviewChildId = (row, name, salt = row.history.length) =>
  `cv-review-${name}-${row.token}-${salt}`;
const validComparison = (value) =>
  value &&
  digest.test(value.hh) &&
  digest.test(value.linkedin) &&
  digest.test(value.fingerprint) &&
  resumeExportRequestId(value.requestId) === value.requestId &&
  ['hh', 'linkedin'].includes(value.to);
const validCurrent = (row) => {
  const item = row.current;
  if (row.phase === 'selecting') {
    return item === null;
  }
  if (!item) {
    return !['opening', 'prepared', 'refreshing', 'replanning'].includes(
      row.phase
    );
  }
  const about = item.kind === 'hh-about' || item.kind === 'linkedin-about';
  return (
    item.key === row.pending[0] &&
    (about || ['hh-workplace', 'linkedin-position'].includes(item.kind)) &&
    item.input?.requestId === reviewChildId(row, 'native') &&
    digest.test(item.input.fingerprint) &&
    [null, 'save', 'skip'].includes(item.decision) &&
    (about
      ? item.key === 'about' &&
        item.input.planRequestId === row.comparison.requestId &&
        item.input.fingerprint === row.comparison.fingerprint
      : item.key.startsWith('position-')) &&
    item.kind.startsWith('hh-') === (row.comparison.to === 'hh')
  );
};
const validHistory = (row) =>
  row.history.every(
    (item) =>
      itemKey.test(item.key) &&
      ['saved', 'skipped', 'manual', 'unchanged'].includes(item.outcome) &&
      (item.outcome === 'saved'
        ? digest.test(item.revision) && typeof item.evidence === 'string'
        : item.revision === null && item.evidence === null) &&
      (item.code === null || codePattern.test(item.code))
  );
const validOptions = (row, requestId) =>
  row.options
    ? row.options.requestId === requestId &&
      JSON.stringify(experienceReviewOptions(row.options)) ===
        JSON.stringify(row.options) &&
      /^[a-f0-9]{32}$/u.test(row.token)
    : row.phase === 'left' && row.token === null && row.auto === null;
const validComparisonCheckpoint = (row) =>
  row.comparison
    ? row.auto &&
      validComparison(row.comparison) &&
      row.comparison.to === row.auto.to &&
      JSON.stringify(experienceAutoOptions(row.auto)) ===
        JSON.stringify(row.auto)
    : row.auto === null &&
      !row.pending.length &&
      !row.history.length &&
      row.current === null &&
      ['acquiring', 'left', 'failed'].includes(row.phase);
const validChildRequest = (row, phase, child, requestId = null) => {
  if (requestId === null) {
    return true;
  }
  const prefix = reviewChildId(row, child, '');
  return (
    row.phase === phase &&
    typeof requestId === 'string' &&
    requestId.startsWith(prefix) &&
    /^[a-f0-9]{16}$/u.test(requestId.slice(prefix.length))
  );
};
const validCheckpoints = (row) =>
  validComparisonCheckpoint(row) &&
  validChildRequest(row, 'refreshing', 'refresh', row.refreshRequestId) &&
  validChildRequest(row, 'replanning', 'plan', row.replanRequestId);
const validItems = (row) => {
  if (!Array.isArray(row.pending) || !Array.isArray(row.history)) {
    return false;
  }
  const keys = [...row.pending, ...row.history.map(({ key }) => key)];
  return (
    keys.length <= 801 &&
    new Set(keys).size === keys.length &&
    keys.every((key) => itemKey.test(key)) &&
    Array.isArray(row.groupNotes) &&
    validHistory(row)
  );
};
export const checkedExperienceReview = (row, requestId) => {
  if (!row) {
    throw experienceReviewFailure('missing');
  }
  if (
    row.version !== 1 ||
    row.id !== experienceReviewKey(requestId) ||
    row.requestId !== requestId ||
    !validOptions(row, requestId) ||
    !phases.includes(row.phase) ||
    typeof row.waitingLogin !== 'boolean' ||
    (row.code !== null && !codePattern.test(row.code)) ||
    !validItems(row) ||
    !validCheckpoints(row) ||
    !validCurrent(row) ||
    (row.phase === 'replanning'
      ? !digest.test(row.freshRevision)
      : row.freshRevision !== null)
  ) {
    throw experienceReviewFailure('record');
  }
  return row;
};
export const experienceReviewView = (
  {
    id: _id,
    version: _version,
    token: _token,
    auto: _auto,
    refreshRequestId: _refreshRequestId,
    replanRequestId: _replanRequestId,
    ...row
  },
  active
) =>
  experienceReviewRunning(row) && !active
    ? {
        ...row,
        lastPhase: row.phase,
        phase: 'interrupted',
        code: row.code ?? experienceReviewFailure('ownership').code,
      }
    : row;
