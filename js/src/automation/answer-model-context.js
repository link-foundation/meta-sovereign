import { cvFromLink } from '../cv/model.js';
import { renderAnswer } from './question-profile.js';
import { questionSimilarity } from './question-match.js';
import { rejectedAnswer } from './question-policy.js';
import { readAnswerModel, answerModelFailure } from './answer-model-config.js';

const bytes = (value) => new TextEncoder().encode(JSON.stringify(value));
export const modelFingerprint = async (value) =>
  Array.from(
    new Uint8Array(
      await globalThis.crypto.subtle.digest('SHA-256', bytes(value))
    ),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');

const references = (context, questions) => {
  const budget = { remaining: 128000, exhausted: false };
  return context.rules
    .map((rule) => ({
      id: rule.id,
      question: rule.question,
      similarity: Math.max(
        0,
        ...questions.map((question) =>
          questionSimilarity(rule.question, question, budget)
        )
      ),
      answers: rule.answers
        .filter((answer) => answer.approved)
        .slice(0, 3)
        .map((answer) => renderAnswer(answer.text, context.profile))
        .filter(
          (answer) =>
            !answer.missing.length &&
            !rejectedAnswer(answer.text, context.policy)
        )
        .map((answer) => answer.text),
    }))
    .filter((rule) => rule.answers.length)
    .sort(
      (left, right) =>
        right.similarity - left.similarity || left.id.localeCompare(right.id)
    )
    .slice(0, 5);
};

/** Exact explicit context only: never read files or browse from model text. */
export const prepareAnswerModelContext = async (store, context, questions) => {
  const settings = await readAnswerModel(store);
  let cv = null;
  if (settings.enabled && settings.cvId) {
    const saved = await store.get(settings.cvId);
    if (!saved || saved.id !== settings.cvId || (!saved.cv && !saved.lino)) {
      throw answerModelFailure(
        'answer-model-cv',
        'The selected stored CV is unavailable.'
      );
    }
    if (JSON.stringify(saved).length > 128000) {
      throw answerModelFailure(
        'answer-model-context',
        'The selected CV exceeds the draft context limit.'
      );
    }
    cv = { id: settings.cvId, values: cvFromLink(saved) };
  }
  const knowledge = {
    profile: context.profile,
    profileSource: context.profileSource ?? null,
    cv,
    recent: context.recent,
    vacancy: context.vacancy,
    answers: references(context, questions),
  };
  if (bytes(knowledge).length > 96 * 1024) {
    throw answerModelFailure(
      'answer-model-context',
      'Draft context exceeds 96 KiB.'
    );
  }
  return {
    settings,
    knowledge,
    // All rules and policy invalidate an issued model draft after owner edits.
    fingerprint: await modelFingerprint({
      settings,
      knowledge,
      rules: context.rules,
      policy: context.policy,
    }),
  };
};

export const modelContextEvidence = (knowledge) => [
  ...(Object.keys(knowledge.profile ?? {}).length ? ['profile'] : []),
  ...(knowledge.cv ? [knowledge.cv.id] : []),
  ...(knowledge.recent?.length ? ['conversation'] : []),
  ...(knowledge.vacancy?.description || knowledge.vacancy?.pay
    ? ['vacancy']
    : []),
  ...knowledge.answers.map((answer) => answer.id),
];
