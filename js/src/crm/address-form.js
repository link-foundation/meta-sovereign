/**
 * Address-form detection (issue #31, R-W3..R-W5).
 *
 * Russian — like Chinese, Hindi and most European languages — has two
 * ways to say "you": the familiar "ты" and the polite "вы". A message
 * that reopens an old conversation has to keep whichever one the two
 * people used, so the planner reads the dialog and counts markers of
 * each form.
 *
 * Markers are word-level regexes, grouped by language. Each one is a
 * whole word (Unicode-aware boundaries, because `\b` only knows ASCII
 * letters), so "вы" never fires inside "выход" and "ты" never fires
 * inside "работы". The marker table is data, so callers can add their
 * own rules — including `pattern:*` links from the Patterns screen
 * labelled `address:informal` or `address:formal`.
 *
 * Deliberately left out: Russian 2nd-person-plural verb endings
 * (`-ете`/`-ите`), because the same endings close dozens of nouns in
 * the prepositional case ("в интернете", "на сайте"). Only a curated
 * list of polite verbs is counted. The singular endings `-ешь`/`-ишь`
 * have no such collisions and are counted as a morphological rule.
 */

export const ADDRESS_FORMS = Object.freeze(['informal', 'formal']);

// A word boundary that understands Cyrillic and Devanagari. Devanagari
// vowel signs and viramas are combining marks (\p{M}), so they count as
// part of a word.
const W = '[\\p{L}\\p{M}\\p{N}_]';
const word = (alternatives) =>
  new RegExp(`(?<!${W})(?:${alternatives})(?!${W})`, 'giu');

/**
 * Built-in marker table. `weight` lets weak evidence (a greeting) count
 * less than a pronoun.
 */
export const defaultAddressRules = Object.freeze([
  // --- Russian: ты ---------------------------------------------------
  {
    id: 'ru-ty-pronoun',
    language: 'ru',
    form: 'informal',
    weight: 1,
    regex: word('ты|тебя|тебе|тобой|тобою'),
  },
  {
    id: 'ru-ty-possessive',
    language: 'ru',
    form: 'informal',
    weight: 1,
    regex: word('тво(?:й|я|ё|е|и|его|ей|ему|им|их|ими|ю|ем|ём|ею)'),
  },
  {
    // знаешь, можешь, хочешь, делаешь, говоришь, придёшь, учишься…
    id: 'ru-ty-verb',
    language: 'ru',
    form: 'informal',
    weight: 1,
    regex: word('\\p{Script=Cyrillic}{2,}[еёи]шь(?:ся)?'),
  },
  {
    id: 'ru-ty-imperative',
    language: 'ru',
    form: 'informal',
    weight: 0.5,
    regex: word(
      'скажи|подскажи|напиши|посмотри|извини|прости|слушай|давай|позвони|глянь'
    ),
  },
  {
    // Not "пока" (also "not yet") nor "здорово" (also "great").
    id: 'ru-ty-greeting',
    language: 'ru',
    form: 'informal',
    weight: 0.5,
    regex: word('привет|приветик|хай'),
  },
  // --- Russian: вы ---------------------------------------------------
  {
    id: 'ru-vy-pronoun',
    language: 'ru',
    form: 'formal',
    weight: 1,
    regex: word('вы|вас|вам|вами'),
  },
  {
    id: 'ru-vy-possessive',
    language: 'ru',
    form: 'formal',
    weight: 1,
    regex: word('ваш(?:а|е|и|его|ей|ему|им|их|ими|у|ем)?'),
  },
  {
    id: 'ru-vy-verb',
    language: 'ru',
    form: 'formal',
    weight: 1,
    regex: word(
      'знаете|можете|хотите|скажете|сможете|будете|подскажете|думаете|планируете|ищете|работаете'
    ),
  },
  {
    id: 'ru-vy-imperative',
    language: 'ru',
    form: 'formal',
    weight: 0.5,
    regex: word(
      'скажите|подскажите|напишите|посмотрите|извините|простите|позвоните|давайте'
    ),
  },
  {
    id: 'ru-vy-greeting',
    language: 'ru',
    form: 'formal',
    weight: 0.5,
    regex: word('здравствуйте|до свидания'),
  },
  // --- Chinese: 你 / 您 ------------------------------------------------
  // 你们 is the plural "you", which says nothing about politeness.
  {
    id: 'zh-ni',
    language: 'zh',
    form: 'informal',
    weight: 1,
    regex: /你(?!们)/gu,
  },
  { id: 'zh-nin', language: 'zh', form: 'formal', weight: 1, regex: /您/gu },
  // --- Hindi: तू / तुम / आप ----------------------------------------------
  {
    id: 'hi-tum',
    language: 'hi',
    form: 'informal',
    weight: 1,
    regex: word(
      'तू|तुम|तुम्हारा|तुम्हारी|तुम्हारे|तुम्हें|तुमको|तुमसे|तुमने|तेरा|तेरी|तेरे|तुझे|तुझको|तुझसे'
    ),
  },
  {
    id: 'hi-aap',
    language: 'hi',
    form: 'formal',
    weight: 1,
    regex: word('आप|आपका|आपकी|आपके|आपको|आपसे|आपने'),
  },
]);

