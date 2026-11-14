import { technologyKey } from './cv-technology-names.js';

const cyrillic = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
const latin = [
  'a',
  'b',
  'v',
  'g',
  'd',
  'e',
  'e',
  'zh',
  'z',
  'i',
  'y',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'r',
  's',
  't',
  'u',
  'f',
  'h',
  'ts',
  'ch',
  'sh',
  'sch',
  '',
  'y',
  '',
  'e',
  'yu',
  'ya',
];
const brandWords = (company) =>
  technologyKey(company)
    .replace(/[а-яё]/gu, (letter) => latin[cyrillic.indexOf(letter)])
    .replace(/onlayn/gu, 'online')
    .replace(/dzh|dge/gu, 'j')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(
      (word) =>
        word.length >= 5 &&
        ![
          'internet',
          'online',
          'store',
          'magazin',
          'podarkov',
          'limited',
          'company',
        ].includes(word)
    );
const sameBrand = (a, b) =>
  technologyKey(a) === technologyKey(b) ||
  brandWords(a).some((word) => brandWords(b).includes(word));
const sameDates = (a, b) =>
  a.start !== null &&
  a.start === b.start &&
  a.end === b.end &&
  a.current === b.current;

/** A candidate must be unique in both directions; dates alone prove nothing. */
export const technologyJobPairs = (sources) => {
  const [left, right] = sources.map((source) => source.cv.jobs);
  const candidates = left.map((job) =>
    right.flatMap((other, index) =>
      sameDates(job, other) && sameBrand(job.company, other.company)
        ? [index]
        : []
    )
  );
  const pairs = [];
  const blockers = [];
  for (const [index, matches] of candidates.entries()) {
    if (
      matches.length === 1 &&
      candidates.filter((row) => row.includes(matches[0])).length === 1
    ) {
      pairs.push([index, matches[0]]);
    } else {
      blockers.push({
        code: matches.length ? 'counterpart-ambiguous' : 'counterpart-missing',
        language: sources[0].cv.language,
        index,
        candidates: matches,
      });
    }
  }
  for (let index = 0; index < right.length; index++) {
    if (!pairs.some((pair) => pair[1] === index)) {
      blockers.push({
        code: 'counterpart-unresolved',
        language: sources[1].cv.language,
        index,
        candidates: candidates.flatMap((row, position) =>
          row.includes(index) ? [position] : []
        ),
      });
    }
  }
  return { pairs, blockers };
};
