import { encodeLinoValue } from '../transport/lino.js';
import {
  extractFollowLinks,
  listFollowLinks,
  clearFollowLinks,
} from '../follow/link-cache.js';

export const followCommands = async ({ args, store, log }) => {
  const input = {
    ...(args.source ? { source: args.source } : {}),
    ...(args.chat ? { chat: args.chat } : {}),
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
    ...(args.offset !== undefined ? { offset: args.offset } : {}),
    self: String(args.self ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
  const actions = {
    links: listFollowLinks,
    extract: extractFollowLinks,
    clear: clearFollowLinks,
  };
  const action = actions[args._[1] ?? 'links'];
  if (!action) {
    throw new Error(
      'follow expects links | extract | clear [--source=<provider>] [--chat=<id>] [--self=<id,id>] [--limit=<n>] [--offset=<n>]'
    );
  }
  const result = await action(store, input);
  log(args.json ? JSON.stringify(result, null, 2) : encodeLinoValue(result));
  return 0;
};
