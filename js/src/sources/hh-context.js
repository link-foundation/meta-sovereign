// Keep only vacancy context actually present in an hh payload. This performs no
// lookup and does not imply that a short vacancy card contains a description.
import { htmlToText } from './email-html.js';

export const hhVacancyId = (value) => {
  const id = Number.isSafeInteger(value) ? String(value) : value;
  return typeof id === 'string' && /^\d{1,20}$/u.test(id) ? id : null;
};

export const hhAnswerContext = (vacancy) => {
  const id = vacancy?.id;
  if (
    (typeof id !== 'string' && !Number.isSafeInteger(id)) ||
    !String(id).trim() ||
    String(id).length > 300
  ) {
    return {};
  }
  const currency = vacancy.salary?.currency;
  const pay =
    typeof currency === 'string' && currency.length <= 32 ? currency : '';
  const html = vacancy.description;
  const text =
    typeof html === 'string' && html.length <= 60000 ? htmlToText(html) : '';
  const description = text.length <= 6000 ? text : '';
  return pay || description || hhVacancyId(id)
    ? { answerContext: { pay, description, evidence: `vacancy:hh:${id}` } }
    : {};
};
