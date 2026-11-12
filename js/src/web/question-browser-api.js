import {
  browserReviewId,
  browserWatchId,
  checkBrowserQuestion,
  browserReviewReceipt,
  boundedBrowserText,
  validChoiceSources,
  checkBrowserWatchReceipt,
} from '../automation/question-browser-state.js';
import { checkUnreadReview } from '../automation/question-unread-state.js';

const failure = (value) =>
  Object.assign(
    new Error(value?.error ?? 'Browser question controls were not confirmed.'),
    {
      code: value?.code ?? 'question-browser-unconfirmed',
    }
  );
const checkReceipt = (value) => {
  if (value.status === 'sent' && value.outbox?.resolvedBy !== 'user') {
    if (!browserReviewReceipt(value.outbox, value, value.target)) {
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

const checkedWatch = (value, id) => {
  if (
    !value ||
    value.error ||
    value.httpStatus >= 400 ||
    value.mode !== 'browser-answer-watch' ||
    !browserWatchId(value.id) ||
    value.id !== id ||
    (value.noticeReplies !== undefined &&
      typeof value.noticeReplies !== 'boolean') ||
    !['active', 'paused', 'stopped'].includes(value.state) ||
    ![
      'starting',
      'waiting',
      'owner-draft',
      'pending-options',
      'ready',
      'review',
      'prefilled',
      'selecting',
      'sent',
      'marked-sent',
      'unknown',
      'failed',
      'ignored',
      'owner-active',
    ].includes(value.phase) ||
    typeof value.owned !== 'boolean' ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    !validWatchTarget(value.target)
  ) {
    throw failure(value);
  }
  if (value.last) {
    checkBrowserQuestion(value.last.snapshot);
  }
  return checkBrowserWatchReceipt(value);
};

const validWatchTarget = (target) =>
  boundedBrowserText(target?.source, 80) &&
  boundedBrowserText(target?.chat, 480);

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
  const watch = async (action, input) =>
    checkedWatch(
      await (remote.report ?? remote.post)(
        `/api/automations/answers/browser/watch-${action}`,
        input,
        { network: true, read: action === 'status' }
      ),
      input.id
    );
  const unread = async (action, input) =>
    checkUnreadReview(
      await (remote.report ?? remote.post)(
        `/api/automations/answers/browser/unread-${action}`,
        input,
        { network: true, read: action === 'status' }
      ),
      input.id
    );
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
      for (const sources of [
        result.watchSources,
        result.textSources,
        result.noticeSources,
        result.unreadSources,
        result.unreadNoticeSources,
      ]) {
        if (
          sources !== undefined &&
          (!validChoiceSources(sources) ||
            sources.some(
              ({ id }) => !result.sources.some((source) => source.id === id)
            ))
        ) {
          throw failure(result);
        }
      }
      return result;
    },
    inspectBrowserAnswer: (input) => call('inspect', input),
    startBrowserUnreadReview: (input) => unread('start', input),
    browserUnreadReviewStatus: (input) => unread('status', input),
    stopBrowserUnreadReview: (input) => unread('stop', input),
    prefillBrowserAnswer: (input) => call('prefill', input),
    selectBrowserAnswer: (input) => call('select', input),
    replyBrowserText: (input) => call('reply-text', input),
    browserAnswerStatus: (input) => call('status', input),
    startBrowserAnswerWatch: (input) => watch('start', input),
    browserAnswerWatchStatus: (input) => watch('status', input),
    stopBrowserAnswerWatch: (input) => watch('stop', input),
  };
};
