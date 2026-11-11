export const questionBrowserCommand = async (args, browser, options = {}) => {
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
    select: () =>
      browser.select({
        id: args.id,
        option: args.option,
        confirm: [true, 'true'].includes(args.confirm),
      }),
    status: () => browser.status({ id: args.id }),
  };
  if (!Object.hasOwn(actions, action)) {
    throw new Error(
      'answers browser expects show | inspect --source=hh --chat=<web-reference> [--browser-url=<application-url>] | prefill --id=<review> | select --id=<review> --option=<exact-label> --confirm=true | status --id=<review>'
    );
  }
  return actions[action]();
};
