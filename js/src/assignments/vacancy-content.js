import {
  assignmentFailure,
  assignmentText,
  assignmentVacancy,
  assignmentVacancyUrl,
} from './validation.js';
import { vacancyMetadata } from './vacancy-metadata.js';
import { vacancyHistory, vacancyApplication } from './vacancy-history.js';

export const vacancyContent = (value, expectedUrl) => {
  const url = assignmentVacancyUrl(value?.url);
  const content = {
    ...assignmentVacancy(value),
    ...vacancyMetadata(value),
    ...vacancyHistory(value),
    ...vacancyApplication(value),
  };
  // Optional for old snapshots; employer HTML is private data, never markup
  // for rendering or model context. Validate without changing its exact bytes.
  const html = value.descriptionHtml;
  if (html !== undefined) {
    assignmentText(html, 120000, 'vacancy description HTML');
    content.descriptionHtml = html;
  }
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
