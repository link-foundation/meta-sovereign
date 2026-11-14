import {
  assignmentFailure,
  assignmentVacancy,
  assignmentVacancyUrl,
} from './validation.js';
import { vacancyMetadata } from './vacancy-metadata.js';

export const vacancyContent = (value, expectedUrl) => {
  const url = assignmentVacancyUrl(value?.url);
  const content = { ...assignmentVacancy(value), ...vacancyMetadata(value) };
  if (
    !content.title ||
    !content.description ||
    (expectedUrl !== undefined && url !== expectedUrl) ||
    typeof value.capturedAt !== 'string' ||
    value.capturedAt.length > 40 ||
    !Number.isFinite(Date.parse(value.capturedAt))
  ) {
    throw assignmentFailure(
      'vacancy-invalid',
      'The vacancy snapshot is incomplete or belongs to another vacancy.'
    );
  }
  return { ...content, url, capturedAt: value.capturedAt };
};
