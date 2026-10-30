import { learnConversation } from './person-learn.js';
import { byTime } from './conversation-questions.js';
import {
  affirmation,
  accountNetwork,
  professionIn,
} from './conversation-rules.js';
import { conversationSettings } from './conversation-policy.js';

const WORDS = {
  ru: {
    hello: 'Привет!',
    formalHello: 'Здравствуйте!',
    github: 'А ты есть на GitHub?',
    formalGithub: 'Вы есть на GitHub?',
    link: 'Поделишься ссылкой на GitHub?',
    formalLink: 'Поделитесь ссылкой на GitHub?',
    thanks: 'Спасибо за ссылку!',
    work: 'Над чем ты сейчас работаешь?',
    formalWork: 'Над чем Вы сейчас работаете?',
  },
  en: {
    hello: 'Hi!',
    formalHello: 'Hello!',
    github: 'Are you on GitHub?',
    formalGithub: 'Are you on GitHub?',
    link: 'Could you share your GitHub profile?',
    formalLink: 'Could you share your GitHub profile?',
    thanks: 'Thanks for the link!',
    work: 'What are you working on these days?',
    formalWork: 'What are you working on these days?',
  },
  zh: {
    hello: '你好！',
    formalHello: '您好！',
    github: '你有 GitHub 账号吗？',
    formalGithub: '您有 GitHub 账号吗？',
    link: '可以分享你的 GitHub 主页吗？',
    formalLink: '可以分享您的 GitHub 主页吗？',
    thanks: '谢谢分享链接！',
    work: '你最近在做什么项目？',
    formalWork: '您最近在做什么项目？',
  },
  hi: {
    hello: 'नमस्ते!',
    formalHello: 'नमस्ते!',
    github: 'क्या तुम GitHub पर हो?',
    formalGithub: 'क्या आप GitHub पर हैं?',
    link: 'क्या तुम अपना GitHub प्रोफ़ाइल साझा कर सकते हो?',
    formalLink: 'क्या आप अपना GitHub प्रोफ़ाइल साझा कर सकते हैं?',
    thanks: 'लिंक के लिए धन्यवाद!',
    work: 'आजकल तुम किस प्रोजेक्ट पर काम कर रहे हो?',
    formalWork: 'आजकल आप किस प्रोजेक्ट पर काम कर रहे हैं?',
  },
};
const languageOf = (messages, locale) => {
  const text = messages
    .slice(-20)
    .map((message) => message.body)
    .join(' ');
  if (/\p{Script=Cyrillic}/u.test(text)) {
    return 'ru';
  }
  if (/\p{Script=Devanagari}/u.test(text)) {
    return 'hi';
  }
  if (/\p{Script=Han}/u.test(text)) {
    return 'zh';
  }
  return text.trim() ? 'en' : WORDS[locale] ? locale : 'en';
};
const anchorId = (messages, replyTo) => {
  if (!replyTo) {
    return null;
  }
  const id = String(replyTo);
  const direct = messages.find(
    (message) => message.id === id || String(message.id).endsWith(`:${id}`)
  );
  return direct?.id ?? null;
};

export const conversationContext = (messages, learned, replyTo) => {
  const anchor = replyTo
    ? anchorId(messages, replyTo)
    : (messages.at(-1)?.id ?? null);
  const pair = learned.questions.findLast(
    (entry) =>
      entry.question.id === anchor ||
      (entry.answer?.ids ?? [entry.answer?.id]).includes(anchor)
  );
  return {
    anchorId: anchor,
    anchorText: String(
      messages.find((message) => message.id === anchor)?.body ?? ''
    ).slice(0, 4096),
    intent: pair?.intent ?? null,
    question: pair?.question ?? null,
    evidence: pair
      ? [pair.question.id, ...(pair.answer?.ids ?? [])]
      : anchor
        ? [anchor]
        : [],
  };
};

