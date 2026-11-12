import { randomUUID } from 'node:crypto';
import { ownBrowserCommand } from './question-browser-foreground.js';

/** The CLI owns the finite pass until completion or a drained termination signal. */
export const questionUnreadCommand = async (
  args,
  browser,
  options,
  progress = () => {}
) => {
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
