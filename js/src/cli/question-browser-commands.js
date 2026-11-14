import { questionWatchCommand } from './question-watch-commands.js';
import { questionUnreadCommand } from './question-unread-commands.js';

export const questionBrowserCommand = async (
  args,
  browser,
  options = {},
  progress
) => {
  const action = args._[2] ?? 'show';
  if (action === 'show') {
    return browser.capabilities();
  }
  const actions = {
    inspect: () =>
      browser.inspect({
        ...options,
        source: args.source,
        chat: args.chat === undefined ? undefined : String(args.chat),
        ...(args['browser-url'] ? { browserUrl: args['browser-url'] } : {}),
      }),
    prefill: () => browser.prefill({ id: args.id }),
    unread: () => questionUnreadCommand(args, browser, options, progress),
    'unread-status': () => browser.unreadStatus({ id: args['pass-id'] }),
    'unread-stop': () => browser.unreadStop({ id: args['pass-id'] }),
    'reply-text': () =>
      browser.replyText({
        id: args.id,
        text: args.text,
        confirm: [true, 'true'].includes(args.confirm),
      }),
    select: () =>
      browser.select({
        id: args.id,
        option: args.option,
        confirm: [true, 'true'].includes(args.confirm),
      }),
    status: () => browser.status({ id: args.id }),
    watch: () => questionWatchCommand(args, browser, progress),
    'watch-status': () => browser.watchStatus({ id: args['watch-id'] }),
    'watch-stop': () => browser.watchStop({ id: args['watch-id'] }),
  };
  if (!Object.hasOwn(actions, action)) {
    throw new Error(
      'answers browser expects show | inspect --source=hh --chat=<web-reference> [--browser-url=<application-url>] | prefill --id=<review> | select --id=<review> --option=<exact-label> --confirm=true | reply-text --id=<review> --text=<reviewed-reply> --confirm=true | status --id=<review> | unread --source=hh --confirm=true [--pass-id=<request-id>] [--max-chats=20] [--budget-ms=30000] [--notice-replies=true|false] [--poll-interval-ms=10000] [--poll-duration-ms=7200000] [--poll-retry-max-ms=60000] [--poll-failures=3] | unread-status --pass-id=<id> | unread-stop --pass-id=<id> | watch --id=<review> --confirm=true [--duration-ms=7200000] [--watch-id=<request-id>] [--notice-replies=true|false] [--poll-interval-ms=10000] [--poll-duration-ms=7200000] [--poll-retry-max-ms=60000] [--poll-failures=3] | watch-status --watch-id=<id> | watch-stop --watch-id=<id>'
    );
  }
  return actions[action]();
};
