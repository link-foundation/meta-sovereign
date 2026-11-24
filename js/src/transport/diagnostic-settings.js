/** A missing or malformed response must never become a successful save. */
export const isDiagnosticSettings = (value) =>
  value?.ok === true &&
  typeof value.verbose === 'boolean' &&
  typeof value.session?.persisted === 'boolean' &&
  (value.session.persisted
    ? typeof value.session.file === 'string' &&
      /^[a-zA-Z0-9.-]{1,160}\.log$/.test(value.session.file) &&
      Number.isSafeInteger(value.session.dropped) &&
      value.session.dropped >= 0
    : value.session.file === null);
