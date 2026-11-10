import { encodeLinoValue } from '../transport/lino.js';
import { followTelegramCommands } from './follow-telegram-commands.js';
import { followBacklinkCommands } from './follow-backlink-commands.js';
import {
  extractFollowLinks,
  listFollowLinks,
  clearFollowLinks,
} from '../follow/link-cache.js';

const discoveryArgs = (args) =>
  Object.fromEntries(
    Object.entries({
      'telegram-only': 'telegramOnly',
      'member-offset': 'memberOffset',
      'member-limit': 'memberLimit',
      'message-limit': 'messageLimit',
    })
      .filter(([key]) => args[key] !== undefined)
      .map(([key, name]) => [name, args[key]])
  );

export const followCommands = async ({
  args,
  store,
  log,
  followDiscovery,
  createAccount,
  followBacklinks,
}) => {
  if (args._[1] === 'backlinks') {
    return followBacklinkCommands({
      args,
      store,
      log,
      followBacklinks,
      createAccount,
    });
  }
  if (args._[1] === 'telegram') {
    return followTelegramCommands({ args, store, log, createAccount });
  }
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
  const sub = args._[1] ?? 'links';
  if (sub === 'chats' || sub === 'details') {
    const result = await followDiscovery[sub]({
      ...input,
      ...discoveryArgs(args),
    });
    log(args.json ? JSON.stringify(result, null, 2) : encodeLinoValue(result));
    return 0;
  }
  const actions = {
    links: listFollowLinks,
    extract: extractFollowLinks,
    clear: clearFollowLinks,
  };
  const action = actions[sub];
  if (!action) {
    throw new Error(
      'follow expects chats | details | links | extract | clear [--source=<provider>] [--chat=<id>] [--self=<id,id>] [--limit=<n>] [--offset=<n>]'
    );
  }
  const result = await action(store, input);
  log(args.json ? JSON.stringify(result, null, 2) : encodeLinoValue(result));
  return 0;
};
