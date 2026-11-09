import { codedError, markSendOutcome } from './http.js';

// A successful HTTP response alone does not prove a publication or deletion.
export const unknownPublication = (source, operation) =>
  Object.assign(
    markSendOutcome(
      codedError(`${source} returned no ${operation} receipt`, 'send-unknown'),
      { ambiguous: true }
    ),
    { outcome: 'unknown', fallback: false }
  );

export const publicationId = (value) =>
  /^[1-9]\d{0,18}$/.test(String(value ?? '')) ? String(value) : null;
