import { applicationFailure as fail } from './application-options.js';
import { matchingApplicationResume } from './application-context-choice.js';
import { withResumeLanguages } from './resume-language-files.js';
import { applicationLetterStatus } from './application-letters.js';

/** Runs only inside a confirmed action, never while reading or recovering. */
export class ApplicationLanguagePolicy {
  constructor(service) {
    this.service = service;
  }
  async ensure(record, signal) {
    if (
      !record.options.autoSelectResumeLanguage &&
      !record.options.standardLetters
    ) {
      return;
    }
    const { service } = this;
    service.resumes.ready(record);
    // Explicit and observed owner changes remain authoritative after restart.
    if (
      record.options.autoSelectResumeLanguage &&
      (!record.resumePreference ||
        record.resumePreference.source === 'automatic')
    ) {
      await service.resumes.context.change(record, signal, 'automatic');
    }
    const chooser = service.resumes.ready(record);
    const list = await withResumeLanguages(
      service,
      await service.resumes.list(record),
      signal
    );
    const entry = matchingApplicationResume(chooser, list.entries);
    if (!entry?.languageProof) {
      throw fail('resume-export');
    }
    await service.review.check(record, 'submit', signal);
    record.letterResume = entry;
    record.letter = applicationLetterStatus(record);
    service.trace({
      event: 'application-language-verified',
      language: entry.languageProof.language,
      source: record.resumePreference?.source ?? 'native',
    });
  }
}
