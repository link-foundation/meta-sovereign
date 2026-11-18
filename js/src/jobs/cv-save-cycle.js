import { setTimeout as delay } from 'node:timers/promises';
import { readCvEditorDocument } from './cv-watch-document.js';
import { verifyCvSave } from './cv-watch-verification.js';
import { cvWatchUrl } from './cv-watch-browser.js';
import { sanitizedResumeCv } from './resume-cv.js';
import { jobsFailure } from './options.js';
import { traceCvWatch } from './cv-watch-trace.js';
import { readCvSavedWorkplace } from './cv-workplace-readback.js';
import {
  readCvSavedWorkplaceIds,
  createdCvWorkplaceAttempt,
  confirmedCvWorkplaceIds,
} from './cv-workplace-created.js';

const systemClock = Object.freeze({ now: Date.now, wait: delay });

/** Read retries only. No save, fill, cancellation click or navigation is issued. */
export const verifyOwnerCvSave = async ({
  session,
  store,
  attempt,
  check,
  signal,
  readExports,
  readWorkplace = readCvSavedWorkplace,
  readWorkplaceIds = readCvSavedWorkplaceIds,
  workplaceBaseline,
  pollMs = 500,
  verificationMs = 30000,
  clock = systemClock,
}) => {
  if (attempt.kind === 'workplace' && attempt.recordId === null) {
    workplaceBaseline = confirmedCvWorkplaceIds(workplaceBaseline);
  }
  const deadline = clock.now() + verificationMs;
  let reads = 0;
  let code = 'jobs-cv-form-open';
  const confirm = () => {
    check();
    const url = cvWatchUrl(session.page.url());
    const hash = url.pathname.match(/^\/resume\/(?:edit\/)?([^/]+)/u)?.[1];
    if (attempt.kind === 'about' && hash !== attempt.hash) {
      throw jobsFailure('cv-page', 'The saved CV page changed.');
    }
  };
  do {
    await clock.wait(pollMs, undefined, { signal });
    confirm();
    let readAttempted = false;
    try {
      if (
        await session.commander.evaluate({ fn: readCvEditorDocument, args: [] })
      ) {
        continue;
      }
      confirm();
      reads++;
      readAttempted = true;
      const exports = await readExports({
        session,
        store,
        attempt,
        check: confirm,
        signal,
      });
      confirm();
      let effectiveAttempt = attempt;
      let workplaceIds;
      if (attempt.kind === 'workplace' && attempt.recordId === null) {
        workplaceIds = await readWorkplaceIds({
          session,
          check: confirm,
          signal,
        });
        confirm();
        effectiveAttempt = createdCvWorkplaceAttempt(
          attempt,
          workplaceBaseline,
          workplaceIds
        );
      }
      const workplace =
        attempt.kind === 'workplace'
          ? await readWorkplace({
              session,
              attempt: effectiveAttempt,
              check: confirm,
              signal,
            })
          : undefined;
      confirm();
      if (verifyCvSave(effectiveAttempt, exports, workplace)) {
        return {
          ...(workplaceIds ? { workplaceIds } : {}),
          exports: exports.map((row) => ({
            hash: row.hash,
            cv: sanitizedResumeCv(row.cv).cv,
            sha256: row.sha256,
            ...(workplace
              ? {
                  workplace: {
                    recordId: workplace.recordId,
                    sha256: workplace.sha256,
                    checked: workplace.resumes.find(
                      (resume) => resume.hash === row.hash
                    ).checked,
                  },
                }
              : {}),
          })),
        };
      }
      code = 'jobs-cv-mismatch';
    } catch (error) {
      confirm();
      if (!readAttempted) {
        reads++;
      }
      traceCvWatch('readback-error', {
        name: error.name,
        contextChanged: /context.*destroy|navigation|closed/iu.test(
          error.message ?? ''
        ),
        code: error.code,
      });
      code = /^jobs-[a-z\d-]+$/u.test(error.code ?? '')
        ? error.code
        : 'jobs-cv-readback';
    }
  } while (reads < 5 && clock.now() < deadline);
  throw jobsFailure(
    code.slice('jobs-'.length),
    'The owner Save was not confirmed in native saved CVs.'
  );
};
