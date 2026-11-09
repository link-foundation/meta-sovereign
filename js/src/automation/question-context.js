// Configured context groups work for currencies, work formats, or other owner
// vocabulary. A different choice cannot inherit another choice's fields.
import { asksQuestion, questionKey } from './question-match.js';
import { historyOrder } from '../replies/history-order.js';
import { normalizeAnswerProfile, PROFILE_KEY } from './question-profile.js';

const identifier = (value) =>
  typeof value === 'string' && PROFILE_KEY.test(value);
const unique = (values) => new Set(values).size === values.length;
const normalizeChoice = (choice) => {
  if (!identifier(choice?.id)) {
    throw new Error('context choice needs an identifier');
  }
  if (
    !Array.isArray(choice.keywords) ||
    !choice.keywords.length ||
    choice.keywords.length > 20 ||
    choice.keywords.some(
      (word) =>
        typeof word !== 'string' || word.length > 200 || !questionKey(word)
    )
  ) {
    throw new Error(
      'context choice needs 1 to 20 keywords of at most 200 characters'
    );
  }
  return {
    id: choice.id,
    keywords: [...new Set(choice.keywords.map((word) => word.trim()))],
    profile: normalizeAnswerProfile(choice.profile),
  };
};
const normalizeGroup = (group) => {
  if (
    !identifier(group?.key) ||
    !Array.isArray(group.choices) ||
    !group.choices.length ||
    group.choices.length > 10
  ) {
    throw new Error('context group needs an identifier and 1 to 10 choices');
  }
  const choices = group.choices.map(normalizeChoice);
  if (!unique(choices.map((choice) => choice.id))) {
    throw new Error('context choice identifiers must be unique');
  }
  const fallback = group.default ?? null;
  if (fallback !== null && !choices.some((choice) => choice.id === fallback)) {
    throw new Error('context default must name a configured choice');
  }
  return { key: group.key, default: fallback, choices };
};
export const normalizeAnswerContexts = (input = []) => {
  if (
    !Array.isArray(input) ||
    input.length > 10 ||
    new TextEncoder().encode(JSON.stringify(input)).length > 131072
  ) {
    throw new Error(
      'answer contexts must contain at most 10 groups and 128 KiB'
    );
  }
  const groups = input.map(normalizeGroup);
  const owners = new Map();
  for (const group of groups) {
    const fields = [
      group.key,
      ...group.choices.flatMap((choice) => Object.keys(choice.profile)),
    ];
    for (const field of fields) {
      if (owners.has(field) && owners.get(field) !== group) {
        throw new Error(
          `context field ${field} belongs to more than one group`
        );
      }
      owners.set(field, group);
    }
  }
  if (!unique(groups.map((group) => group.key))) {
    throw new Error('context group identifiers must be unique');
  }
  return groups;
};

export const normalizeAnswerEnvironment = ({
  recent = [],
  vacancy = {},
} = {}) => {
  if (!Array.isArray(recent) || recent.length > 20) {
    throw new Error(
      'recent context must contain at most 20 messages, newest first'
    );
  }
  const messages = recent.map((entry) => {
    const text = typeof entry === 'string' ? entry : entry?.text;
    const evidence = typeof entry === 'string' ? undefined : entry?.evidence;
    if (
      typeof text !== 'string' ||
      text.length > 6000 ||
      (evidence !== undefined &&
        (typeof evidence !== 'string' || evidence.length > 500))
    ) {
      throw new Error('invalid recent answer context');
    }
    return { text, ...(evidence ? { evidence } : {}) };
  });
  if (!vacancy || typeof vacancy !== 'object' || Array.isArray(vacancy)) {
    throw new Error('invalid vacancy answer context');
  }
  const known = {};
  for (const field of ['pay', 'description', 'evidence']) {
    const value = vacancy[field] ?? '';
    if (
      typeof value !== 'string' ||
      value.length > (field === 'evidence' ? 500 : 6000)
    ) {
      throw new Error('invalid vacancy answer context');
    }
    known[field] = value;
  }
  return { recent: messages, vacancy: known };
};

const mentions = (group, text) => {
  const words = ` ${questionKey(text)} `;
  return group.choices.filter((choice) =>
    choice.keywords.some((keyword) =>
      words.includes(` ${questionKey(keyword)} `)
    )
  );
};
const choose = (group, question, environment) => {
  const explicit = mentions(group, question);
  if (explicit.length === 1) {
    return { choice: explicit[0], source: 'question' };
  }
  let ambiguous = explicit.length > 1;
  for (const entry of environment.recent) {
    const matches = mentions(group, entry.text);
    if (matches.length === 1) {
      return {
        choice: matches[0],
        source: 'conversation',
        evidence: entry.evidence,
      };
    }
    // Do not reach an older topic through a new unrelated/ambiguous question.
    if (matches.length > 1 || asksQuestion(entry.text)) {
      ambiguous ||= matches.length > 1;
      break;
    }
  }
  for (const [field, source] of [
    ['pay', 'vacancy-pay'],
    ['description', 'vacancy-description'],
  ]) {
    const matches = mentions(group, environment.vacancy[field]);
    if (matches.length === 1) {
      return {
        choice: matches[0],
        source,
        evidence: environment.vacancy.evidence || undefined,
      };
    }
    if (matches.length > 1) {
      return { source: 'ambiguous' };
    }
  }
  // An ambiguous explicit request must not silently select a default.
  if (ambiguous) {
    return { source: 'ambiguous' };
  }
  return {
    choice: group.choices.find((choice) => choice.id === group.default),
    source: group.default ? 'default' : 'missing',
  };
};
export const resolveAnswerContexts = (question, options) => {
  const profile = { ...options.profile };
  const contexts = [];
  const environment = normalizeAnswerEnvironment(options);
  for (const group of options.contexts ?? []) {
    for (const field of [
      group.key,
      ...group.choices.flatMap((choice) => Object.keys(choice.profile)),
    ]) {
      delete profile[field];
    }
    const { choice, ...trace } = choose(group, question, environment);
    if (choice) {
      profile[group.key] = choice.id;
      Object.assign(profile, choice.profile);
    }
    contexts.push({ key: group.key, choice: choice?.id ?? null, ...trace });
  }
  return { profile, contexts };
};

// Actual archived turns are newest first, with barriers kept before filtering.
// No history text is included in diagnostic traces, only message identifiers.
export const answerEnvironmentFromMessages = (messages, latest) => {
  const at = Date.parse(latest.timestamp);
  const sorted = messages
    .filter(
      (message) =>
        message.id !== latest.id &&
        message.source === latest.source &&
        String(message.chat) === String(latest.chat)
    )
    .toSorted((a, b) => historyOrder(b, a));
  const recent = [];
  for (const message of sorted.slice(0, 20)) {
    const time = Date.parse(message.timestamp);
    if (
      !Number.isFinite(time) ||
      time > at ||
      at - time > 86400000 ||
      message.service ||
      message.deleted ||
      message.pending ||
      message.failed ||
      ['unknown', 'failed', 'pending', 'sending'].includes(
        message.delivery ?? message.status
      ) ||
      typeof message.body !== 'string' ||
      message.body.length > 6000
    ) {
      break;
    }
    recent.push({ text: message.body, evidence: message.id });
  }
  // Provider adapters may attach context only from this turn's actual vacancy.
  let vacancy = {};
  try {
    vacancy = normalizeAnswerEnvironment({
      vacancy: latest.answerContext,
    }).vacancy;
  } catch {
    // Malformed imported context is unavailable; never use unbounded metadata.
  }
  return { recent, vacancy };
};
