import { assignmentVacancyUrl } from '../assignments/validation.js';
import { browserAnswerPlanning } from '../automation/question-browser-context.js';
import { checkBrowserQuestion } from '../automation/question-browser-state.js';
import { browserQuestionInput } from '../automation/question-browser-vacancy.js';
import { previewAnswer } from '../automation/question-store.js';
import {
  prefillBrowserAnswer,
  readBrowserAnswerChoices,
} from '../sources/browser-choices.js';

const hasReviewableText = (plan) =>
  plan.complete &&
  !plan.noReply &&
  !plan.noReplyProposed &&
  !plan.linkReview &&
  !plan.pending?.blocked &&
  Boolean(plan.text?.trim());

/** Prepare one native draft from the live question and the shared answer rules. */
export const prepareRecruiterDraft = async (
  document,
  ui,
  vacancy,
  { store, review }
) => {
  if (!review) {
    return false;
  }
  review.check();
  const observed = await readBrowserAnswerChoices(document, ui, document.chat, {
    preserveDraft: true,
  });
  const snapshot = checkBrowserQuestion(observed);
  const { question, noticeContext } = snapshot;
  if (
    snapshot.hasDraft ||
    snapshot.strictOptions ||
    question.outgoing ||
    noticeContext?.canReply !== true ||
    assignmentVacancyUrl(noticeContext.vacancyUrl) !== vacancy
  ) {
    return false;
  }
  const key = JSON.stringify([snapshot.chat, question.id]);
  if (review.attempted.has(key)) {
    return false;
  }
  const planning = browserAnswerPlanning(review.input, observed);
  const input = browserQuestionInput({ source: 'hh' }, snapshot, {
    ...review.input,
    ...planning,
    modelDraft: false,
  });
  const plan = await previewAnswer(store, input);
  if (!hasReviewableText(plan)) {
    return false;
  }
  await prefillBrowserAnswer(
    document,
    ui,
    {
      ...snapshot,
      ...(observed.messages ? { recent: planning.recent } : {}),
    },
    plan.text,
    {
      reveal: true,
      verifyCurrent: async () => {
        review.check();
        if (
          JSON.stringify(await previewAnswer(store, input)) !==
          JSON.stringify(plan)
        ) {
          throw new Error('The recruiter answer plan changed.');
        }
      },
      beforeEvaluate: () => {
        review.check();
        // A lost response or owner-cleared composer must never replay a write.
        review.attempted.add(key);
      },
    }
  );
  return true;
};
