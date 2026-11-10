import { defaultStoreDir } from '../storage/app-directory.js';
import { createTelegramAccount } from '../sources/telegram-account.js';
import { exportTarget } from '../sources/telegram-export-target.js';
import { scanOptions } from '../sources/telegram-chat-users-shape.js';
import { groupGreetingOptions } from '../sources/telegram-group-greeting-shape.js';

export const TELEGRAM_GROUP_GREETING_HELP = `  telegram-greet-group --chat=<group-id|@group|t.me/link> [--limit=0] [--delay-ms=30000]
                [--participants-limit=10000] [--sticker=<document-id>] [--confirm=true] [--store=<dir>]
                Scans participants and previews eligible private greetings by default. Zero limit selects all eligible users.
                Confirmation sends the reviewed selection with acknowledgements and 24-hour deduplication; the first error stops.`;
export const groupGreetingRequest = (args = {}) => {
  if (![undefined, true, false, 'true', 'false'].includes(args.confirm)) {
    return null;
  }
  const chat = exportTarget(args.chat);
  const scan = scanOptions({
    participantsLimit: Number(args['participants-limit'] ?? 10_000),
    messagesLimit: 0,
  });
  const options = groupGreetingOptions({
    limit: Number(args.limit ?? 0),
    delayMs: Number(args['delay-ms'] ?? 30_000),
    sticker: args.sticker,
  });
  return chat && scan && options
    ? {
        chat,
        scan,
        options,
        confirm: args.confirm === true || args.confirm === 'true',
      }
    : null;
};
const complete = async (account, sleep, id) => {
  for (;;) {
    const result = await account.chatUsersStatus();
    if (!result.ok || result.job?.id !== id) {
      throw new Error('job-changed');
    }
    if (!['running', 'cancelling'].includes(result.job.state)) {
      return result;
    }
    await sleep(200);
  }
};
const pages = async (account, id) => {
  const results = [];
  for (let offset = 0; ;) {
    const page = await account.chatUsersStatus({ offset, limit: 500 });
    if (!page.ok || page.job?.id !== id) {
      throw new Error('job-changed');
    }
    results.push(...page.results);
    if (!page.more) {
      return { job: page.job, results };
    }
    if (!page.results.length || results.length > 100_000) {
      throw new Error('invalid-page');
    }
    offset += page.results.length;
  }
};
const run = async (account, request, cancelled, sleep) => {
  const started = await account.chatUsersGreetingsStart({
    chat: request.chat,
    ...request.scan,
  });
  if (!started.ok) {
    return started;
  }
  if (cancelled()) {
    await account.chatUsersCancel();
  }
  const scan = await complete(account, sleep, started.job.id);
  if (cancelled() || scan.job.state !== 'done') {
    return { ...scan, ok: false };
  }
  const preview = await account.chatUsersGreetingsPreview({
    jobId: scan.job.id,
    ...request.options,
  });
  if (!preview.ok || !request.confirm || cancelled()) {
    return { ok: preview.ok && !cancelled(), preview, applied: false };
  }
  const applied = await account.chatUsersGreetingsApply({
    planId: preview.planId,
    confirm: true,
  });
  if (!applied.ok) {
    return applied;
  }
  if (cancelled()) {
    await account.chatUsersCancel();
  }
  await complete(account, sleep, applied.job.id);
  const report = await pages(account, applied.job.id);
  return {
    ok: !cancelled() && report.job.state === 'done',
    ...report,
    preview,
    applied: true,
  };
};
export const createTelegramGroupGreetingCommands = ({
  openStore,
  createAccount = createTelegramAccount,
  sleep = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)),
} = {}) => ({
  'telegram-greet-group': async (args, log) => {
    const request = groupGreetingRequest(args);
    if (!request) {
      log(JSON.stringify({ ok: false, code: 'bad-request' }));
      return 1;
    }
    const store = await openStore(args.store ?? defaultStoreDir());
    let account;
    let interrupted = false;
    const cancel = () => {
      interrupted = true;
      account?.chatUsersCancel().catch(() => {});
    };
    try {
      account = createAccount({ store, pollMs: 0 });
      process.once('SIGINT', cancel);
      process.once('SIGTERM', cancel);
      const report = await run(account, request, () => interrupted, sleep);
      log(JSON.stringify(report, null, 2));
      return report.ok && !interrupted ? 0 : 1;
    } finally {
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
      try {
        await account?.stop?.();
      } finally {
        await store.close();
      }
    }
  },
});
