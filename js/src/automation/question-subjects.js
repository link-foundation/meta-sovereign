// Literal subject names distinguish otherwise nearly identical questions.
// This bounded catalog is shared by chat and forms; it is not a semantic model.
const names = [
  ['go', ['go', 'golang']],
  ['csharp', ['c#', 'с#', 'csharp', 'c-sharp']],
  ['cpp', ['c++', 'с++', 'cpp']],
  ['c', ['c', 'си']],
  ['javascript', ['javascript', 'js', 'джаваскрипт']],
  ['typescript', ['typescript', 'ts']],
  ['java', ['java', 'джава']],
  ['python', ['python', 'питон']],
  ['rust', ['rust']],
  ['ruby', ['ruby']],
  ['php', ['php']],
  ['swift', ['swift']],
  ['kotlin', ['kotlin']],
  ['scala', ['scala']],
  ['docker', ['docker', 'докер']],
  ['kubernetes', ['kubernetes', 'k8s']],
  ['mongodb', ['mongodb', 'mongo']],
  ['postgresql', ['postgresql', 'postgres']],
  ['mysql', ['mysql']],
  ['redis', ['redis']],
  ['aws', ['aws']],
  ['azure', ['azure']],
  ['gcp', ['gcp']],
  ['react', ['react', 'reactjs']],
  ['angular', ['angular']],
  ['vue', ['vue', 'vuejs']],
  ['git', ['git', 'гит']],
  ['github', ['github']],
  ['linkedin', ['linkedin']],
  ['telegram', ['telegram', 'телеграм']],
  ['lead', ['lead', 'тимлид', 'техлид']],
  ['junior', ['junior']],
  ['senior', ['senior']],
  ['usd', ['usd', 'доллар', 'долларов', 'dollar', 'dollars']],
  [
    'rub',
    [
      'rub',
      'rur',
      'руб',
      'рублей',
      'рублях',
      'рубли',
      'рубль',
      'rubles',
      'roubles',
    ],
  ],
  ['eur', ['eur', 'euro', 'euros', 'евро']],
  ['gbp', ['gbp']],
  ['inr', ['inr']],
  ['cny', ['cny', 'rmb']],
  ['vnd', ['vnd']],
  ['jpy', ['jpy']],
  ['employment:ip', ['ип']],
  ['employment:gph', ['гпх']],
  ['employment:self', ['самозанятый', 'самозанятыми', 'самозанятость']],
];
const aliases = new Map(
  names.flatMap(([key, values]) => values.map((name) => [name, key]))
);
const symbols = [
  ['$', 'usd'],
  ['₽', 'rub'],
  ['€', 'eur'],
  ['£', 'gbp'],
  ['₹', 'inr'],
  ['¥', 'currency:yen-yuan'],
];
const ignoredNames = new Set(['fulltime', 'parttime', 'remote', 'username']);
const technicalGo = (text) =>
  /опыт|разработ|программ|коммерческ|experience|develop|program|engineer|\bwith\b|\busing\b|开发|经验|अनुभव/iu.test(
    text
  );

const textFor = (input) =>
  String(input ?? '')
    .normalize('NFKC')
    .replace(/@[\p{L}\p{N}_]+/gu, '');
const tokensFor = (text) =>
  text.match(/[\p{L}][\p{L}\p{N}]*(?:-[\p{L}\p{N}]+)*(?:[+#]{1,2})?/gu) ?? [];
const subjectTerms = (text, named) => {
  const subjects = new Set();
  const tokens = tokensFor(text);
  for (const token of tokens) {
    const key = token.toLowerCase();
    const known = aliases.get(key);
    if (known) {
      if (key !== 'go' || technicalGo(text)) {
        subjects.add(known);
      }
    } else if (named.has(key)) {
      // Preserve previously unseen names such as FrobDB without classifying
      // every ordinary capitalized word in an English question as a name.
      subjects.add(`name:${key}`);
    }
  }
  for (const [symbol, key] of symbols) {
    if (text.includes(symbol)) {
      subjects.add(key);
    }
  }
  if (/(?:^|[^\p{L}])тк\s*рф(?:$|[^\p{L}])/iu.test(text)) {
    subjects.add('employment:tk');
  }
  return subjects;
};

export const sameQuestionSubjects = (left, right) => {
  const texts = [textFor(left), textFor(right)];
  const named = new Set(
    texts
      .flatMap(tokensFor)
      .filter(
        (token) =>
          /[a-z][A-Z]/u.test(token) && !ignoredNames.has(token.toLowerCase())
      )
      .map((token) => token.toLowerCase())
  );
  const [a, b] = texts.map((text) => subjectTerms(text, named));
  return a.size === b.size && [...a].every((key) => b.has(key));
};