const suggestedFacts = (facts) => ({
  programmer: facts.work.find(
    (fact) =>
      fact.kind !== 'answer' &&
      !fact.negated &&
      (fact.profession === 'programmer' ||
        professionIn(fact.value)?.kind === 'programmer')
  ),
  github: facts.accounts.find((account) => account.network === 'github'),
  askedGithub: facts.questions.findLast(
    (pair) =>
      pair.question.by === 'me' &&
      accountNetwork(pair.question.text) === 'github'
  ),
});

const githubSteps = (
  { facts, programmer, github, askedGithub, formal, words },
  add
) => {
  if (!programmer || github) {
    return;
  }
  if (!askedGithub) {
    add(
      'work.github',
      formal ? words.formalGithub : words.github,
      programmer.evidence ?? [programmer.messageId]
    );
    return;
  }
  const answer = askedGithub.answer;
  if (!answer || affirmation(answer.text) !== true) {
    return;
  }
  const linkAsked = facts.questions.some(
    (pair) =>
      pair.question.by === 'me' &&
      pair.intent === 'accounts' &&
      pair.question.at >= askedGithub.question.at &&
      pair.question.id !== askedGithub.question.id
  );
  if (!linkAsked) {
    add('github.link', formal ? words.formalLink : words.link, [
      askedGithub.question.id,
      answer.id,
    ]);
  }
};
const projectSteps = (
  { facts, programmer, github, formal, words, context, replyTo },
  add
) => {
  if (!programmer || !github || !replyTo || context.intent !== 'work') {
    return;
  }
  const askedProjects = facts.questions.some((pair) =>
    /над чем|каки[ем].*проект|what are you working|which projects|什么项目/iu.test(
      pair.question.text
    )
  );
  if (!askedProjects) {
    add('work.projects', formal ? words.formalWork : words.work, [
      programmer.messageId,
      github.messageId,
    ]);
  }
};
const thanksStep = ({ github, context, sorted, words }, add) => {
  if (
    github &&
    (github.messageId === context.anchorId ||
      github.messageId === sorted.at(-1)?.id)
  ) {
    add('account.thanks', words.thanks, [github.messageId]);
  }
};
const suggestionsFor = (state) => {
  const suggestions = [];
  const add = (rule, text, evidence = []) =>
    suggestions.push({
      text,
      kind: 'context',
      rule,
      evidence,
      basis: 'conversation',
    });
  if (!state.sorted.length) {
    add('greeting', state.formal ? state.words.formalHello : state.words.hello);
  } else {
    githubSteps(state, add);
    projectSteps(state, add);
    thanksStep(state, add);
  }
  return suggestions;
};

const completeSuggestions = (state, options) => {
  const prefix = String(options.typed ?? '')
    .trim()
    .toLocaleLowerCase();
  return suggestionsFor(state)
    .filter(
      (item) => !prefix || item.text.toLocaleLowerCase().startsWith(prefix)
    )
    .slice(0, options.limit ?? 8);
};

export const conversationSuggestions = (messages = [], options = {}) => {
  const policy = conversationSettings(options.settings);
  if (!policy.enabled || !policy.suggestions) {
    return { suggestions: [], context: null };
  }
  const isSelf = options.isSelf ?? ((sender) => sender === 'me');
  const sorted = byTime(messages).filter(
    (message) => !message.deleted && !message.service
  );
  const facts =
    options.learned ?? learnConversation(sorted, { isSelf, ...policy });
  const context = conversationContext(sorted, facts, options.replyTo);
  const missing = options.replyTo && !context.anchorId;
  const alreadyAnswered =
    !options.replyTo && sorted.length && isSelf(sorted.at(-1).sender);
  if (missing || alreadyAnswered) {
    return { suggestions: [], context };
  }
  const state = {
    facts,
    sorted,
    context,
    replyTo: options.replyTo,
    ...suggestedFacts(facts),
    formal: facts.address?.form === 'formal',
    words: WORDS[languageOf(sorted, options.locale ?? 'en')],
  };
  return { context, suggestions: completeSuggestions(state, options) };
};
