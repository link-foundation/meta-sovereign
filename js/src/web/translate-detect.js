// Which language a message is in, cheaply, on the page (R-Y213; learned,
// never copied): the translate bar offers itself when a chat's recent
// incoming messages are mostly in a language other than the page's.
// Scripts tell most languages apart; for Latin a few stopword sets tell
// the common ones. A text it cannot tell has no language (`null`).

const SCRIPTS = [
  ['ja', /[぀-ヿ]/g],
  ['ko', /[가-힯ᄀ-ᇿ]/g],
  ['zh', /[一-鿿]/g],
  ['hi', /[ऀ-ॿ]/g],
  ['ar', /[؀-ۿ]/g],
  ['he', /[֐-׿]/g],
  ['el', /[Ͱ-Ͽ]/g],
  ['th', /[฀-๿]/g],
  ['ru', /[Ѐ-ӿ]/g],
  ['latin', /[A-Za-zÀ-ɏ]/g],
];

const STOPWORDS = {
  en: 'the and is are you that this with for not have was what it of to in on',
  es: 'el la los las que y es en un una por con no para como pero esta muy',
  de: 'der die das und ist nicht ich du ein eine mit auf für den dem zu von',
  fr: 'le la les des est et une un que pas pour dans vous nous je il avec',
  it: 'il lo gli che di è un una per non con sono ma come più anche questo',
  pt: 'o a os as que de e é um uma para não com por mais como mas você',
  tr: 'bir ve bu için ne ben sen değil çok ama daha gibi da de mi var',
  pl: 'nie to się jest na że w z do jak ale tak co czy po już bardzo',
};
const WORDS = Object.fromEntries(
  Object.entries(STOPWORDS).map(([code, list]) => [
    code,
    new Set(list.split(' ')),
  ])
);
// Letters that only some Cyrillic languages have.
const UKRAINIAN = /[іїєґІЇЄҐ]/;
const MIN_LETTERS = 4;

const count = (text, pattern) => (text.match(pattern) ?? []).length;

const latinLanguage = (text) => {
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  let best = null;
  let top = 0;
  for (const [code, set] of Object.entries(WORDS)) {
    const hits = words.filter((w) => set.has(w)).length;
    if (hits > top) {
      best = code;
      top = hits;
    }
  }
  return top >= 1 ? best : null;
};

/** The language code of `text` (ru, zh, en, …), or null when unclear. */
export const detectLanguage = (text) => {
  const plain = String(text ?? '').replace(/https?:\/\/\S+/g, ' ');
  let winner = null;
  let most = 0;
  for (const [code, pattern] of SCRIPTS) {
    const n = count(plain, pattern);
    if (n > most) {
      winner = code;
      most = n;
    }
  }
  if (most < MIN_LETTERS && !(winner === 'zh' || winner === 'ja')) {
    return null;
  }
  if (winner === 'ja' || winner === 'ko') {
    return winner;
  }
  if (winner === 'zh') {
    // Kana in a Han text is Japanese.
    return count(plain, SCRIPTS[0][1]) > 0 ? 'ja' : 'zh';
  }
  if (winner === 'ru') {
    return UKRAINIAN.test(plain) ? 'uk' : 'ru';
  }
  return winner === 'latin' ? latinLanguage(plain) : winner;
};

const base = (code) =>
  String(code ?? '')
    .split('-')[0]
    .toLowerCase();

/**
 * The language most of `texts` are in when it is not `ui` and not one of
 * `skipped`, else null. At least two texts must be told, and more than
 * half of them must agree.
 */
export const foreignLanguage = (texts, ui, skipped = []) => {
  const found = texts.map(detectLanguage).filter(Boolean);
  if (found.length < 2) {
    return null;
  }
  const tally = new Map();
  for (const code of found) {
    tally.set(code, (tally.get(code) ?? 0) + 1);
  }
  const [code, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n * 2 <= found.length) {
    return null;
  }
  return code === base(ui) || skipped.map(base).includes(code) ? null : code;
};
