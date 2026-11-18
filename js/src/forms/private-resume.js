import { configuredResume, withConfiguredResume } from './configured-resume.js';
import {
  privateFormDirectory,
  readPrivateFormSource,
} from './private-source.js';
import { MAX_RESUME_BYTES, portableResumePdf } from './resume-data.js';
import { formFailure } from './options.js';
import { writeAnswerKnowledge } from '../automation/question-knowledge.js';

const name = 'resume/resume.pdf';
const failure = (source) =>
  formFailure(
    'form-resume-source',
    `Review the private ${source} source; choose a regular PDF résumé of at most 8 MiB.`
  );
const changed = () =>
  formFailure(
    'form-resume-changed',
    'The PDF résumé changed. Plan the current page again before attaching it.'
  );

const privateResume = async (store) => {
  const directory = await privateFormDirectory(store, failure);
  if (!directory) {
    return null;
  }
  const source = await readPrivateFormSource(
    directory,
    name,
    MAX_RESUME_BYTES,
    failure
  );
  if (!source) {
    return null;
  }
  try {
    const file = { name: 'resume.pdf', data: source.data.toString('base64') };
    return {
      file,
      metadata: {
        ...(await portableResumePdf(file)),
        revision: `private:${source.sha256}`,
        updatedAt: source.updatedAt,
        source: name,
      },
    };
  } catch {
    throw failure(name);
  }
};

/** An explicitly saved selection takes precedence over the conventional PDF. */
export const availableReviewResume = async (store, allowPrivate = true) =>
  (await configuredResume(store)) ??
  (allowPrivate ? (await privateResume(store))?.metadata : null) ??
  null;

export const withReviewResume = (store, revision, use) => {
  if (typeof revision !== 'string' || !revision.startsWith('private:')) {
    return withConfiguredResume(store, revision, use);
  }
  return writeAnswerKnowledge(store, async () => {
    if (await configuredResume(store)) {
      throw changed();
    }
    const current = await privateResume(store);
    if (!current || current.metadata.revision !== revision) {
      throw changed();
    }
    return use(current.file);
  });
};
