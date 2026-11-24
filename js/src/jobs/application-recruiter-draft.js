import { assignmentVacancyUrl } from '../assignments/validation.js';
import { guardedSend } from '../automation/outbox.js';
import { browserAnswerPlanning } from '../automation/question-browser-context.js';
import {
  browserAnswerReceipt,
  browserChoiceDraft,
  checkBrowserQuestion,
} from '../automation/question-browser-state.js';
import { browserTextDraft } from '../automation/question-browser-text.js';
import { browserQuestionInput } from '../automation/question-browser-vacancy.js';
import { questionChoiceKey } from '../automation/question-choice-key.js';
import { previewAnswer } from '../automation/question-store.js';
import {
  loadSettings,
  optOutEntry,
  quietMsLeft,
} from '../automation/safety.js';
import {
  prefillBrowserAnswer,
  readBrowserAnswerChoices,
  selectBrowserAnswer,
} from '../sources/browser-choices.js';
import { sendBrowserTextReply } from '../sources/browser-text-reply.js';

const hasReviewableText = (plan) =>
  plan.complete &&
  !plan.noReply &&
  !plan.noReplyProposed &&
  !plan.linkReview &&
  !plan.pending?.blocked &&
  Boolean(plan.text?.trim());

const approvedExactReply = (plan, snapshot) => {
  const candidate = plan.matchResults?.items[0];
  return (
    hasReviewableText(plan) &&
    !plan.requiresReview &&
    !plan.pending?.limited &&
    plan.match === 'exact' &&
    plan.matchResults?.complete === true &&
    candidate?.selected === true &&
    candidate.approved === true &&
    candidate.question === snapshot.question.body &&
    candidate.text === plan.text &&
    snapshot.pendingTurn?.messages.length === 1 &&
    (!snapshot.strictOptions ||
      (plan.option === plan.text &&
        snapshot.answerOptions.filter((option) => option === plan.text)
          .length === 1))
  );
};

const automaticReplyAllowed = async (store, chat) => {
  const settings = await loadSettings(store);
  return (
    !optOutEntry(settings, { source: 'hh', chat }) &&
    !optOutEntry(settings, { source: 'hh', chat: `web:${chat}` }) &&
    !quietMsLeft(Date.now(), settings)
  );
};

const sendExactReply = async (
  document,
  ui,
  snapshot,
  text,
  { store, review, verifyCurrent }
) => {
  const choice = snapshot.strictOptions;
  const record = { target: { source: 'hh', chat: snapshot.chat }, snapshot };
  const draft = choice
    ? browserChoiceDraft(record, text)
    : browserTextDraft(record, text);
  const outcome = await guardedSend({
    store,
    kind: choice ? 'question-choice' : 'question-text',
    owner: review.owner,
    key: questionChoiceKey(draft),
    draft,
    send: async () => {
      const options = {
        verifyCurrent: async () => {
          await verifyCurrent();
          if (!(await automaticReplyAllowed(store, snapshot.chat))) {
            throw Object.assign(
              new Error(
                'Workspace settings paused the automatic recruiter reply.'
              ),
              { code: 'application-recruiter-consent' }
            );
          }
          review.check();
        },
        beforeClick: review.check,
      };
      const receipt = choice
        ? await selectBrowserAnswer(document, ui, draft, snapshot.chat, {
            ...options,
            recent: snapshot.recent,
            noticeContext: snapshot.noticeContext,
            requireEmpty: true,
          })
        : await sendBrowserTextReply(
            document,
            ui,
            snapshot.chat,
            snapshot,
            text,
            options
          );
      if (!browserAnswerReceipt(receipt, draft)) {
        throw Object.assign(
          new Error('The recruiter reply receipt was not verified.'),
          { code: 'send-unknown', ambiguous: true }
        );
      }
      return receipt;
    },
  });
  if (outcome.status === 'sent') {
    return 'provider-confirmed';
  }
  if (outcome.status === 'unknown' || outcome.code === 'send-in-doubt') {
    return 'unknown';
  }
  return null;
};

/** Prepare or send one answer on the verified application’s active panel. */
export const reviewRecruiterAnswer = async (
  document,
  ui,
  vacancy,
  { store, review }
) => {
  if (!review) {
    return null;
  }
  review.check();
  const observed = await readBrowserAnswerChoices(document, ui, document.chat, {
    preserveDraft: true,
  });
  const snapshot = checkBrowserQuestion(observed);
  const { question, noticeContext } = snapshot;
  if (
    snapshot.hasDraft ||
    question.outgoing ||
    (!snapshot.strictOptions && noticeContext?.canReply !== true) ||
    !noticeContext ||
    assignmentVacancyUrl(noticeContext.vacancyUrl) !== vacancy
  ) {
    return null;
  }
  const key = JSON.stringify([snapshot.chat, question.id]);
  if (review.attempted.has(key)) {
    return null;
  }
  const planning = browserAnswerPlanning(review.input, observed);
  const input = browserQuestionInput({ source: 'hh' }, snapshot, {
    ...review.input,
    ...planning,
    modelDraft: false,
    ...(review.autoSendExactAnswers
      ? { matchPage: { offset: 0, limit: 1 } }
      : {}),
  });
  const plan = await previewAnswer(store, input);
  const verifyCurrent = async () => {
    review.check();
    if (
      JSON.stringify(await previewAnswer(store, input)) !== JSON.stringify(plan)
    ) {
      throw new Error('The recruiter answer plan changed.');
    }
  };
  const expected = {
    ...snapshot,
    ...(observed.messages ? { recent: planning.recent } : {}),
  };
  if (
    review.autoSendExactAnswers &&
    approvedExactReply(plan, snapshot) &&
    (await automaticReplyAllowed(store, snapshot.chat))
  ) {
    review.check();
    review.attempted.add(key);
    return sendExactReply(document, ui, expected, plan.text, {
      store,
      review,
      verifyCurrent,
    });
  }
  if (snapshot.strictOptions || !hasReviewableText(plan)) {
    return null;
  }
  await prefillBrowserAnswer(document, ui, expected, plan.text, {
    reveal: true,
    verifyCurrent,
    beforeEvaluate: () => {
      review.check();
      // A lost response or owner-cleared composer must never replay a write.
      review.attempted.add(key);
    },
  });
  return 'draft';
};
