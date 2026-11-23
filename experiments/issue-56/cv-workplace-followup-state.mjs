import { cvSaveAttempt } from '../../js/src/jobs/cv-watch-verification.js';
import { cvWorkplaceListHtml } from './cv-created-workplace-fixture.mjs';
import { resumeCvFixture, resumeExportHtml } from './resume-export-fixture.mjs';

export const cvWorkplaceFollowupState = ({ hash, otherHash, job }) => {
  const ids = [hash, otherHash];
  const original = { job, hashes: ids };
  const records = new Map([['123', original]]);
  let staleDetach = false;
  const localizedJob = (value, language) => {
    const [sample] = resumeCvFixture(language).jobs;
    return {
      ...sample,
      ...value,
      industries: sample.industries,
      period: sample.period,
    };
  };
  return {
    save(body) {
      const attempt = cvSaveAttempt(JSON.parse(body));
      const id = attempt.recordId ?? '987';
      const hashes = attempt.resumes
        .filter((row) => row.checked)
        .map((row) => row.hash);
      records.set(id, { job: { ...job, ...attempt }, hashes });
    },
    record(id) {
      const saved = records.get(id);
      return (
        saved && {
          job: saved.job,
          target: saved.hashes.includes(hash),
          shared: saved.hashes.includes(otherHash),
        }
      );
    },
    list() {
      return cvWorkplaceListHtml([...records.keys()]);
    },
    export(hash) {
      const language = hash === otherHash ? 'ru' : 'en';
      if (!ids.includes(hash)) {
        throw new Error('Unexpected fixture CV hash');
      }
      const selected = [...records].flatMap(([id, saved]) => {
        const value = staleDetach && id === '123' ? original : saved;
        return value.hashes.includes(hash)
          ? [localizedJob(value.job, language)]
          : [];
      });
      const unrelated = localizedJob(
        { company: 'Unrelated workplace' },
        language
      );
      return resumeExportHtml(language, [...selected, unrelated]);
    },
    keepOriginalInExport() {
      staleDetach = true;
    },
  };
};