const ADDRESS_LABEL = /^address:(informal|formal)$/;

const toRegex = (pattern, flags) => {
  if (pattern instanceof RegExp) {
    return pattern.global
      ? pattern
      : new RegExp(pattern.source, `${pattern.flags}g`);
  }
  const f = String(flags ?? 'iu');
  return new RegExp(String(pattern), f.includes('g') ? f : `${f}g`);
};

/**
 * Turn `pattern:*` links labelled `address:informal|formal` into extra
 * rules. A pattern whose regex does not compile is skipped, never fatal.
 */
export const addressRulesFromPatterns = (links = []) => {
  const rules = [];
  for (const link of links) {
    if (!link?.id?.startsWith('pattern:')) {
      continue;
    }
    const label = String(link.label ?? link.tokens?.[2] ?? '');
    const match = label.match(ADDRESS_LABEL);
    if (!match || !link.regex) {
      continue;
    }
    try {
      rules.push({
        id: link.id,
        language: 'custom',
        form: match[1],
        weight: Number(link.weight ?? 1),
        regex: toRegex(link.regex, link.flags),
      });
    } catch {
      // An invalid user pattern must not break planning.
    }
  }
  return rules;
};

const countMatches = (regex, text) => {
  regex.lastIndex = 0;
  let n = 0;
  while (regex.exec(text)) {
    n += 1;
    if (regex.lastIndex === 0) {
      break;
    }
  }
  regex.lastIndex = 0;
  return n;
};

/** Score one text: `{ informal, formal, hits: [{ rule, count }] }`. */
export const scoreAddressForm = (text, rules = defaultAddressRules) => {
  const score = { informal: 0, formal: 0, hits: [] };
  const body = String(text ?? '');
  if (!body) {
    return score;
  }
  for (const rule of rules) {
    const count = countMatches(rule.regex, body);
    if (count > 0) {
      score[rule.form] += count * (rule.weight ?? 1);
      score.hits.push({ rule: rule.id, form: rule.form, count });
    }
  }
  return score;
};

const round = (n) => Math.round(n * 100) / 100;

/**
 * Decide which form a dialog uses.
 *
 * `messages` are store links (`{ body, sender }`). The owner's own
 * messages count `selfWeight` times (2 by default): the new message is
 * the owner's, so how the owner addressed the contact matters most,
 * but a dialog where only the contact ever wrote still has an answer.
 * A tie, or no evidence at all, resolves to `fallback` — "formal"
 * unless told otherwise, because an unexpected "вы" is awkward while
 * an unexpected "ты" can be rude.
 */
// An explicit `undefined` (an unset CLI flag) must not hide a default.
export const definedOnly = (options = {}) =>
  Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined)
  );

const DETECT_DEFAULTS = {
  isSelf: (sender) => sender === 'me',
  rules: defaultAddressRules,
  selfWeight: 2,
  fallback: 'formal',
};

const tally = (messages, { isSelf, rules, selfWeight }) => {
  const totals = { informal: 0, formal: 0 };
  const byRule = new Map();
  let evidenceMessages = 0;
  for (const message of messages) {
    const score = scoreAddressForm(message?.body, rules);
    if (score.hits.length === 0) {
      continue;
    }
    evidenceMessages += 1;
    const factor = isSelf(message.sender) ? selfWeight : 1;
    totals.informal += score.informal * factor;
    totals.formal += score.formal * factor;
    for (const hit of score.hits) {
      byRule.set(hit.rule, (byRule.get(hit.rule) ?? 0) + hit.count);
    }
  }
  return { totals, byRule, evidenceMessages };
};

const verdict = ({ informal, formal }, fallback) => {
  if (informal + formal === 0) {
    return { form: fallback, reason: 'no-evidence' };
  }
  if (informal === formal) {
    return { form: fallback, reason: 'tie' };
  }
  return {
    form: informal > formal ? 'informal' : 'formal',
    reason: 'majority',
  };
};

export const detectAddressForm = (messages = [], options = {}) => {
  const opts = { ...DETECT_DEFAULTS, ...definedOnly(options) };
  const { totals, byRule, evidenceMessages } = tally(messages, opts);
  const sum = totals.informal + totals.formal;
  return {
    ...verdict(totals, opts.fallback),
    confidence: sum > 0 ? round(Math.max(...Object.values(totals)) / sum) : 0,
    scores: { informal: round(totals.informal), formal: round(totals.formal) },
    evidenceMessages,
    rules: Object.fromEntries(byRule),
  };
};
