import { jobsFailure } from './options.js';

const patterns = [
  ['email', /[\p{L}\d._%+-]+@[\p{L}\d.-]+\.[\p{L}]{2,}/iu],
  ['phone', /\+?\d[\d\s().-]{8,}\d/u],
  [
    'messenger',
    /(?:t\.me|telegram\.me|wa\.me)\/|(?:telegram|телеграм|whatsapp)\s*[:@]/iu,
  ],
  [
    'birth-date',
    /дата\s+рождения|родил(?:ся|ась)|date\s+of\s+birth|\bborn\b/iu,
  ],
  [
    'salary',
    /(?:желаемая\s+)?зарплат|оклад|(?:desired\s+)?salary|\d[\d\s,.]*\s*(?:₽|руб|\$|USD\b|EUR\b)|(?:\$|€|£)\s*\d/iu,
  ],
];

/** Only kinds are disclosed. Employer archive timestamps are not phone numbers. */
export const resumePrivateKinds = (value) =>
  patterns.flatMap(([kind, pattern]) => {
    const candidate =
      kind === 'phone'
        ? value.replace(
            /\b(?:https?:\/\/)?web\.archive\.org\/web\/\d{14}(?:[a-z_]+)?\//giu,
            'web.archive.org/web/archive/'
          )
        : value;
    return pattern.test(candidate) ? [kind] : [];
  });

export const resumeSanitizer = () => {
  const kinds = new Set();
  let removedLines = 0;
  return {
    prose(value) {
      return value
        .split('\n')
        .filter((line) => {
          const found = resumePrivateKinds(line);
          found.forEach((kind) => kinds.add(kind));
          removedLines += Number(found.length > 0);
          return found.length === 0;
        })
        .join('\n')
        .trim();
    },
    scalar(value) {
      if (resumePrivateKinds(value).length) {
        throw jobsFailure(
          'resume-private',
          'Remove private details from structured CV fields before exporting.'
        );
      }
      return value;
    },
    report: () => ({ removedLines, kinds: [...kinds].sort() }),
  };
};
