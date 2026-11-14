import {
  applicationFailure as fail,
  applicationView,
} from './application-options.js';
import { applicationResumeContext } from './application-resume-context.js';
import { chooseSearchResume } from './resume-list.js';
import { withResumeLanguages } from './resume-language-files.js';

const matchingCurrent = (chooser, entries) => {
  if (chooser.open) {
    const checked = chooser.options.find((row) => row.checked && !row.disabled);
    return entries.find(
      (row) => row.hash === checked?.hash && row.title === checked.title
    );
  }
  const matches = entries.filter((row) => row.title === chooser.title);
  return matches.length === 1 ? matches[0] : null;
};

/** Callers supply checked exports, then intersect them with actual native options. */
export const chooseContextResume = (chooser, list, language) => {
  const entries = list.entries.filter(
    (entry) =>
      entry.languageProof?.language === language &&
      chooser.options.some(
        (row) =>
          row.hash === entry.hash &&
          row.title === entry.title &&
          !row.disabled &&
          chooser.options.filter((other) => other.title === row.title)
            .length === 1
      )
  );
  const checked = matchingCurrent(chooser, entries);
  const hash = checked?.hash ?? chooseSearchResume({ ...list, entries }).hash;
  return entries.find((row) => row.hash === hash);
};

/** One confirmed context choice, bounded by the same native guards as manual choice. */
export class ApplicationContextChoice {
  constructor(resumes) {
    this.resumes = resumes;
    this.service = resumes.service;
  }
  sameContext(record, language) {
    const current = applicationResumeContext(record);
    if (current.language !== language) {
      this.service.trace({
        event: 'application-resume-context-changed',
        expectedLanguage: language,
        ...current,
      });
      throw fail('changed');
    }
  }
  async change(record, signal) {
    const { resumes, service } = this;
    const { language } = applicationResumeContext(record);
    if (!language) {
      throw fail('resume-context');
    }
    await service.review.check(record, 'submit', signal);
    if (record.options.testMode) {
      return applicationView({ ...record, state: 'test-preview' });
    }
    const list = await withResumeLanguages(
      service,
      await resumes.list(record),
      signal
    );
    // A uniquely known, already correct title does not need a chooser click.
    const current = matchingCurrent(record.page.resumeChooser, list.entries);
    if (current?.languageProof?.language === language) {
      return this.choose(record, current, language, signal);
    }
    if (!list.entries.some((row) => row.languageProof?.language === language)) {
      throw fail('resume-export');
    }
    if (!record.page.resumeChooser.open) {
      await resumes.menu(record, record.page.resumeChooser, signal);
    }
    this.sameContext(record, language);
    const chooser = resumes.ready(record);
    const desired = chooseContextResume(chooser, list, language);
    if (!desired) {
      await resumes.menu(record, chooser, signal);
      throw fail('resume-export');
    }
    return this.choose(record, desired, language, signal);
  }
  async choose(record, entry, language, signal) {
    const { resumes, service } = this;
    const documentKey = record.page.documentKey;
    // Recheck bytes after asynchronous menu inspection; no cached proof grants a write.
    const proof = await resumes.proof(record, entry.hash, entry.title, signal);
    if (proof.language !== language) {
      throw fail('resume-export');
    }
    await service.review.check(record, 'submit', signal);
    this.sameContext(record, language);
    const chooser = resumes.ready(record);
    let result;
    if (chooser.open) {
      result = await resumes.choose(
        record,
        chooser.options.find((row) => row.hash === entry.hash),
        proof,
        signal
      );
    } else if (chooser.title === entry.title) {
      // A successful no-op still consumes this confirmation through a fresh receipt.
      await service.review.inspect(record, signal);
      if (
        record.page.documentKey !== documentKey ||
        record.page.resumeChooser?.title !== entry.title ||
        record.page.resumeChooser.open
      ) {
        throw fail('changed');
      }
      result = {
        ...applicationView(record),
        resumeSelection: {
          hash: entry.hash,
          title: entry.title,
          languageProof: proof,
        },
      };
    } else {
      throw fail('changed');
    }
    this.sameContext(record, language);
    service.trace({ event: 'application-context-resume-choice', language });
    return result;
  }
}
