import { previewAnswer, prepareAnswerPreview } from './question-store.js';
import { prepareAnswerModelContext } from './answer-model-context.js';
import { answerEnvironmentFromMessages } from './question-context.js';
import { toBrowserMessageLink } from '../sources/browser-message.js';
import { browserAnswerPlanning } from './question-browser-context.js';

/** Only an acknowledged window for this exact question supplies native context. */
export const unreadAnswerInput = (context, record, snapshot) => {
  let recent = record.planning.recent;
  const window = context.recentWindow?.();
  if (record.planning.modelDraft && window?.chat === snapshot.chat) {
    const rows = window.rows.map((row) =>
      toBrowserMessageLink(record.source, snapshot.chat, row)
    );
    const latest = rows.at(-1);
    if (
      latest?.id ===
        `msg:${record.source}:${snapshot.chat}:${snapshot.question.id}` &&
      latest.body === snapshot.question.body &&
      latest.outgoing === snapshot.question.outgoing &&
      Number.isFinite(Date.parse(latest.timestamp))
    ) {
      recent = answerEnvironmentFromMessages(rows, latest).recent;
    } else {
      recent = [];
    }
  }
  return {
    ...record.planning,
    modelDraft: false,
    ...browserAnswerPlanning({ ...record.planning, recent }, snapshot),
    source: record.source,
    chat: snapshot.chat,
    question: snapshot.question.body,
    links: snapshot.question.links,
    pendingMessages: snapshot.pendingTurn?.messages,
    options: snapshot.answerOptions,
    strictOptions: snapshot.strictOptions,
  };
};

export const mayDraftUnreadAnswer = (record, snapshot, plan) =>
  record.planning.modelDraft === true &&
  !snapshot.strictOptions &&
  !snapshot.hasDraft &&
  !snapshot.question.outgoing &&
  snapshot.noticeContext?.canReply !== false &&
  !plan.noReply &&
  !plan.noReplyProposed &&
  !plan.linkReview &&
  !plan.pending?.blocked &&
  !plan.pending?.limited;

/** Revalidate saved inputs and model evidence; never regenerate at dispatch. */
export const sameUnreadAnswer = async (store, input, baseline, plan) => {
  if (
    JSON.stringify(await previewAnswer(store, input)) !==
    JSON.stringify(baseline)
  ) {
    return false;
  }
  if (!plan.model?.used) {
    return true;
  }
  const { context } = await prepareAnswerPreview(store, input, {
    maxBytes: 512 * 1024,
  });
  const prepared = await prepareAnswerModelContext(
    store,
    context,
    plan.parts?.length
      ? plan.parts.map((part) => part.question)
      : [input.question]
  );
  return prepared.fingerprint === plan.model.fingerprint;
};
