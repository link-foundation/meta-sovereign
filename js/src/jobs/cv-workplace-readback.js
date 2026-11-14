import { createHash } from 'node:crypto';
import { fetchCvSavedHtml } from './cv-watch-export.js';
import { readCvEditorDocument } from './cv-watch-document.js';
import { cvSaveAttempt } from './cv-watch-verification.js';
import { jobsFailure } from './options.js';

/** Read the exact saved record without resumeFrom's checkbox preselection. */
export const readCvSavedWorkplace = async ({ session, attempt, check }) => {
  if (
    typeof attempt.recordId !== 'string' ||
    !/^\d{1,100}$/u.test(attempt.recordId)
  ) {
    throw jobsFailure('cv-record', 'The saved workplace identity is unknown.');
  }
  check();
  const html = await session.commander.evaluate({
    fn: fetchCvSavedHtml,
    args: [{ recordId: attempt.recordId }],
  });
  check();
  if (typeof html !== 'string' || Buffer.byteLength(html) > 2 * 1024 ** 2) {
    throw jobsFailure('cv-record', 'The saved workplace exceeds its bound.');
  }
  const raw = await session.commander.evaluate({
    fn: readCvEditorDocument,
    args: [
      {
        html,
        url: `https://hh.ru/profile/edit/experience/${attempt.recordId}`,
      },
    ],
  });
  check();
  if (raw?.kind !== 'workplace') {
    throw jobsFailure('cv-record', 'The saved workplace form is unavailable.');
  }
  return {
    ...cvSaveAttempt(raw),
    sha256: createHash('sha256').update(html).digest('hex'),
  };
};
