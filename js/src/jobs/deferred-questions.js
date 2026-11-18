import {
  questionKey,
  questionSimilarity,
} from '../automation/question-match.js';
import { prepareAnswerPreview } from '../automation/question-store.js';
import { planAnswer } from '../automation/question-answers.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { vacancyChoiceSlot } from './vacancy-choice.js';
import {
  deferredQuestionId,
  deferredQuestionResult,
  deferredQuestionText,
} from './deferred-question-data.js';

/** Matching only suppresses work; it never approves or fills a saved answer. */
export const matchesDeferredQuestion = (question, pattern, budget) => {
  const fragment = questionKey(pattern);
  return (
    Boolean(fragment && questionKey(question).includes(fragment)) ||
    questionSimilarity(question, pattern, budget) >= 0.7
  );
};
export const storedDeferredQuestions = async (store, input = {}) => {
  const browserSlot = vacancyChoiceSlot(input);
  return deferredQuestionResult(
    (await store.get(deferredQuestionId(browserSlot))) ?? {
      version: 1,
      browserSlot,
      revision: 'empty',
      entries: [],
    },
    { browserSlot }
  );
};
export const saveDeferredQuestions = async (store, before, entries) => {
  const next = deferredQuestionResult(
    { ...before, entries, revision: globalThis.crypto.randomUUID() },
    before
  );
  await saveAcknowledgedRecord(store, {
    id: deferredQuestionId(before.browserSlot),
    ...next,
  });
  return next;
};
export const associateDeferredQuestions = (before, questions, url) => {
  const entries = before.entries.map((row) => ({
    ...row,
    vacancies: [...row.vacancies],
  }));
  const budget = { remaining: 4 * 1024 ** 2 };
  for (const text of questions) {
    const question = deferredQuestionText(text);
    let entry = entries.find((row) =>
      matchesDeferredQuestion(question, row.question, budget)
    );
    if (!entry) {
      entry = {
        id: globalThis.crypto.randomUUID(),
        question,
        mode: 'until-answered',
        vacancies: [],
        createdAt: new Date().toISOString(),
      };
      entries.push(entry);
    }
    if (!entry.vacancies.includes(url)) {
      entry.vacancies.push(url);
    }
  }
  return entries;
};

const answerReleases = (plan) =>
  Boolean(
    plan?.complete &&
    plan.text &&
    plan.rules?.length &&
    !plan.missing?.length &&
    ['exact', 'template'].includes(plan.match)
  );

/** A complete saved answer makes a deferred vacancy eligible for fresh review.
 * Its ordinary approval, matching and native dispatch guards still apply. */
export const pendingDeferredVacancies = async (
  store,
  input = {},
  savedPolicy
) => {
  const saved = savedPolicy ?? (await storedDeferredQuestions(store, input));
  const pending = new Set();
  if (!saved.entries.some((entry) => entry.vacancies.length)) {
    return pending;
  }
  const { context } = await prepareAnswerPreview(
    store,
    {
      ...input,
      source: 'hh',
      questionMode: 'field',
    },
    { maxBytes: 2 * 1024 ** 2 }
  );
  const chatScoped = context.rules.some((rule) => rule.chats?.length);
  for (const entry of saved.entries) {
    let sharedPlan;
    for (const url of entry.vacancies) {
      const plan =
        entry.mode === 'always'
          ? null
          : (!chatScoped && sharedPlan) ||
            planAnswer(entry.question, {
              ...context,
              chat: url,
              questionMode: 'field',
            });
      sharedPlan = plan;
      if (!answerReleases(plan)) {
        pending.add(url);
      }
    }
  }
  return pending;
};
