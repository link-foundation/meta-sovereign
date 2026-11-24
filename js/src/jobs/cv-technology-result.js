import { modelFingerprint } from '../automation/answer-model-context.js';
import { browserName } from '../browser/policy.js';
import { resumeExportId } from './resume-export-result.js';
import { resumeHash } from './resume-list.js';
import { sanitizedResumeCv } from './resume-cv.js';
import { technologyCatalog, technologyFailure } from './technology-catalog.js';
import { buildCvTechnologyReview } from './cv-technology-review.js';

export const fingerprintTechnologyReview = async (content) => ({
  ...content,
  fingerprint: await modelFingerprint(content),
});
const fail = () => {
  throw technologyFailure('unconfirmed');
};
const reviewShape = (review) => {
  if (
    !review ||
    JSON.stringify(review).length > 12 * 1024 * 1024 ||
    !Array.isArray(review.sources) ||
    review.sources.length !== 2 ||
    !Array.isArray(review.observed) ||
    review.observed.length > 2048 ||
    !Number.isFinite(Date.parse(review.createdAt)) ||
    !['draft', 'reviewed'].includes(review.status)
  ) {
    fail();
  }
};
const sourceShape = (source, input, index) => {
  const id = source.identity;
  resumeExportId(id?.exportId);
  resumeHash(id.hash);
  browserName(id.browserSlot);
  const cv = sanitizedResumeCv(source.cv).cv;
  if (
    JSON.stringify(cv) !== JSON.stringify(source.cv) ||
    id.language !== cv.language ||
    id.title !== cv.title ||
    !/^[a-f0-9]{64}$/u.test(id.sha256) ||
    !Number.isFinite(Date.parse(id.capturedAt))
  ) {
    fail();
  }
  if (input?.browserSlot && input.browserSlot !== id.browserSlot) {
    fail();
  }
  if (
    input?.exports &&
    ['exportId', 'hash'].some((key) => input.exports[index]?.[key] !== id[key])
  ) {
    fail();
  }
};
const evidenceShape = (review) => {
  if (
    review.sources[0].identity.browserSlot !==
      review.sources[1].identity.browserSlot ||
    review.sources[0].identity.hash === review.sources[1].identity.hash ||
    review.observed.some(
      (row) =>
        typeof row?.canonical !== 'string' ||
        row.canonical.length > 80 ||
        typeof row.spelling !== 'string' ||
        row.spelling.length > 80
    )
  ) {
    fail();
  }
};
const selectedShape = (review, report) => {
  const allowed = new Set(report.changes.map((change) => change.id));
  if (
    !Array.isArray(review.selected) ||
    review.selected.length > 402 ||
    new Set(review.selected).size !== review.selected.length ||
    review.selected.some((id) => !allowed.has(id))
  ) {
    fail();
  }
  if (review.status === 'draft' && review.selected.length) {
    fail();
  }
  if (
    review.status === 'reviewed' &&
    (!review.selected.length ||
      report.blockers.length ||
      !/^[a-f0-9]{64}$/u.test(review.previousFingerprint) ||
      !Number.isFinite(Date.parse(review.reviewedAt)))
  ) {
    fail();
  }
};
const expectedAcknowledgement = (review, input) => {
  if (input?.exports && review.status !== 'draft') {
    fail();
  }
  if (
    input?.fingerprint &&
    (review.status !== 'reviewed' ||
      review.previousFingerprint !== input.fingerprint)
  ) {
    fail();
  }
  if (
    input?.selected &&
    JSON.stringify(input.selected.slice().sort()) !==
      JSON.stringify(review.selected.slice().sort())
  ) {
    fail();
  }
};
export const confirmedCvTechnologyReview = async (value, input) => {
  if (value?.review === null) {
    if (input?.revision || input?.fingerprint) {
      fail();
    }
    return value;
  }
  const review = value?.review;
  reviewShape(review);
  const catalog = await technologyCatalog(review.catalog?.entries);
  if (
    catalog.revision !== review.catalog.revision ||
    (input?.revision && input.revision !== catalog.revision)
  ) {
    fail();
  }
  review.sources.forEach((source, index) => sourceShape(source, input, index));
  evidenceShape(review);
  const report = buildCvTechnologyReview(review);
  if (
    (await modelFingerprint(report)) !== (await modelFingerprint(review.report))
  ) {
    fail();
  }
  selectedShape(review, report);
  expectedAcknowledgement(review, input);
  const { fingerprint, ...content } = review;
  if (fingerprint !== (await modelFingerprint(content))) {
    fail();
  }
  return { review };
};
