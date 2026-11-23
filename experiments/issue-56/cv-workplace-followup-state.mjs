import { cvSaveAttempt } from '../../js/src/jobs/cv-watch-verification.js';
import { cvWorkplaceListHtml } from './cv-created-workplace-fixture.mjs';
import { resumeCvFixture, resumeExportHtml } from './resume-export-fixture.mjs';

const localizedPeriod = (job, language) => {
  const monthName = new Intl.DateTimeFormat(language, {
    month: 'long',
    timeZone: 'UTC',
  });
  const date = (value) => {
    const [year, month] = value.split('-');
    return `${monthName.format(Date.UTC(Number(year), Number(month) - 1))} ${year}`;
  };
  const end = job.current
    ? language === 'ru'
      ? 'настоящее время'
      : 'present'
    : date(job.end);
  return `${date(job.start)} — ${end}`;
};

export const cvWorkplaceFollowupState = ({
  hash,
  otherHash,
  job,
  emptyTarget,
  singleTarget,
}) => {
  const ids = [hash, otherHash];
  const original = {
    job,
    hashes: emptyTarget ? [otherHash] : singleTarget ? [hash] : ids,
  };
  const records = new Map([['123', original]]);
  let staleDetach = false;
  const localizedJob = (value, language) => {
    const [sample] = resumeCvFixture(language).jobs;
    const result = {
      ...sample,
      ...value,
      industries: sample.industries,
    };
    return { ...result, period: localizedPeriod(result, language) };
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
      return resumeExportHtml(
        language,
        emptyTarget && hash !== otherHash ? selected : [...selected, unrelated]
      );
    },
    keepOriginalInExport() {
      staleDetach = true;
    },
  };
};
