// Review-only rewording: 40% character edits, 60% stemmed keyword overlap.
// Keep two DP rows and admit the complete finite cost before doing any work.
const MAX_CELLS = 1024 ** 2;
const ignored = new Set(
  (
    'the a an to of in on at for and or with is are was were do does did ' +
    'you your yours please what which how where when have has ' +
    'и или а но в на о об от до по с к у для при я мы вы ты ' +
    'ваш ваша ваше ваши вас вам ли как что какой какая какие ' +
    'пожалуйста сейчас данный момент'
  ).split(/\s+/u)
);
const generic = new Set(
  (
    'tell describe share experience experiences work working worked development ' +
    'подскажите укажите расскажите опишите поделитесь есть был была были ' +
    'опыт опыта опытом работа работы работе работу работали работал ' +
    'разработка разработки разработке разработку разрабатывали'
  ).split(/\s+/u)
);
const address = new Map([
  ['ты', 'вы'],
  ['тебя', 'вас'],
  ['тебе', 'вам'],
  ['тобой', 'вами'],
  ['твой', 'ваш'],
  ['твоя', 'ваша'],
  ['твое', 'ваше'],
  ['твои', 'ваши'],
  ['твоего', 'вашего'],
  ['твоей', 'вашей'],
  ['твоих', 'ваших'],
  ['твоим', 'вашим'],
  ['твоими', 'вашими'],
  ['твою', 'вашу'],
]);
const stem = (word) =>
  [...word].length > 6 ? [...word].slice(0, 5).join('') : word;
const genericStems = new Set([...generic].map(stem));
const words = (tokens, options) =>
  options?.caseSensitive
    ? tokens
    : tokens.map(
        (word) =>
          address.get(word) ??
          (word.length > 5 ? word.replace(/([еи])шь$/u, '$1те') : word)
      );
const keywords = (tokens) =>
  new Set(
    tokens.flatMap((word) =>
      [...word].length > 2 && !ignored.has(word.toLowerCase())
        ? [word, stem(word)]
        : []
    )
  );
const subjects = (tokens) =>
  new Set(
    [...keywords(tokens)]
      .filter((word) => !genericStems.has(stem(word.toLowerCase())))
      .map(stem)
  );
const shared = (a, b) => [...a].filter((word) => b.has(word)).length;
const keywordScore = (a, b) => {
  const left = keywords(a),
    right = keywords(b);
  const overlap = shared(left, right);
  const union = left.size + right.size - overlap;
  const sa = subjects(a),
    sb = subjects(b);
  const common = shared(sa, sb);
  // Similar boilerplate cannot make two unrelated subjects eligible.
  if (!common) {
    return null;
  }
  const coverage =
    common >= 2 && Math.max(common / sa.size, common / sb.size) >= 0.8
      ? (common / sa.size + common / sb.size) / 2
      : 0;
  return Math.max(union ? overlap / union : 0, coverage);
};
const editScore = (a, b) => {
  let previous = Uint16Array.from({ length: b.length + 1 }, (_, i) => i);
  let row = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(a[i - 1] !== b[j - 1])
      );
    }
    [row, previous] = [previous, row];
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
};

export const weightedQuestionSimilarity = (left, right, budget, options) => {
  const a = words(left, options),
    b = words(right, options);
  const x = [...a.join(' ')],
    y = [...b.join(' ')];
  const cost = x.length * y.length;
  if (cost > MAX_CELLS || (budget && cost > budget.remaining)) {
    if (budget) {
      budget.exhausted = true;
    }
    return 0;
  }
  if (budget) {
    budget.remaining -= cost;
  }
  const score = keywordScore(a, b);
  return score === null ? 0 : 0.4 * editScore(x, y) + 0.6 * score;
};
