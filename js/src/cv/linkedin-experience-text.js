import { resumePeriod } from '../jobs/resume-dates.js';
import { experienceDocumentFailure } from './experience-document.js';

const invalid = () => {
  throw experienceDocumentFailure();
};
const dateLine =
  /^(?:[a-zа-яё]+\.?\s+)?(?:19|20)\d{2}(?:\s*г\.)?\s+[—–-]\s+(?:(?:[a-zа-яё]+\.?\s+)?(?:19|20)\d{2}(?:\s*г\.)?|present|now|настоящее время|сейчас)(?:\s*·\s*[^\n]+)?$/iu;
const employment =
  /^(?:full-time|part-time|self-employed|freelance|contract|internship|apprenticeship|seasonal|полная занятость|частичная занятость|самозанятость|фриланс|стажировка)$/iu;
const place =
  /^(?:[\p{Lu}\p{Lt}][\p{L}\p{M}'’.-]*(?: [\p{Lu}\p{Lt}][\p{L}\p{M}'’.-]*){0,5}, ){1,2}[\p{Lu}\p{Lt}][\p{L}\p{M}'’.-]*(?: [\p{Lu}\p{Lt}][\p{L}\p{M}'’.-]*){0,5}$/u;
const linesOf = (value) => {
  if (typeof value !== 'string' || value.length > 100000) {
    invalid();
  }
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index, lines) => index === 0 || line !== lines[index - 1]);
};
const headerOf = (lines, grouped) => {
  const dates = lines.flatMap((line, index) =>
    dateLine.test(line) ? [index] : []
  );
  if (dates.length !== 1) {
    invalid();
  }
  const index = dates[0];
  const head = lines.slice(0, index);
  if (grouped && head.length === 2 && employment.test(head[1])) {
    head.pop();
  }
  if (head.length !== (grouped ? 1 : 2)) {
    invalid();
  }
  const period = lines[index];
  const datesValue = resumePeriod(period);
  if (!datesValue.start || (!datesValue.current && !datesValue.end)) {
    invalid();
  }
  return { head, period, index };
};
const roleFrom = (raw, grouped) => {
  const lines = linesOf(raw.text);
  const { head, period, index } = headerOf(lines, grouped);
  const body = lines.slice(index + 1);
  // Only explicit place/remote wording identifies location. Other prose is retained.
  const location =
    body[0]?.length <= 200 &&
    (place.test(body[0]) ||
      /^(?:remote|on-site|hybrid|удал[её]нно|гибрид)$/iu.test(body[0]))
      ? body.shift()
      : '';
  const marks = raw.marks ?? [];
  const skills = body.filter((line) => /^(?:skills|навыки):\s*\S/iu.test(line));
  return {
    id: raw.id ?? '',
    title: head[0],
    period,
    lines: [
      period,
      ...(grouped ? [] : [head[1]]),
      ...(location ? [location] : []),
    ],
    descriptions: body.filter(
      (line) =>
        !skills.includes(line) &&
        !marks.some((mark) => mark.kind !== 'description' && mark.text === line)
    ),
    marks,
    ...(raw.editors && { editors: raw.editors }),
    skills: skills.map((line) => line.replace(/^(?:skills|навыки):\s*/iu, '')),
    text: raw.text,
    acquisition: 'rendered-card-text',
  };
};

/** Fallback stays within observed card/role boundaries; page prose is never split heuristically. */
export const linkedinTextItem = (item) => {
  if (
    item.fallback !== true ||
    !Array.isArray(item.roles) ||
    item.roles.length > 200
  ) {
    invalid();
  }
  if (!item.roles.length) {
    return { parent: roleFrom(item, false), roles: [] };
  }
  const header = linesOf(item.heading);
  if (
    !header.length ||
    header.length > 4 ||
    header.some((line) => dateLine.test(line))
  ) {
    invalid();
  }
  return {
    parent: { title: header[0], text: item.heading },
    roles: item.roles.map((role) => roleFrom(role, true)),
  };
};
