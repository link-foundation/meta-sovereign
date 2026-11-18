/** Shared browser/server receipt bounds; no external process dependencies. */
export const formalReportVersion = (value) =>
  typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(value);
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const checkedCommentTarget = (action) =>
  action.operation !== 'update-comment' ||
  (positive(action.comment) &&
    /^[a-f0-9]{64}$/u.test(action.previousFingerprint ?? ''));
export const formalReportUrl = (value, issue = null) => {
  if (typeof value !== 'string') {
    return false;
  }
  const match =
    /^https:\/\/github\.com\/link-assistant\/formal-ai\/issues\/([1-9]\d*)(?:#issuecomment-([1-9]\d*))?$/u.exec(
      value
    );
  return (
    !!match &&
    positive(Number(match[1])) &&
    (!match[2] || positive(Number(match[2]))) &&
    (!issue || Number(match[1]) === issue)
  );
};
export const validFormalAction = (action) => {
  if (
    !action ||
    !formalReportVersion(action.version) ||
    typeof action.body !== 'string' ||
    action.body.length > 60000
  ) {
    return false;
  }
  if (action.operation === 'create') {
    return (
      typeof action.title === 'string' &&
      action.title.length <= 256 &&
      action.issue === undefined &&
      action.comment === undefined &&
      action.url === undefined
    );
  }
  return (
    ['comment', 'update-comment', 'already-reported'].includes(
      action.operation
    ) &&
    positive(action.issue) &&
    formalReportUrl(action.url, action.issue) &&
    checkedCommentTarget(action)
  );
};
export const validFormalResult = (result, action, mode) => {
  if (!result || result.operation !== action.operation) {
    return false;
  }
  if (result.state === 'already-reported') {
    return action.operation === 'already-reported' && result.url === action.url;
  }
  if (result.state === 'dry-run') {
    return mode === 'dry-run' && result.url === (action.url ?? null);
  }
  return (
    result.state === 'published' &&
    mode === 'publish' &&
    formalReportUrl(result.url, action.issue) &&
    (action.operation === 'create' || result.url.includes('#issuecomment-'))
  );
};
