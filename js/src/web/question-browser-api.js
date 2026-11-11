import {
  browserReviewId,
  checkBrowserQuestion,
  browserChoiceReceipt,
  boundedBrowserText,
  validChoiceSources,
} from '../automation/question-browser-state.js';

const failure = (value) =>
  Object.assign(
    new Error(value?.error ?? 'Browser question controls were not confirmed.'),
    {
      code: value?.code ?? 'question-browser-unconfirmed',
    }
  );
const checkReceipt = (value) => {
  if (value.status === 'sent' && value.outbox?.resolvedBy !== 'user') {
    const receipt = value.outbox?.receipt;
    if (
      !browserChoiceReceipt(receipt, {
        source: value.target.source,
        chat: value.chat,
        text: receipt?.option,
      }) ||
      value.answerOptions.filter((option) => option === receipt.option)
        .length !== 1
    ) {
      throw failure({ code: 'question-browser-receipt-missing' });
    }
  }
};

const checked = (value) => {
  if (
    !value ||
    value.error ||
    value.httpStatus >= 400 ||
    value.mode !== 'browser-answer' ||
    !browserReviewId(value.id) ||
    !['review', 'sending', 'sent', 'unknown', 'failed'].includes(
      value.status
    ) ||
    !boundedBrowserText(value.target?.source, 80) ||
    !boundedBrowserText(value.target?.chat, 480) ||
    typeof value.expired !== 'boolean'
  ) {
    throw failure(value);
  }
  checkBrowserQuestion(value);
  checkReceipt(value);

  return value;
};

export const questionBrowserApi = ({ remote }) => {
  const call = async (action, input) => {
    const result = checked(
      await (remote.report ?? remote.post)(
        `/api/automations/answers/browser/${action}`,
        input,
        { network: true, read: action === 'status' }
      )
    );
    if (action !== 'inspect' && result.id !== input.id) {
      throw failure({ code: 'question-browser-review-changed' });
    }
    return result;
  };
  return {
    browserAnswerCapabilities: async () => {
      const result = await remote.get('/api/automations/answers/browser');
      if (result === null || result === undefined) {
        return { available: false, sources: [] };
      }
      if (
        typeof result.available !== 'boolean' ||
        !validChoiceSources(result.sources)
      ) {
        throw failure(result);
      }
      if (result.available && !result.sources.length) {
        throw failure(result);
      }
      return result;
    },
    inspectBrowserAnswer: (input) => call('inspect', input),
    prefillBrowserAnswer: (input) => call('prefill', input),
    selectBrowserAnswer: (input) => call('select', input),
    browserAnswerStatus: (input) => call('status', input),
  };
};
