import {
  byTime,
  questionAnswers,
  answerAfter,
} from './conversation-questions.js';
import {
  affirmation,
  professionIn,
  friendshipProposal,
  quotedOrForwarded,
  phrase,
  accountNetwork,
} from './conversation-rules.js';

export const askedProfession = (text) => {
  if (
    phrase(
      'я|мой|моя|он|она|твой друг|ваш друг|your friend|my|I|he|she|или|or'
    ).test(String(text ?? ''))
  ) {
    return null;
  }
  return professionIn(text);
};

export const confirmedProfession = (pair) => {
  const profession = askedProfession(pair.question.text);
  const answer = affirmation(pair.answer?.text);
  if (!profession || answer === null) {
    return null;
  }
  return {
    kind: 'position',
    value: profession.value,
    profession: profession.kind,
    messageId: pair.answer.id,
    at: pair.answer.at,
    basis: 'answered',
    evidence: [pair.question.id, ...(pair.answer.ids ?? [pair.answer.id])],
    negated: answer === false,
  };
};

export const learnRelationships = (
  messages,
  { isSelf = (sender) => sender === 'me', pairs } = {}
) => {
  const sorted = byTime(messages).filter(
    (message) => !quotedOrForwarded(message)
  );
  const questions = new Map(
    (pairs ?? questionAnswers(sorted, { isSelf })).map((pair) => [
      pair.question.id,
      pair,
    ])
  );
  const found = [];
  sorted.forEach((message, index) => {
    if (!friendshipProposal(message.body)) {
      return;
    }
    const pair = questions.get(message.id);
    const answer = pair?.answer ?? answerAfter(sorted, index, isSelf);
    if (affirmation(answer?.text) !== true) {
      return;
    }
    found.push({
      kind: 'friendship',
      status: 'agreed',
      basis: 'agreed',
      at: answer.at,
      evidence: [message.id, ...(answer.ids ?? [answer.id])],
    });
  });
  return found.slice(-1);
};

// A compact, source-backed outline rather than an invented narrative.
const continuations = (pairs) => {
  const byMessage = new Map();
  for (const pair of pairs) {
    byMessage.set(pair.question.id, pair);
    for (const id of pair.answer?.ids ?? []) {
      byMessage.set(id, pair);
    }
  }
  return pairs.flatMap((pair) => {
    const prior = byMessage.get(pair.question.replyTo);
    return prior?.intent && pair.intent && prior.intent !== pair.intent
      ? [
          {
            from: prior.intent,
            to: pair.intent,
            network: accountNetwork(pair.question.text),
            evidence: [
              prior.question.id,
              pair.question.replyTo,
              pair.question.id,
            ],
          },
        ]
      : [];
  });
};

export const conversationSummary = (learned) => ({
  relationships: learned.relationships ?? [],
  topics: [
    ...new Set(learned.questions.map((pair) => pair.intent).filter(Boolean)),
  ],
  continuations: continuations(learned.questions),
  unanswered: learned.questions.filter((pair) => !pair.answer).slice(-5),
  evidence: [
    ...new Set([
      ...(learned.relationships ?? []).flatMap((fact) => fact.evidence),
      ...learned.work.flatMap((fact) => fact.evidence ?? [fact.messageId]),
      ...learned.accounts.map((account) => account.messageId),
    ]),
  ],
});
