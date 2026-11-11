import { guardedSend, outboxKey } from './outbox.js';
import { questionChoiceKey } from './question-choice-key.js';
import { browserTextReceipt } from './question-browser-state.js';

const failure = (code = 'send-unknown', ambiguous = true) =>
  Object.assign(
    new Error('The inactive notice receipt could not be verified.'),
    { code, ambiguous, fallback: false }
  );

export const noticeReplyDraft = (target, snapshot, plan) => ({
  ...target,
  chat: snapshot.chat,
  text: plan.text,
  answer: {
    message: `msg:${target.source}:${snapshot.chat}:${plan.message}`,
    textReply: true,
    strictOptions: false,
  },
});

export const rejectionReplyKey = (draft) =>
  outboxKey({
    owner: 'question-rejection',
    source: draft.source,
    chat: draft.chat,
    step: 'once',
  });

/** Both reservation layers flush before issue; uncertainty blocks either path. */
export const deliverNoticeReply = async ({
  context,
  runtime,
  snapshot,
  plan,
  verify,
}) => {
  const draft = noticeReplyDraft(runtime.record.target, snapshot, plan);
  const sendQuestion = () =>
    guardedSend({
      store: context.store,
      owner: runtime.record.id,
      kind: 'question-text',
      key: questionChoiceKey(draft),
      draft,
      clock: context.clock,
      log: context.log,
      send: async () => {
        await verify();
        const result = await runtime.handle.replyTextInactive(
          snapshot,
          plan.text,
          verify
        );
        if (!browserTextReceipt(result, draft)) {
          throw failure();
        }
        return result;
      },
    });
  const outcome =
    plan.kind === 'rejections'
      ? await guardedSend({
          store: context.store,
          owner: runtime.record.id,
          kind: 'question-rejection',
          key: rejectionReplyKey(draft),
          draft,
          clock: context.clock,
          log: context.log,
          send: async () => {
            await verify();
            const result = await sendQuestion();
            if (result.status === 'sent') {
              return result.result;
            }
            if (
              result.code === 'already-sent' &&
              browserTextReceipt(result.outbox?.receipt, draft)
            ) {
              return result.outbox.receipt;
            }
            throw failure(
              result.code ?? 'notice-reply-refused',
              result.status === 'unknown' || result.code === 'send-in-doubt'
            );
          },
        })
      : await sendQuestion();
  return {
    outcome,
    draft,
    key:
      plan.kind === 'rejections'
        ? rejectionReplyKey(draft)
        : questionChoiceKey(draft),
  };
};
