import { confirmedCvTechnologyReview } from './cv-technology-result.js';
import { storedTechnologyCatalog } from './technology-catalog.js';
import { verifiedTechnologyCv } from './technology-cv.js';
import { modelFingerprint } from '../automation/answer-model-context.js';
import { sanitizedResumeCv } from './resume-cv.js';
import { cvPrepareFailure } from './cv-prepare-record.js';

const selectedChange = (review, input) => {
  const change = review.report.changes.find(
    (item) => item.id === input.changeId
  );
  const source = review.sources.find(
    (item) => item.identity.hash === change?.hash
  );
  const index = change?.field.match(/^jobs\.(\d+)\.description$/u)?.[1];
  const job = index === undefined ? null : source?.cv.jobs[Number(index)];
  if (
    !source ||
    (change.field !== 'about' && (!job || job.description !== change.before))
  ) {
    throw cvPrepareFailure('conflict');
  }
  return job
    ? { ...change, workplace: { recordId: input.recordId, job } }
    : change;
};

/** Revalidate the approved plan and its exact private source before touching a tab. */
export const cvPrepareSource = async ({ store, artifactRoot }, input) => {
  const row = await store.get(`jobs-cv-technology-review:${input.browserSlot}`);
  const { review } = await confirmedCvTechnologyReview(
    { review: row?.review ?? null },
    { browserSlot: input.browserSlot }
  );
  const catalog = await storedTechnologyCatalog(store);
  if (
    row?.version !== 1 ||
    review?.status !== 'reviewed' ||
    review.fingerprint !== input.fingerprint ||
    review.catalog.revision !== catalog.revision ||
    !review.selected.includes(input.changeId)
  ) {
    throw cvPrepareFailure('conflict');
  }
  const change = selectedChange(review, input);
  for (const evidence of review.sources) {
    const current = await verifiedTechnologyCv(
      { store, artifactRoot },
      evidence.identity
    );
    const sanitized = { ...current, cv: sanitizedResumeCv(current.cv).cv };
    if (
      (await modelFingerprint(sanitized)) !== (await modelFingerprint(evidence))
    ) {
      throw cvPrepareFailure('conflict');
    }
  }
  return change;
};
