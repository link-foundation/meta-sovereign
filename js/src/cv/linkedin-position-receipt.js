import { modelFingerprint } from '../automation/answer-model-context.js';

export const linkedinPositionPending = (row) =>
  ['opening', 'prepared', 'saving', 'skipping', 'verifying'].includes(
    row?.phase
  );

export const linkedinPositionHash = /^[a-f0-9]{64}$/u;
const refused = () => new Error('LinkedIn position receipt was not confirmed.');

export const confirmedLinkedinPositionReview = async (answer, check) => {
  const { fingerprint, ...body } = answer ?? {};
  if (
    body.version !== 1 ||
    !['draft', 'reviewed'].includes(body.phase) ||
    body.providerSaved !== false ||
    body.browserSlot !== 'linkedin-experience' ||
    fingerprint !== (await modelFingerprint(body)) ||
    !check(answer)
  ) {
    throw refused();
  }
  return answer;
};

export const confirmedLinkedinPositionJob = (row, requestId, fingerprint) => {
  if (
    row?.requestId !== requestId ||
    (row.options
      ? row.options.fingerprint !== fingerprint ||
        row.options.requestId !== requestId
      : row.phase !== 'stopped') ||
    (!linkedinPositionPending(row) &&
      ![
        'saved',
        'skipped',
        'closed',
        'unconfirmed',
        'stopped',
        'failed',
        'no-changes',
        'unknown',
        'interrupted',
      ].includes(row.phase)) ||
    row.providerSaved !== (row.phase === 'saved') ||
    (row.providerSaved &&
      row.save?.evidence !== 'verified-linkedin-position-export') ||
    !Array.isArray(row.unapplied) ||
    typeof row.decisionPending !== 'boolean'
  ) {
    throw refused();
  }
  return row;
};
