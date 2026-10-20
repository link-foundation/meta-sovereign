/**
 * What a conversation tells about the person on the other side
 * (R-Y50 .. R-Y53), learned from the stored history only:
 *
 *   - the questions asked and their answers (either side asking);
 *   - how the two address each other, "ты" or "вы": an agreement
 *     ("на ты?" — "давай") wins over the form simply used;
 *   - their occupation, position and workplace, from what they said
 *     about themselves or answered when asked;
 *   - their accounts elsewhere (LinkedIn, GitHub, …), from links they
 *     sent themselves.
 *
 * Pure: messages in (`{ id, sender, body, timestamp }`, ours with
 * sender `me`), facts out. Nothing here reads the network; whether a
 * GitHub account links back is ./github-check.js.
 */

import { detectAddressForm } from './address-form.js';

const DAY_MS = 24 * 60 * 60_000;
const MAX_VALUE = 120;
const ANSWER_PARTS = 3;

// Word boundaries that know Cyrillic (`\b` knows only ASCII letters).
const W = '[\\p{L}\\p{M}\\p{N}_]';
const phrase = (source) => new RegExp(`(?<!${W})(?:${source})(?!${W})`, 'iu');

const textOf = (message) => String(message?.body ?? '').trim();
const timeOf = (message) => Date.parse(message?.timestamp ?? '') || 0;
const cut = (text, size = MAX_VALUE) =>
  text.length > size ? `${text.slice(0, size - 1)}…` : text;

const startsWith = (source) => new RegExp(`^(?:${source})(?!${W})`, 'iu');

const QUESTION_START = startsWith(
  [
    'как',
    'что',
    'чем',
    'где',
    'куда',
    'откуда',
    'когда',
    'почему',
    'зачем',
    'кто',
    'кем',
    'какой',
    'какая',
    'какое',
    'какие',
    'сколько',
    'можно',
    'нельзя ли',
    'не подскажете',
    'подскажи',
    'подскажите',
    'how',
    'what',
    'where',
    'when',
    'why',
    'who',
    'which',
    'do you',
    'did you',
    'are you',
    'can you',
    'could you',
    'would you',
    'is there',
    'have you',
  ].join('|')
);

/** Whether a message asks something. */
export const isQuestion = (text) => {
  const t = String(text ?? '').trim();
  if (!t) {
    return false;
  }
  if (t.includes('?')) {
    return true;
  }
  // "Как дела" asks without a mark; "Что ж, ладно." does not ask.
  return t.length <= 120 && !/[.!]$/u.test(t) && QUESTION_START.test(t);
};

/**
 * What a question is about. Each is a list of phrases; the first that
 * matches names the question's intent.
 */
export const QUESTION_INTENTS = Object.freeze({
  address: phrase(
    'на (?:ты|вы)|перейд\\p{L}* на ты|по имени|on (?:a )?first[- ]name'
  ),
  work: phrase(
    [
      'где (?:ты |вы )?(?:сейчас )?работа\\p{L}*',
      'кем (?:ты |вы )?(?:сейчас )?работа\\p{L}*',
      'чем (?:ты |вы )?(?:сейчас )?занима\\p{L}*',
      '(?:кака\\p{L}|тво\\p{L}|ваш\\p{L}*) должност\\p{L}*',
      'професси\\p{L}*',
      'в какой компании',
      'what do you do',
      'where do you work',
      '(?:what|which) company',
      'your (?:job|role|position|occupation)',
    ].join('|')
  ),
  location: phrase(
    'откуда (?:ты|вы)|где (?:ты|вы) (?:живёшь|живешь|живёте|живете)|в каком городе|where (?:are you from|do you live)'
  ),
  accounts: phrase(
    'linkedin|линкедин|линкедине|github|гитхаб\\p{L}*|e-?mail|почт(?:а|у|ы|ой|е)|профил\\p{L}*|telegram|телеграм\\p{L}*'
  ),
  // When to talk (not why, nor whether).
  meeting: phrase(
    [
      'когда (?:созвон|встрет|поговор|увид|спиш)\\p{L}*',
      'в какое время',
      'во сколько',
      'когда (?:тебе|вам) удобно',
      'what time',
      'when (?:can|shall|should|could) we (?:call|meet|talk)',
      'when are you free',
    ].join('|')
  ),
});

