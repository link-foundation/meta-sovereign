import { debugQuestionTurn } from './question-turns.js';

const validPendingMessage = (message) =>
  message &&
  typeof message.id === 'string' &&
  Boolean(message.id.trim()) &&
  message.id.length <= 600 &&
  typeof message.body === 'string' &&
  Boolean(message.body.trim()) &&
  message.body.length <= 6000;

/** One bounded pending turn, shared by archived chats and rendered providers. */
export const checkedPendingMessages = (messages, question) => {
  if (
    !Array.isArray(messages) ||
    !messages.length ||
    messages.length > 20 ||
    !messages.every(validPendingMessage) ||
    new Set(messages.map((message) => message.id)).size !== messages.length ||
    messages.reduce((size, message) => size + message.body.length, 0) > 24000 ||
    messages.at(-1).body !== question
  ) {
    throw new Error('Pending messages must be a complete bounded turn.');
  }
  return messages.map(({ id, body }) => ({ id, body }));
};

export const pendingAnswerText = (parts) => {
  const replies = parts.filter((part) => !part.noReply);
  return replies.length === 1
    ? replies[0].text
    : replies
        .map(
          (part, index) =>
            `${index + 1}. ${part.text || `{{answer:${index + 1}}}`}`
        )
        .join('\n');
};

const aggregate = (parts, latest, count) => {
  const actionable = parts.filter((part) => !part.noReply);
  const base = actionable.length === 1 ? actionable[0] : latest;
  const text = pendingAnswerText(parts);
  const limited = text.length > 12000;
  return {
    ...base,
    question: latest.question,
    text: limited ? '' : text,
    match: actionable.length > 1 ? 'pending-turn' : base.match,
    noReply: actionable.length === 0,
    noReplyProposed: actionable.length === 1 && base.noReplyProposed === true,
    complete: !limited && actionable.every((part) => part.complete),
    requiresReview:
      limited || actionable.length > 1 || Boolean(base.requiresReview),
    missing: [...new Set(parts.flatMap((part) => part.missing ?? []))],
    rules: [...new Set(parts.flatMap((part) => part.rules ?? []))],
    parts,
    pending: { count, actionable: actionable.length, limited, blocked: false },
  };
};

export const planPendingMessages = (question, options, plan) => {
  const messages = checkedPendingMessages(options.pendingMessages, question);
  const { pendingMessages: _messages, ...shared } = options;
  const matchBudget = options.matchBudget ?? {
    remaining: 4 * 1024 ** 2,
    exhausted: false,
  };
  const answers = messages.map((message, index) => ({
    ...plan(message.body, {
      ...shared,
      matchBudget,
      ...(index < messages.length - 1
        ? { options: [], strictOptions: false }
        : {}),
    }),
    message: message.id,
  }));
  const latest = answers.at(-1);
  debugQuestionTurn('pending-turn-plan', {
    question: messages.at(-1).id,
    messages: messages.length,
    actionable: answers.filter((answer) => !answer.noReply).length,
    strict: Boolean(latest.strictOptions),
  });
  if (messages.length === 1) {
    return latest;
  }
  const earlierActionable = answers
    .slice(0, -1)
    .some((answer) => !answer.noReply);
  if (latest.strictOptions) {
    return {
      ...latest,
      requiresReview: earlierActionable || latest.requiresReview,
      parts: answers,
      pending: {
        count: messages.length,
        actionable: answers.filter((answer) => !answer.noReply).length,
        blocked: earlierActionable,
        limited: false,
      },
    };
  }
  const parts = answers.flatMap((answer) =>
    answer.parts?.length
      ? answer.parts.map((part) => ({ ...part, message: answer.message }))
      : [answer]
  );
  return aggregate(parts, latest, messages.length);
};
