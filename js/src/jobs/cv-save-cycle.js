import { setTimeout as delay } from 'node:timers/promises';
import { readCvEditorDocument } from './cv-watch-document.js';
import {
  confirmedCvWorkplaceExportBaseline,
  cvWorkplaceExportBaseline,
  cvWorkplaceMembershipBaseline,
  verifyCvSave,
} from './cv-watch-verification.js';
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

const systemClock = Object.freeze({
  now: () => globalThis.performance.now(),
  wait: delay,
});

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
  workplaceBaselineJobs,
  workplaceMembership,
  pollMs = 500,
  verificationMs = 30000,
  clock = systemClock,
}) => {
  const created = attempt.kind === 'workplace' && attempt.recordId === null;
  if (created) {
    workplaceBaseline = confirmedCvWorkplaceIds(workplaceBaseline);
    workplaceBaselineJobs = confirmedCvWorkplaceExportBaseline(
      workplaceBaselineJobs,
      attempt.resumes
    );
  }
  const deadline = clock.now() + verificationMs;
  let reads = 0;
  let editorOpen = false;
  let code = 'jobs-cv-form-open';
  const confirm = () => {
    signal.throwIfAborted();
    check();
    if (clock.now() >= deadline) {
      traceCvWatch('verification-expired', { reads, editorOpen });
      throw jobsFailure(
        editorOpen ? 'cv-form-open' : 'cv-readback-timeout',
        'The owner Save was not confirmed before the readback deadline.'
      );
    }
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
      editorOpen = Boolean(
        await session.commander.evaluate({ fn: readCvEditorDocument, args: [] })
      );
      confirm();
      if (editorOpen) {
        continue;
      }
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
      if (created) {
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
      if (
        verifyCvSave(
          effectiveAttempt,
          exports,
          workplace,
          created ? workplaceBaselineJobs : undefined,
          workplaceMembership
        )
      ) {
        const result = {
          ...(created
            ? {
                workplaceIds,
                workplaceJobs: cvWorkplaceExportBaseline(
                  exports,
                  attempt.resumes
                ),
              }
            : {}),
          ...(workplace && {
            workplaceMembership: cvWorkplaceMembershipBaseline(
              workplace,
              exports
            ),
          }),
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
        confirm();
        return result;
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
