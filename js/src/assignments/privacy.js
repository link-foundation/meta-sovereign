import { assignmentFailure, assignmentText } from './validation.js';

const words = (value) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
const compact = (value) => words(value).join('');
const transliterate = (value) => {
  const source = 'абвгдеёзийклмнопрстуфхыэ';
  const target = [
    'a',
    'b',
    'v',
    'g',
    'd',
    'e',
    'yo',
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
    'y',
    'e',
  ];
  const combined = {
    ж: 'zh',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ю: 'yu',
    я: 'ya',
    ь: '',
    ъ: '',
  };
  return [...value]
    .map(
      (letter) => combined[letter] ?? target[source.indexOf(letter)] ?? letter
    )
    .join('');
};
const sixWords = (tokens, index) => tokens.slice(index, index + 6).join(' ');

export const assignmentCopiedPhrase = (original, output) => {
  const source = words(original);
  const target = words(output);
  const phrases = new Set();
  for (let i = 0; i + 6 <= source.length; i++) {
    phrases.add(sixWords(source, i));
  }
  for (let i = 0; i + 6 <= target.length; i++) {
    if (phrases.has(sixWords(target, i))) {
      return true;
    }
  }
  return false;
};

// Strip common Russian case endings from known names; also check joined forms.
export const assignmentEmployerAliases = (names) => [
  ...new Set(
    names.flatMap((name) => {
      const normalized = compact(name);
      const stem = normalized.replace(
        /(?:ами|ями|ого|ему|ом|ем|ой|ей|ов|ев|ах|ях|а|я|ы|и|у|ю|е|о|ь)$/u,
        ''
      );
      return [
        normalized,
        stem,
        transliterate(normalized),
        transliterate(stem),
      ].filter((part) => part.length >= 3);
    })
  ),
];

const englishText = (value) => {
  const letters = value.match(/\p{L}/gu) ?? [];
  const latin = value.match(/\p{Script=Latin}/gu) ?? [];
  const prose = words(value);
  const common = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'to',
    'for',
    'of',
    'in',
    'with',
    'is',
    'be',
    'that',
    'this',
    'should',
    'must',
    'from',
    'as',
  ]);
  return (
    letters.length >= 20 &&
    latin.length / letters.length >= 0.97 &&
    prose.filter((word) => common.has(word)).length >= 3
  );
};

const shortEmployerPresent = (names, output) => {
  const tokens = new Set(words(output));
  return names.some((name) => {
    const alias = compact(name);
    return (
      alias.length < 3 &&
      (tokens.has(alias) || tokens.has(transliterate(alias)))
    );
  });
};

/** Conservative local checks; the owner still reviews semantic fidelity. */
export const checkAssignmentRestatement = ({
  original,
  employers,
  title,
  body,
  extra = '',
}) => {
  assignmentText(title, 200, 'issue title');
  assignmentText(body, 24000, 'issue body');
  const output = `${title}\n${body}\n${extra}`;
  const normalized = compact(output);
  if (
    shortEmployerPresent(employers, output) ||
    assignmentEmployerAliases(employers).some((alias) =>
      normalized.includes(alias)
    )
  ) {
    throw assignmentFailure(
      'employer',
      'Remove employer names and their variants from the issue.'
    );
  }
  if (!englishText(output)) {
    throw assignmentFailure(
      'english',
      'The public issue must use English prose.'
    );
  }
  if (assignmentCopiedPhrase(original, output)) {
    throw assignmentFailure(
      'copied',
      'Rewrite the issue without six consecutive source words.'
    );
  }
};