/** The intent of a question, or null. */
export const intentOf = (text) =>
  Object.entries(QUESTION_INTENTS).find(([, regex]) =>
    regex.test(String(text ?? ''))
  )?.[0] ?? null;

const sideOf = (message, isSelf) => (isSelf(message.sender) ? 'me' : 'them');

const asked = (message, isSelf) => ({
  id: message.id,
  at: message.timestamp ?? null,
  by: sideOf(message, isSelf),
  text: cut(textOf(message), 400),
});

// The other side's messages after a question, until the asker speaks
// again, within a day; joined as one answer.
const answerAfter = (sorted, index, isSelf) => {
  const question = sorted[index];
  const side = sideOf(question, isSelf);
  const parts = [];
  for (let i = index + 1; i < sorted.length; i += 1) {
    const next = sorted[i];
    if (timeOf(next) - timeOf(question) > DAY_MS) {
      break;
    }
    // The asker again, or the other side asking back: the answer ends.
    const asksBack = parts.length > 0 && isQuestion(textOf(next));
    if (sideOf(next, isSelf) === side || asksBack) {
      if (parts.length > 0) {
        break;
      }
      continue;
    }
    if (textOf(next)) {
      parts.push(next);
    }
    if (parts.length >= ANSWER_PARTS) {
      break;
    }
  }
  return parts.length === 0
    ? null
    : {
        id: parts[0].id,
        at: parts[0].timestamp ?? null,
        text: cut(parts.map(textOf).join('\n'), 400),
      };
};

const byTime = (messages) =>
  messages
    .filter((m) => m && typeof m.body === 'string')
    .toSorted((a, b) => timeOf(a) - timeOf(b));

/**
 * Every question in the conversation with its answer (null when none
 * came within a day), oldest first: `{ question, answer, intent }`.
 */
export const questionAnswers = (
  messages = [],
  { isSelf = (s) => s === 'me' } = {}
) => {
  const sorted = byTime(messages);
  const pairs = [];
  sorted.forEach((message, index) => {
    if (isQuestion(textOf(message))) {
      pairs.push({
        question: asked(message, isSelf),
        answer: answerAfter(sorted, index, isSelf),
        intent: intentOf(textOf(message)),
      });
    }
  });
  return pairs;
};

const PROPOSE_INFORMAL = phrase('на ты');
const PROPOSE_FORMAL = phrase('на вы');
const AGREE = phrase(
  'да|давай|давайте|конечно|можно|ок|окей|хорошо|без проблем|го|yes|yeah|yep|sure|ok|okay|of course'
);
const REFUSE = phrase('нет|не надо|не стоит|лучше на вы|no|rather not');
const REFUSE_TO_INFORMAL = phrase('лучше на ты');

// What a proposal asks for, when a message is one.
const proposalOf = (text) => {
  if (PROPOSE_INFORMAL.test(text)) {
    return 'informal';
  }
  return PROPOSE_FORMAL.test(text) ? 'formal' : null;
};

const opposite = (form) => (form === 'informal' ? 'formal' : 'informal');

// The form a reply settles on: what was proposed, the other one, or
// nothing when the reply says neither.
const settled = (proposed, reply) => {
  const first = reply.split(/[.!?\n]/u, 1)[0];
  if (REFUSE_TO_INFORMAL.test(first)) {
    return 'informal';
  }
  if (REFUSE.test(first)) {
    return opposite(proposed);
  }
  return AGREE.test(first) || proposalOf(first) === proposed ? proposed : null;
};

const agreements = (sorted, isSelf) => {
  const found = [];
  sorted.forEach((message, index) => {
    const proposed = proposalOf(textOf(message));
    if (!proposed) {
      return;
    }
    const reply = answerAfter(sorted, index, isSelf);
    const form = reply ? settled(proposed, reply.text) : null;
    if (form) {
      found.push({ form, at: reply.at, evidence: [message.id, reply.id] });
    }
  });
  return found;
};

