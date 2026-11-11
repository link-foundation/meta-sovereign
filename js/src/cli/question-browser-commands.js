import { questionWatchCommand } from './question-watch-commands.js';

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
      'answers browser expects show | inspect --source=hh --chat=<web-reference> [--browser-url=<application-url>] | prefill --id=<review> | select --id=<review> --option=<exact-label> --confirm=true | reply-text --id=<review> --text=<reviewed-reply> --confirm=true | status --id=<review> | watch --id=<review> --confirm=true [--duration-ms=7200000] [--watch-id=<request-id>] | watch-status --watch-id=<id> | watch-stop --watch-id=<id>'
    );
  }
  return actions[action]();
};
