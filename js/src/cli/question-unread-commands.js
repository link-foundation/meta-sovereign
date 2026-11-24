import { randomUUID } from 'node:crypto';
import { ownBrowserCommand } from './question-browser-foreground.js';
import { normalizeUnreadPolling } from '../automation/question-unread-polling-state.js';

const pollingFlags = (args) => {
  const fields = [
    ['poll-interval-ms', 'intervalMs'],
    ['poll-duration-ms', 'durationMs'],
    ['poll-retry-max-ms', 'retryMaxMs'],
    ['poll-failures', 'maxFailures'],
  ].filter(([flag]) => args[flag] !== undefined);
  for (const [flag] of fields) {
    if (!/^\d+$/u.test(String(args[flag]))) {
      throw new Error(`${flag} must be an integer`);
    }
  }
  return fields.length
    ? {
        polling: normalizeUnreadPolling(
          Object.fromEntries(
            fields.map(([flag, key]) => [key, Number(args[flag])])
          )
        ),
      }
    : {};
};

/** The CLI owns the finite pass until completion or a drained termination signal. */
export const questionUnreadCommand = async (
  args,
  browser,
  options,
  progress = () => {}
) => {
  for (const flag of ['notice-replies', 'answer-chats', 'prefill-forms']) {
    if (
      args[flag] !== undefined &&
      ![true, false, 'true', 'false'].includes(args[flag])
    ) {
      throw new Error(`${flag} must be true or false`);
    }
  }
  const id = args['pass-id'] ?? `question-unread:${randomUUID()}`;
  return ownBrowserCommand({
    id,
    progress,
    start: () =>
      browser.unreadStart({
        ...options,
        source: args.source,
        id,
        confirm: [true, 'true'].includes(args.confirm),
        ...pollingFlags(args),
        ...(args['notice-replies'] === undefined
          ? {}
          : { noticeReplies: [true, 'true'].includes(args['notice-replies']) }),
        ...(args['answer-chats'] === undefined
          ? {}
          : { answerChats: [true, 'true'].includes(args['answer-chats']) }),
        ...(args['prefill-forms'] === undefined
          ? {}
          : { prefillForms: [true, 'true'].includes(args['prefill-forms']) }),
        ...Object.fromEntries(
          [
            ['max-chats', 'maxChats'],
            ['budget-ms', 'budgetMs'],
            ['limit', 'limit'],
            ['max-passes', 'maxPasses'],
            ['wait-ms', 'waitMs'],
            ['end-wait-ms', 'endWaitMs'],
          ]
            .filter(([flag]) => args[flag] !== undefined)
            .map(([flag, key]) => [key, Number(args[flag])])
        ),
      }),
    status: browser.unreadStatus,
    stop: browser.unreadStop,
  });
};
