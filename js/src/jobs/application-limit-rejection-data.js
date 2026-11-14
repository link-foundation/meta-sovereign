import { applicationFailure as fail } from './application-options.js';

const text = (value, max) =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
const iso = (value) =>
  text(value, 40) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
export const sameLimitAttempts = (left, right) =>
  ['enter', 'submit'].every((action) => left?.[action] === right?.[action]);
export const applicationLimitRejection = (raw) => {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (
    !/^secret:jobs-application-rejection:[a-f0-9-]{36}$/u.test(raw.id) ||
    !['recorded', 'released'].includes(raw.state) ||
    !/^[a-f0-9]{64}$/u.test(raw.digest)
  ) {
    throw fail('limit-rejection');
  }
  return { id: raw.id, state: raw.state, digest: raw.digest };
};
export const readLimitRejection = (raw) => {
  if (!/^secret:jobs-application-rejection:[a-f0-9-]{36}$/u.test(raw?.id)) {
    throw fail('limit-rejection');
  }
  if (
    raw.version !== 1 ||
    raw.reason !== 'daily-limit' ||
    ![
      ['applicationId', 240],
      ['requestId', 100],
      ['signature', 128 * 1024],
      ['documentKey', 100],
      ['reservationRevision', 100],
      ['draftId', 100],
    ].every(([key, max]) => text(raw[key], max)) ||
    !iso(raw.observedAt) ||
    !iso(raw.until) ||
    !['enter', 'submit'].includes(raw.action) ||
    raw.delivery !== 'unknown' ||
    raw.attempted?.[raw.action] !== true ||
    !['enter', 'submit'].every(
      (action) => typeof raw.attempted[action] === 'boolean'
    )
  ) {
    throw fail('limit-rejection');
  }
  return Object.fromEntries(
    [
      'id',
      'version',
      'reason',
      'applicationId',
      'requestId',
      'signature',
      'documentKey',
      'reservationRevision',
      'action',
      'delivery',
      'observedAt',
      'until',
      'draftId',
    ]
      .map((key) => [key, raw[key]])
      .concat([
        [
          'attempted',
          { enter: raw.attempted.enter, submit: raw.attempted.submit },
        ],
      ])
  );
};
