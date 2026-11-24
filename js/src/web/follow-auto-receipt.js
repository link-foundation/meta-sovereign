const integer = (value, min, max) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
const owner = (value) =>
  typeof value === 'string' && /^[1-9]\d{0,19}$/u.test(value);
const phases = new Set(['membership', 'mute', 'archive']);
const phaseStates = new Set([
  'ready',
  'skipped',
  'confirmed',
  'failed',
  'unknown',
  'pending',
  'sending',
  'unsupported',
]);
const phaseList = (value) =>
  Array.isArray(value) &&
  value.length >= 1 &&
  value.length <= 3 &&
  value.every(
    (row) => row && phases.has(row.phase) && phaseStates.has(row.status)
  ) &&
  new Set(value.map((row) => row.phase)).size === value.length;
const reviewPhases = (value, source) => {
  const expected =
    source === 'telegram' ? ['membership', 'mute', 'archive'] : ['membership'];
  return (
    phaseList(value) &&
    value.length === expected.length &&
    value.every((row, i) => row.phase === expected[i])
  );
};
export const autoConfigReceipt = (value, source) =>
  value === undefined ||
  (value &&
    integer(value.maxRetries, 0, 10) &&
    integer(value.maxLinks, 1, 100) &&
    integer(value.joinDelayMs, 0, 60000) &&
    typeof value.mute === 'boolean' &&
    typeof value.archive === 'boolean' &&
    (source !== 'vk' || (!value.mute && !value.archive)));
const target = (value, source) =>
  value &&
  typeof value.title === 'string' &&
  value.title.length <= 256 &&
  typeof value.member === 'boolean' &&
  (value.chat === null ||
    (typeof value.chat === 'string' &&
      (source === 'telegram'
        ? /^-[1-9]\d{0,23}$/u.test(value.chat)
        : integer(Number(value.chat), 2000000001, 2147483647))));
const resultReceipt = (link) =>
  link.result === undefined ||
  (link.result &&
    typeof link.result.ok === 'boolean' &&
    phaseList(link.result.results));
const confirmedLink = (link) =>
  link.status !== 'confirmed' ||
  (link.result?.ok === true &&
    link.result.results.length === link.review.phases.length &&
    link.result.results.every(
      (phase, i) =>
        phase.phase === link.review.phases[i].phase &&
        ['confirmed', 'skipped'].includes(phase.status)
    ));
const linkReceipt = (link, config, account) =>
  link &&
  typeof link.url === 'string' &&
  link.url.length <= 2048 &&
  typeof link.messageId === 'string' &&
  /^[1-9]\d*$/u.test(link.messageId) &&
  ['ready', 'applying', 'confirmed', 'unknown'].includes(link.status) &&
  link.review?.url === link.url &&
  link.review.source === config.targetSource &&
  link.review.owner === account.owner &&
  target(link.review.target, config.targetSource) &&
  reviewPhases(link.review.phases, config.targetSource) &&
  resultReceipt(link) &&
  confirmedLink(link);
const following = (value, config, account) =>
  value &&
  value.owner === account.owner &&
  typeof value.limited === 'boolean' &&
  integer(value.scanned, 0, config.historyLimit) &&
  Array.isArray(value.links) &&
  value.links.length <= config.autoFollow.maxLinks &&
  value.links.every((link) => linkReceipt(link, config, account)) &&
  new Set(value.links.map((link) => link.url)).size === value.links.length;
export const automaticReceipt = (value) => {
  if (!value.config.autoFollow) {
    return true;
  }
  const { config, followingAccount: account } = value;
  if (
    !account ||
    account.source !== config.targetSource ||
    !owner(account.owner) ||
    !target(account.target, config.targetSource)
  ) {
    return false;
  }
  return value.rows.every((row) => {
    if (value.planId && !row.following) {
      return false;
    }
    if (
      row.following !== undefined &&
      !following(row.following, config, account)
    ) {
      return false;
    }
    if (
      row.round !== undefined &&
      !integer(row.round, 0, config.autoFollow.maxRetries)
    ) {
      return false;
    }
    if (
      row.attempts !== undefined &&
      (!Array.isArray(row.attempts) ||
        row.attempts.length !== row.round ||
        row.attempts.some(
          (attempt, i) =>
            !attempt ||
            attempt.round !== i ||
            attempt.status !== 'rejected' ||
            typeof attempt.messageId !== 'string' ||
            !/^[1-9]\d*$/u.test(attempt.messageId) ||
            !following(attempt.following, config, account)
        ))
    ) {
      return false;
    }
    return (
      value.status !== 'confirmed' ||
      (row.following &&
        row.following.links.every((link) => link.status === 'confirmed'))
    );
  });
};
