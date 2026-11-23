import { modelFingerprint } from '../automation/answer-model-context.js';
import { formUrl, formFailure } from './options.js';

const marker =
  /test\s+(?:assignment|task)|take[ -]home\s+(?:assignment|task|exercise)|(?:тестов|домашн)\p{L}*\s+задан\p{L}*|测试任务|परीक्षण\s+कार्य/iu;
const waived =
  /(?:no|without)\s+(?:a\s+)?test\s+(?:assignment|task)|test\s+(?:assignment|task)\s+(?:is\s+)?(?:not required|optional)|без\s+(?:тестов|домашн)\p{L}*\s+задан|(?:тестов|домашн)\p{L}*\s+задан\p{L}*\s+не\s+требуется|无需测试任务/iu;

export const assignmentSectionPatterns = {
  marker: marker.source,
  waived: waived.source,
};
const text = (value) =>
  String(value ?? '')
    .replace(/\s+/gu, ' ')
    .trim();
export const assignmentQuestion = (value) =>
  marker.test(text(value)) && !waived.test(text(value));
const assignmentSection = (value) =>
  assignmentQuestion(value.split('\n', 2).join(' '));
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
  const legacy = [
    inspection.title,
    ...inspection.frames
      .filter((frame) => !frame.assignmentSections?.some(assignmentSection))
      .map((frame) => frame.intro),
    ...inspection.fields.flatMap((field) => [
      field.description,
      !assignmentResultField(field) ? field.group?.label || field.label : '',
    ]),
  ]
    .map(text)
    .filter(assignmentQuestion);
  const sections = inspection.frames
    .flatMap((frame) => frame.assignmentSections ?? [])
    .filter(assignmentSection)
    .map(text);
  const chunks = [
    ...legacy.filter(
      (chunk) => !sections.some((section) => section.includes(chunk))
    ),
    ...sections,
  ];
  const links = inspection.fields.filter(assignmentResultField);
  const description = [...new Set(chunks)].join('\n');
  if (
    description.length > 30000 ||
    inspection.frames.some((frame) => frame.assignmentSectionsLimited)
  ) {
    throw formFailure(
      'form-assignment-limit',
      'Read a smaller assignment before linking its repository.'
    );
  }
  if (!chunks.length && !links.length) {
    return null;
  }
  return {
    description,
    fingerprint: description ? await modelFingerprint(description) : null,
    resultFields: links.map((field) => field.id),
  };
};
