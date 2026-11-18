import { Parser } from 'links-notation';
import { vacancyContent } from './vacancy-content.js';
import { assignmentVacancyUrl } from './validation.js';

export const LEGACY_VACANCY_BYTES = 512000;
const lists = new Set(['skills', 'required', 'preferred']);
const invalid = () => new Error('Invalid legacy vacancy record.');

/** Read the pinned app's indented cache, retaining the original separately. */
export const legacyVacancyContent = (text, vacancyId, updatedAt) => {
  const parser = new Parser({
    maxInputSize: LEGACY_VACANCY_BYTES,
    maxDepth: 4,
  });
  if (
    parser
      .parseCst(text)
      .tokens()
      .some(
        (token) =>
          token.kind === 'reference' &&
          ['"', "'", '`'].includes(token.text[0]) &&
          !token.quote
      )
  ) {
    throw invalid();
  }
  const fields = Object.create(null);
  for (const group of parser.parseGroups(text)) {
    const field = group.element.values;
    if (
      field.length !== 1 ||
      !field[0].id ||
      field[0].values.length ||
      Object.hasOwn(fields, field[0].id)
    ) {
      throw invalid();
    }
    const key = field[0].id;
    const values = group.children.map((child) => {
      if (
        child.children.length ||
        child.element.values.length !== 1 ||
        child.element.values[0].id === null ||
        child.element.values[0].values.length
      ) {
        throw invalid();
      }
      const value = child.element.values[0].id;
      return value === ' ' ? '' : value;
    });
    if (!lists.has(key) && values.length !== 1) {
      throw invalid();
    }
    fields[key] = lists.has(key) ? values : values[0];
  }
  const url = `https://hh.ru/vacancy/${vacancyId}`;
  if (
    fields.id !== vacancyId ||
    (fields.url !== undefined && assignmentVacancyUrl(fields.url) !== url)
  ) {
    throw invalid();
  }
  return vacancyContent({
    ...fields,
    url,
    capturedAt: fields.lastSeenAt || fields.firstSeenAt || updatedAt,
  });
};
