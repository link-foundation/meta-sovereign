import { modelFingerprint } from '../automation/answer-model-context.js';
import {
  assignmentFailure,
  assignmentVacancy,
  assignmentVacancyUrl,
} from './validation.js';

const invalidEvidence = () =>
  assignmentFailure(
    'vacancy-changed',
    'The reviewed vacancy evidence is invalid or has changed.'
  );

const validVacancyProvenance = (evidence) => {
  if (['url', 'chat'].includes(evidence.source)) {
    return (
      typeof evidence.url === 'string' &&
      assignmentVacancyUrl(evidence.url) === evidence.url &&
      typeof evidence.capturedAt === 'string' &&
      evidence.capturedAt.length <= 40 &&
      Number.isFinite(Date.parse(evidence.capturedAt))
    );
  }
  return (
    ['provided', 'unknown'].includes(evidence.source) &&
    evidence.url === undefined &&
    evidence.capturedAt === undefined
  );
};

export const assignmentVacancyReceiptFingerprint = (evidence, fingerprint) =>
  modelFingerprint([
    evidence.source,
    evidence.url ?? null,
    evidence.capturedAt ?? null,
    fingerprint,
  ]);

export const checkAssignmentVacancyEvidence = async ({
  vacancyEvidence,
  vacancyFingerprint,
  vacancyReceiptFingerprint,
}) => {
  if (
    !vacancyEvidence?.vacancy ||
    !validVacancyProvenance(vacancyEvidence) ||
    vacancyFingerprint !==
      (await modelFingerprint(assignmentVacancy(vacancyEvidence.vacancy))) ||
    (vacancyReceiptFingerprint !== undefined &&
      vacancyReceiptFingerprint !==
        (await assignmentVacancyReceiptFingerprint(
          vacancyEvidence,
          vacancyFingerprint
        )))
  ) {
    throw invalidEvidence();
  }
};
