// Keep only vacancy context actually present in an hh payload. This performs no
// lookup and does not imply that a short vacancy card contains a description.
import { htmlToText } from './email-html.js';

export const hhAnswerContext = (vacancy) => {
  const id = vacancy?.id;
  if (
    (typeof id !== 'string' && typeof id !== 'number') ||
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
  return pay || description
    ? { answerContext: { pay, description, evidence: `vacancy:hh:${id}` } }
    : {};
};
