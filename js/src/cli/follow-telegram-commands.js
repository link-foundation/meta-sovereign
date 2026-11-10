import { createTelegramAccount } from '../sources/telegram-account.js';
import { encodeLinoValue } from '../transport/lino.js';

const bool = (value) => {
  if (value === undefined) {
    return null;
  }
  if ([true, false, 'true', 'false'].includes(value)) {
    return value === true || value === 'true';
  }
  throw new Error('expected true or false');
};
export const followTelegramCommands = async ({
  args,
  store,
  log,
  createAccount = createTelegramAccount,
}) => {
  const action = args._[2] ?? 'list';
  if (!['list', 'join', 'leave', 'preferences'].includes(action)) {
    throw new Error(
      'follow telegram expects list | join | leave | preferences'
    );
  }
  const confirm = bool(args.confirm) === true;
  const input =
    action === 'list'
      ? { limit: args.limit, cursor: args.cursor }
      : {
          target: args.target,
          operation: action,
          mute: bool(args.mute),
          archive: bool(args.archive),
        };
  let account;
  let interrupted = false;
  const cancel = () => {
    interrupted = true;
    account?.followTelegramCancel().catch(() => {});
  };
  try {
    account = createAccount({ store, pollMs: 0 });
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    let result =
      action === 'list'
        ? await account.followTelegramList(input)
        : await account.followTelegramPreview(input);
    if (!interrupted && confirm && action !== 'list' && result.ok) {
      const preview = result;
      result = {
        ...(await account.followTelegramApply({
          planId: preview.planId,
          confirm: true,
        })),
        preview,
      };
    }
    if (interrupted) {
      result = { ...result, ok: false, code: 'cancelled' };
    }
    log(args.json ? JSON.stringify(result, null, 2) : encodeLinoValue(result));
    return result.ok ? 0 : 1;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    await account?.stop?.();
  }
};
