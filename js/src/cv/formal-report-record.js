import { modelFingerprint } from '../automation/answer-model-context.js';
import { resumeExportRequestId } from '../jobs/resume-export-options.js';
import {
  formalReportVersion,
  validFormalAction,
  validFormalResult,
} from './formal-report-shape.js';

export const formalReportFailure = (reason) =>
  Object.assign(new Error('The reviewed Formal AI report was not confirmed.'), {
    code: `cv-formal-report-${reason}`,
  });
const digest = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
export const formalReportOptions = (input) => {
  const options = {
    requestId: resumeExportRequestId(input.requestId),
    planRequestId: resumeExportRequestId(input.planRequestId),
    review: input.review,
    mode: input.mode ?? 'dry-run',
    confirm: input.confirm === true,
  };
  if (
    !digest(options.review) ||
    !['off', 'dry-run', 'publish'].includes(options.mode) ||
    (options.mode === 'publish' && !options.confirm)
  ) {
    throw formalReportFailure('input');
  }
  return options;
};
export const formalReportKey = (id) =>
  `secret:cv-formal-report:${resumeExportRequestId(id)}`;
export const formalReportRunning = (row) =>
  ['preparing', 'publishing'].includes(row?.phase);
export const newFormalReport = (requestId, options = null) => ({
  id: formalReportKey(requestId),
  version: 1,
  requestId,
  options,
  phase: options ? 'preparing' : 'stopped',
  createdAt: new Date().toISOString(),
  actions: [],
  results: [],
  pending: null,
  code: null,
});
const validRecordContents = (row) =>
  Array.isArray(row.actions) &&
  row.actions.every(validFormalAction) &&
  Array.isArray(row.results) &&
  row.results.length <= row.actions.length &&
  row.results.every((result, index) =>
    validFormalResult(result, row.actions[index], row.options?.mode)
  ) &&
  (row.pending === null ||
    (row.pending === row.results.length && !!row.actions[row.pending])) &&
  (row.code === null || /^cv-formal-report-[a-z-]+$/u.test(row.code)) &&
  (row.phase !== 'completed' ||
    (row.pending === null && row.results.length === row.actions.length));
export const checkedFormalReport = (row, requestId) => {
  if (
    !row ||
    row.id !== formalReportKey(requestId) ||
    row.version !== 1 ||
    row.requestId !== requestId ||
    ![
      'preparing',
      'publishing',
      'completed',
      'stopped',
      'failed',
      'unknown',
    ].includes(row.phase) ||
    !validRecordContents(row) ||
    !Number.isFinite(Date.parse(row.createdAt)) ||
    (row.options
      ? row.options.requestId !== requestId ||
        JSON.stringify(formalReportOptions(row.options)) !==
          JSON.stringify(row.options)
      : row.phase !== 'stopped')
  ) {
    throw formalReportFailure('record');
  }
  return row;
};
export const formalReportView = async (row, active) => {
  const { id: _id, ...content } = row;
  const phase =
    formalReportRunning(row) && !active
      ? row.pending === null
        ? 'interrupted'
        : 'unknown'
      : row.phase;
  const value = { ...content, phase };
  return { ...value, fingerprint: await modelFingerprint(value) };
};
export const confirmedFormalReport = async (value, requestId) => {
  const { fingerprint, ...content } = value ?? {};
  if (
    content.requestId !== resumeExportRequestId(requestId) ||
    fingerprint !== (await modelFingerprint(content))
  ) {
    throw formalReportFailure('receipt');
  }
  checkedFormalReport(
    {
      ...content,
      id: formalReportKey(requestId),
      phase: content.phase === 'interrupted' ? 'preparing' : content.phase,
    },
    requestId
  );
  return value;
};
export const confirmedFormalPreview = async (value, planRequestId) => {
  const { fingerprint, ...content } = value ?? {};
  if (
    content.kind !== 'cv-formal-report-preview' ||
    content.version !== 1 ||
    content.repository !== 'link-assistant/formal-ai' ||
    content.planRequestId !== planRequestId ||
    !digest(content.planFingerprint) ||
    !Array.isArray(content.groups) ||
    !content.groups.every(
      (group) =>
        formalReportVersion(group?.version) &&
        Array.isArray(group.samples) &&
        group.samples.every(
          (sample) =>
            typeof sample?.source === 'string' &&
            typeof sample.kind === 'string'
        )
    ) ||
    fingerprint !== (await modelFingerprint(content))
  ) {
    throw formalReportFailure('preview');
  }
  return value;
};