/**
 * How the two address each other: `{ form, basis, at, evidence }`.
 * `basis` is `agreed` (the latest "на ты?" — "давай" kind of exchange),
 * `used` (the forms the conversation uses, ./address-form.js) or `none`.
 */
export const learnAddress = (
  messages = [],
  { isSelf = (s) => s === 'me' } = {}
) => {
  const sorted = byTime(messages);
  const agreed = agreements(sorted, isSelf).at(-1);
  if (agreed) {
    return { ...agreed, basis: 'agreed' };
  }
  const used = detectAddressForm(sorted, { isSelf, fallback: null });
  if (used.reason !== 'majority') {
    return { form: null, basis: 'none', at: null, evidence: [] };
  }
  return {
    form: used.form,
    basis: 'used',
    at: null,
    evidence: [],
    confidence: used.confidence,
    messages: used.evidenceMessages,
  };
};

/**
 * The form to write to someone in: what the two agreed on, if they did,
 * else what the conversation uses (`detectAddressForm`'s answer).
 */
export const addressFormOf = (messages = [], options = {}) => {
  const isSelf = options.isSelf ?? ((s) => s === 'me');
  const agreed = agreements(byTime(messages), isSelf).at(-1);
  return agreed
    ? {
        form: agreed.form,
        reason: 'agreed',
        confidence: 1,
        evidence: agreed.evidence,
      }
    : detectAddressForm(messages, options);
};

const VALUE = '([^.,;!?\\n()]{2,80})';
const POSITIONS = [
  'разработчик\\p{L}*',
  'программист\\p{L}*',
  'дизайнер\\p{L}*',
  'менеджер\\p{L}*',
  'инженер\\p{L}*',
  'аналитик\\p{L}*',
  'тестировщик\\p{L}*',
  'директор\\p{L}*',
  'основател\\p{L}*',
  'сооснователь\\p{L}*',
  'руководител\\p{L}*',
  'тимлид\\p{L}*',
  'студент\\p{L}*',
  'преподавател\\p{L}*',
  'врач\\p{L}*',
  'юрист\\p{L}*',
  'бухгалтер\\p{L}*',
  'маркетолог\\p{L}*',
  'рекрутер\\p{L}*',
  'фрилансер\\p{L}*',
  'cto',
  'ceo',
].join('|');
const NOT_POSITIONS = phrase(
  'вечером|утром|днём|днем|ночью|летом|зимой|осенью|весной|дома|удалённо|удаленно|много|мало|сейчас|там|тут'
);

// Self-descriptions: kind, pattern and which groups hold what.
const WORK_PATTERNS = [
  {
    regex: phrase(`я (?:сейчас |теперь )?работаю (?:в|во|на|у) ${VALUE}`),
    kinds: ['workplace'],
  },
  {
    regex: phrase(
      `я (?:сейчас |теперь )?(?:работаю )?(${POSITIONS})(?: (?:в|во|на) ${VALUE})?`
    ),
    kinds: ['position', 'workplace'],
  },
  {
    regex: phrase('(?:я )?работаю (\\p{L}{3,}(?:ом|ем|ой|ей))'),
    kinds: ['position'],
  },
  {
    regex: phrase(`(?:моя )?должность(?: —| -|:)? ${VALUE}`),
    kinds: ['position'],
  },
  { regex: phrase(`я по профессии ${VALUE}`), kinds: ['occupation'] },
  {
    regex: phrase(`I (?:now |currently )?work (?:at|for) ${VALUE}`),
    kinds: ['workplace'],
  },
  {
    regex: phrase(
      `I(?:'m| am) (?:an? |the )([\\p{L} -]{2,40}?) (?:at|in|for) ${VALUE}`
    ),
    kinds: ['position', 'workplace'],
  },
  {
    regex: phrase(`my (?:job|role|position|title) is ${VALUE}`),
    kinds: ['position'],
  },
];

const workFrom = (message, basis) =>
  WORK_PATTERNS.flatMap(({ regex, kinds }) => {
    const match = textOf(message).match(regex);
    if (!match) {
      return [];
    }
    return kinds
      .map((kind, i) => ({ kind, value: match[i + 1]?.trim() }))
      .filter(({ value }) => value && !NOT_POSITIONS.test(value))
      .map(({ kind, value }) => ({
        kind,
        value: cut(value),
        messageId: message.id,
        at: message.timestamp ?? null,
        basis,
      }));
  });

