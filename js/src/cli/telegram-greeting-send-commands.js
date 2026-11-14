import { defaultStoreDir } from '../storage/app-directory.js';
import { createTelegramAccount } from '../sources/telegram-account.js';
import { greetingSendRequest } from '../sources/telegram-greeting-target.js';

export const TELEGRAM_GREETING_SEND_HELP = `  telegram-bot-start --chat=<@bot|id> [--confirm=true] [--store=<dir>]
  telegram-greet --chat=<@username|signed-id|t.me/link> [--sticker=<document-id>]
                [--confirm=true] [--store=<dir>]
                Preview by default. Confirmation sends one reviewed /start or cached greeting, with Telegram acknowledgement.`;
const request = (args, operation) => {
  const confirm = args.confirm;
  if (![undefined, true, false, 'true', 'false'].includes(confirm)) {
    return null;
  }
  const body = greetingSendRequest({
    chat: args.chat,
    operation,
    ...(args.sticker === undefined ? {} : { sticker: args.sticker }),
  });
  return body
    ? { body, confirm: confirm === true || confirm === 'true' }
    : null;
};
const run = async (dependencies, operation, args, log) => {
  const parsed = request(args, operation);
  if (!parsed) {
    log(JSON.stringify({ ok: false, code: 'bad-request' }));
    return 1;
  }
  const store = await dependencies.openStore(args.store ?? defaultStoreDir());
  let account;
  let interrupted = false;
  const cancel = () => {
    interrupted = true;
    account?.greetingSendCancel().catch(() => {});
  };
  try {
    account = dependencies.createAccount({ store, pollMs: 0 });
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    const plan = await account.greetingSendPreview(parsed.body);
    let answer = plan;
    if (interrupted) {
      answer = { ok: false, code: 'cancelled' };
    } else if (parsed.confirm && plan.ok && plan.willSend) {
      answer = await account.greetingSendApply({
        planId: plan.planId,
        confirm: true,
      });
    }
    log(JSON.stringify(answer, null, 2));
    return !interrupted &&
      answer.ok &&
      (!parsed.confirm || answer.status === 'sent')
      ? 0
      : 1;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    try {
      await account?.stop?.();
    } finally {
      await store.close();
    }
  }
};
export const createTelegramGreetingSendCommands = ({
  openStore,
  createAccount = createTelegramAccount,
} = {}) =>
  Object.fromEntries(
    [
      ['telegram-bot-start', 'bot-start'],
      ['telegram-greet', 'greeting-sticker'],
    ].map(([name, operation]) => [
      name,
      (args, log) => run({ openStore, createAccount }, operation, args, log),
    ])
  );
