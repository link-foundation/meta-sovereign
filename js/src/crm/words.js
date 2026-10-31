/**
 * Words and the gaps between them, read by a tiny parsing expression
 * grammar — the temporary way to compare questions (R-Y57) until
 * link-assistant/formal-ai can tell two of the same meaning apart from
 * two that only look alike (link-assistant/formal-ai#1330):
 *
 *   text   ← (word / number / gap)*
 *   word   ← letter (letter / mark / inner)*
 *   inner  ← [-'’] &letter            "кто-то", "don't" stay one word
 *   number ← digit+ ([.,:] digit+)*   "2.5", "10:30"
 *   gap    ← (!letter !digit .)+      spaces, punctuation, emoji
 *
 * Every rule is an anchored (sticky) pattern tried in order, as a PEG
 * tries its choices, so the text is read once, left to right, and every
 * character belongs to exactly one token.
 */

const RULES = [
  ['word', /\p{L}(?:[\p{L}\p{M}]|[-'’](?=\p{L}))*/uy],
  ['number', /\p{N}+(?:[.,:]\p{N}+)*/uy],
  ['gap', /[^\p{L}\p{N}]+/uy],
];

/** The text as `{ kind, text, at }` tokens, gaps included. */
export const tokensOf = (text) => {
  const input = String(text ?? '');
  const tokens = [];
  let at = 0;
  while (at < input.length) {
    const match = RULES.map(([kind, rule]) => {
      rule.lastIndex = at;
      const found = rule.exec(input);
      return found ? { kind, text: found[0], at } : null;
    }).find(Boolean) ?? { kind: 'gap', text: input[at], at }; // a lone mark
    tokens.push(match);
    at += match.text.length;
  }
  return tokens;
};

/** One spelling for one word: lower case, "ё" as "е", "’" as "'". */
export const foldWord = (word) =>
  String(word).toLocaleLowerCase().replaceAll('ё', 'е').replaceAll('’', "'");

/** The words (and numbers) of a text, folded; the gaps dropped. */
export const wordsOf = (text) =>
  tokensOf(text)
    .filter((token) => token.kind !== 'gap')
    .map((token) => foldWord(token.text));

// Endings that change a word's form, not its meaning — longest first.
const ENDINGS = [
  ...'ующий ающий ешься ишься ется ится ются ятся ость ение ание иями ями ами ешь ишь ете ите ует ают яют ого его ому ему ыми ими ой ей ий ый ая яя ое ее ые ие ую юю ом ем ах ях ов ев ет ит ут ют ат ят ал ял ил ла ли ло ть ти а я о е ы и у ю ь'.split(
    ' '
  ),
  ...'ing ed es s ly'.split(' '),
];

/** A word without its ending, and at most five letters of it. */
export const stemOf = (word) => {
  const folded = foldWord(word);
  const ending = ENDINGS.find(
    (end) => folded.length - end.length >= 3 && folded.endsWith(end)
  );
  return (ending ? folded.slice(0, -ending.length) : folded).slice(0, 5);
};

/** The stems of a text's words, without the ones in `skip`. */
export const stemsOf = (text, skip = new Set()) =>
  new Set(
    wordsOf(text)
      .filter((word) => !skip.has(word))
      .map(stemOf)
  );

/** Shared stems over all stems: 1 the same, 0 nothing in common. */
export const overlap = (a, b) => {
  let shared = 0;
  for (const stem of a) {
    if (b.has(stem)) {
      shared++;
    }
  }
  const unionSize = a.size + b.size - shared;
  return unionSize === 0 ? 0 : shared / unionSize;
};

/** The same words, in any order and with any punctuation between. */
export const sameWords = (a, b) => {
  const [x, y] = [wordsOf(a).toSorted(), wordsOf(b).toSorted()];
  return x.length > 0 && x.length === y.length && x.every((w, i) => w === y[i]);
};