const newestFirst = (facts) => {
  const seen = new Set();
  return facts
    .toSorted((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))
    .filter((fact) => {
      const key = `${fact.kind}:${fact.value.toLocaleLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
};

/**
 * The person's occupation, position and workplace, newest first:
 * `{ kind, value, messageId, at, basis: 'said' | 'answered' }`. An
 * answer to "where do you work?" that no pattern reads is kept whole
 * (kind `answer`).
 */
export const learnWork = (
  messages = [],
  { isSelf = (s) => s === 'me' } = {}
) => {
  const theirs = byTime(messages).filter((m) => !isSelf(m.sender));
  const said = theirs.flatMap((m) => workFrom(m, 'said'));
  const byId = new Map(theirs.map((m) => [m.id, m]));
  const answered = questionAnswers(messages, { isSelf })
    .filter(
      (qa) => qa.intent === 'work' && qa.question.by === 'me' && qa.answer
    )
    .flatMap((qa) => {
      const answer = byId.get(qa.answer.id);
      const read = answer ? workFrom(answer, 'answered') : [];
      return read.length > 0
        ? read
        : [
            {
              kind: 'answer',
              value: cut(qa.answer.text),
              messageId: qa.answer.id,
              at: qa.answer.at,
              basis: 'answered',
            },
          ];
    });
  return newestFirst([...said, ...answered]);
};

// Paths of a site that are not anyone's profile.
const GITHUB_RESERVED = new Set(
  'about,account,apps,blog,collections,contact,customer-stories,enterprise,events,explore,features,issues,join,login,marketplace,new,notifications,orgs,organizations,pricing,pulls,readme,search,security,settings,site,sponsors,team,topics,trending'.split(
    ','
  )
);

const ACCOUNT_PATTERNS = [
  ['linkedin', /linkedin\.com\/in\/([\w%-]{2,100})\/?(?=$|[\s?#),.!;:])/giu],
  [
    'github',
    /github\.com\/([A-Za-z\d](?:[A-Za-z\d-]{0,38}))\/?(?=$|[\s?#),.!;:])/giu,
  ],
  ['gitlab', /gitlab\.com\/([\w.-]{2,60})\/?(?=$|[\s?#),.!;:])/giu],
  [
    'telegram',
    /(?:t\.me|telegram\.me)\/([A-Za-z]\w{3,31})\/?(?=$|[\s?#),.!;:])/giu,
  ],
  ['vk', /vk\.com\/([\w.]{2,60})\/?(?=$|[\s?#),.!;:])/giu],
  ['x', /(?:twitter|x)\.com\/(\w{1,15})\/?(?=$|[\s?#),.!;:])/giu],
  ['instagram', /instagram\.com\/([\w.]{1,30})\/?(?=$|[\s?#),.!;:])/giu],
  ['facebook', /facebook\.com\/([\w.]{3,60})\/?(?=$|[\s?#),.!;:])/giu],
  [
    'habr',
    /habr\.com\/(?:\w{2}\/)?users\/([\w-]{2,60})\/?(?=$|[\s?#),.!;:])/giu,
  ],
  ['email', /(?<![\w.+-])([\w.+-]+@[\w-]+(?:\.[\w-]+)+)(?![\w-])/giu],
];

const NOT_HANDLES = {
  github: GITHUB_RESERVED,
  telegram: new Set(['joinchat', 'addstickers', 'share', 'proxy', 'iv']),
  facebook: new Set(['groups', 'events', 'pages', 'watch', 'share']),
  x: new Set(['home', 'search', 'share', 'intent', 'i']),
  instagram: new Set(['p', 'reel', 'stories', 'explore']),
};

const urlOf = (network, handle) =>
  ({
    linkedin: `https://www.linkedin.com/in/${handle}`,
    github: `https://github.com/${handle}`,
    gitlab: `https://gitlab.com/${handle}`,
    telegram: `https://t.me/${handle}`,
    vk: `https://vk.com/${handle}`,
    x: `https://x.com/${handle}`,
    instagram: `https://www.instagram.com/${handle}`,
    facebook: `https://www.facebook.com/${handle}`,
    habr: `https://habr.com/users/${handle}`,
    email: `mailto:${handle}`,
  })[network];

const accountsIn = (message) =>
  ACCOUNT_PATTERNS.flatMap(([network, regex]) =>
    [...textOf(message).matchAll(regex)]
      .map((match) => match[1].replace(/\.+$/u, ''))
      .filter((handle) => !NOT_HANDLES[network]?.has(handle.toLowerCase()))
      .map((handle) => ({
        network,
        handle,
        url: urlOf(network, handle),
        messageId: message.id,
        at: message.timestamp ?? null,
      }))
  );

/**
 * The person's accounts elsewhere, from links they sent themselves
 * (links we sent may be anyone's): `{ network, handle, url, messageId,
 * at }`, one per account, newest first.
 */
export const learnAccounts = (
  messages = [],
  { isSelf = (s) => s === 'me' } = {}
) => {
  const seen = new Set();
  return byTime(messages)
    .filter((m) => !isSelf(m.sender))
    .flatMap(accountsIn)
    .reverse()
    .filter(({ network, handle }) => {
      const key = `${network}:${handle.toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
};

// Words that carry no meaning of their own in a short question.
const STOP_WORDS = new Set(
  'а и и или но ли же бы не ну вот то это так уже ещё еще к ко в во на с со у о об от до по за для из мне тебе вам тебя вас ты вы я мы a an the to of in on at for and or is are do does did you your me my i we can could would will'.split(
    ' '
  )
);

const stemsOf = (text) =>
  new Set(
    (
      String(text ?? '')
        .toLocaleLowerCase()
        .match(/[\p{L}\p{N}]+/gu) ?? []
    )
      .filter((word) => !STOP_WORDS.has(word))
      .map((word) => word.slice(0, 5))
  );

const overlap = (a, b) => {
  const union = new Set([...a, ...b]);
  const shared = [...a].filter((stem) => b.has(stem)).length;
  return union.size === 0 ? 0 : shared / union.size;
};

/**
 * Whether two questions ask the same in other words (R-Y54). A local
 * stand-in until link-assistant/formal-ai can tell
 * (link-assistant/formal-ai#1330): the same intent — and for "на ты /
 * на вы", the same form asked for — or mostly the same word stems.
 */
export const sameQuestion = (a, b) => {
  const [ia, ib] = [intentOf(a), intentOf(b)];
  if (ia === 'address' && ib === 'address') {
    return proposalOf(String(a)) === proposalOf(String(b));
  }
  if (ia && ib) {
    return ia === ib;
  }
  return overlap(stemsOf(a), stemsOf(b)) >= 0.6;
};

/**
 * Our questions grouped by meaning, the most asked first: `{ text (the
 * latest wording), wordings, asked, answered, latest }`.
 */
export const groupQuestions = (pairs = [], { by = 'me' } = {}) => {
  const groups = [];
  for (const pair of pairs.filter((p) => p.question.by === by)) {
    const group = groups.find((g) =>
      sameQuestion(g.wordings.at(-1), pair.question.text)
    );
    const target = group ?? { wordings: [], asked: 0, answered: 0 };
    if (!group) {
      groups.push(target);
    }
    if (!target.wordings.includes(pair.question.text)) {
      target.wordings.push(pair.question.text);
    }
    target.asked += 1;
    target.answered += pair.answer ? 1 : 0;
    target.latest = pair;
  }
  return groups
    .map((g) => ({ ...g, text: g.latest.question.text }))
    .toSorted((a, b) => b.asked - a.asked);
};

/** Everything at once, for one personal conversation. */
export const learnPerson = (messages = [], options = {}) => ({
  address: learnAddress(messages, options),
  work: learnWork(messages, options),
  accounts: learnAccounts(messages, options),
  questions: questionAnswers(messages, options),
});

/** `learnPerson` with our questions grouped by meaning. */
export const learnConversation = (messages = [], options = {}) => {
  const learned = learnPerson(messages, options);
  return { ...learned, asked: groupQuestions(learned.questions) };
};
