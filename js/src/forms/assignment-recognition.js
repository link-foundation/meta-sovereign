import { modelFingerprint } from '../automation/answer-model-context.js';
import { formUrl, formFailure } from './options.js';

const marker =
  /test\s+assignment|take[ -]home\s+(?:assignment|task|exercise)|тестов\p{L}*\s+задан\p{L}*|测试任务|परीक्षण\s+कार्य/iu;
const waived =
  /(?:no|without)\s+(?:a\s+)?test\s+assignment|test\s+assignment\s+(?:is\s+)?(?:not required|optional)|без\s+тестов\p{L}*\s+задан|тестов\p{L}*\s+задан\p{L}*\s+не\s+требуется|无需测试任务/iu;
const text = (value) =>
  String(value ?? '')
    .replace(/\s+/gu, ' ')
    .trim();
export const assignmentQuestion = (value) =>
  marker.test(text(value)) && !waived.test(text(value));
export const assignmentResultField = (field) => {
  const label = text(`${field.group?.label ?? ''} ${field.label}`);
  return (
    marker.test(label) &&
    /link|url|repository|result|ссылк|репозитор|результат|链接|仓库|लिंक|रिपॉजिटरी/iu.test(
      label
    ) &&
    !waived.test(label)
  );
};

export const assignmentFormUrl = (value) => {
  const url = new URL(formUrl(value));
  if (url.href.length > 4000) {
    throw formFailure('form-assignment-invalid', 'The form URL is too long.');
  }
  url.hash = '';
  return url.href;
};
export const assignmentRecordId = async (url) =>
  `form-assignment:${await modelFingerprint(assignmentFormUrl(url))}`;

/** Only bounded visible inspection text; never fetch linked task documents. */
export const recognizeFormAssignment = async (inspection) => {
  const chunks = [
    inspection.title,
    ...inspection.frames.map((frame) => frame.intro),
    ...inspection.fields.flatMap((field) => [
      field.description,
      !assignmentResultField(field) ? field.group?.label || field.label : '',
    ]),
  ]
    .map(text)
    .filter((value) => marker.test(value) && !waived.test(value));
  const links = inspection.fields.filter(assignmentResultField);
  if (!chunks.length && !links.length) {
    return null;
  }
  const description = [...new Set(chunks)].join('\n');
  if (description.length > 30000) {
    throw formFailure(
      'form-assignment-limit',
      'Read a smaller assignment before linking its repository.'
    );
  }
  return {
    description,
    fingerprint: description ? await modelFingerprint(description) : null,
    resultFields: links.map((field) => field.id),
  };
};
