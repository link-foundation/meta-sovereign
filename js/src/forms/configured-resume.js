import { portableResumePdf } from './resume-data.js';
import { formFailure as failure } from './options.js';
import { writeAnswerKnowledge } from '../automation/question-knowledge.js';

export const FORM_RESUME_ID = 'form-resume:default';
const revisionPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u;
export const configuredResumeMetadata = (record) => {
  if (!record) {
    return null;
  }
  const file = record.metadata;
  if (
    record.id !== FORM_RESUME_ID ||
    !revisionPattern.test(record.revision) ||
    typeof record.updatedAt !== 'string' ||
    record.updatedAt.length > 40 ||
    !Number.isFinite(Date.parse(record.updatedAt)) ||
    typeof file?.name !== 'string' ||
    !/^[^/\\\p{Cc}]{1,120}\.pdf$/iu.test(file.name) ||
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > 8 * 1024 ** 2 ||
    file.type !== 'application/pdf' ||
    !/^[a-f\d]{64}$/u.test(file.sha256)
  ) {
    throw failure('form-resume-invalid', 'The saved PDF résumé is invalid.');
  }
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    sha256: file.sha256,
    revision: record.revision,
    updatedAt: record.updatedAt,
  };
};

export const configuredResume = async (store) =>
  configuredResumeMetadata(
    await store.get(FORM_RESUME_ID, (record) => ({
      id: record.id,
      metadata: record.metadata,
      revision: record.revision,
      updatedAt: record.updatedAt,
    }))
  );

const checkRevision = (current, revision) => {
  if ((current?.revision ?? null) !== (revision ?? null)) {
    throw failure(
      'form-resume-changed',
      'The saved PDF changed. Reload it before continuing.'
    );
  }
};

export const saveConfiguredResume = (store, input = {}) =>
  writeAnswerKnowledge(store, async () => {
    const file = { name: input.file?.name, data: input.file?.data };
    const pdf = await portableResumePdf(file);
    checkRevision(await configuredResume(store), input.revision);
    const record = {
      id: FORM_RESUME_ID,
      tokens: ['form-resume'],
      file,
      metadata: pdf,
      revision: globalThis.crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    };
    await store.put(record);
    return { ok: true, resume: configuredResumeMetadata(record) };
  });

export const deleteConfiguredResume = (store, input = {}) =>
  writeAnswerKnowledge(store, async () => {
    checkRevision(await configuredResume(store), input.revision);
    await store.delete(FORM_RESUME_ID);
    return { ok: true, resume: null };
  });

/** Keep selection and upload in the same owner-writer queue as replacement. */
export const withConfiguredResume = (store, revision, use) =>
  writeAnswerKnowledge(store, async () => {
    const record = await store.get(FORM_RESUME_ID);
    const current = configuredResumeMetadata(record);
    if (!current || !revisionPattern.test(revision)) {
      throw failure(
        'form-resume-missing',
        'Choose a saved PDF from the current plan.'
      );
    }
    checkRevision(current, revision);
    const file = { name: record.file?.name, data: record.file?.data };
    const pdf = await portableResumePdf(file);
    if (!Object.keys(pdf).every((key) => pdf[key] === record.metadata[key])) {
      throw failure(
        'form-resume-invalid',
        'The saved PDF bytes do not match their receipt.'
      );
    }
    return use(file);
  });
