import { applicationFailure as fail } from './application-options.js';
import { resumeHash } from './resume-list.js';

/** Private observed identity, never export proof or authority to select/send. */
export const applicationResumePreference = (raw) => {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (
    !raw ||
    Object.keys(raw).some(
      (key) => !['hash', 'title', 'source'].includes(key)
    ) ||
    typeof raw.title !== 'string' ||
    !raw.title.length ||
    raw.title.length > 500 ||
    !['manual', 'context', 'native'].includes(raw.source) ||
    (raw.hash !== null && typeof raw.hash !== 'string')
  ) {
    throw fail('journal');
  }
  if (raw.hash !== null) {
    resumeHash(raw.hash);
  }
  return { hash: raw.hash, title: raw.title, source: raw.source };
};

const observedChoice = (page) => {
  const chooser = page?.resumeChooser;
  if (
    !page?.bound ||
    !page.scope ||
    page.challenge ||
    !chooser ||
    chooser.ambiguous ||
    chooser.disabled
  ) {
    return;
  }
  const checked = chooser.open
    ? chooser.options.find((row) => row.checked && !row.disabled)
    : null;
  if (chooser.open && (!checked || checked.title !== chooser.title)) {
    return;
  }
  return { title: chooser.title, hash: checked?.hash ?? null };
};

/** A native change after a known choice is retained, including an unproven title. */
export const observeApplicationResume = (record) => {
  const previous = record.resumePreference;
  if (!previous) {
    return;
  }
  const observed = observedChoice(record.page);
  if (!observed) {
    return;
  }
  const { title, hash } = observed;
  const same =
    previous.title === title &&
    (!hash || !previous.hash || previous.hash === hash);
  record.resumePreference = applicationResumePreference({
    title,
    hash: hash ?? (same ? previous.hash : null),
    source: same ? previous.source : 'native',
  });
};
