import { defaultStoreDir } from '../storage/app-directory.js';
import { createTelegramAccount } from '../sources/telegram-account.js';
import { exportTarget } from '../sources/telegram-export-target.js';
import {
  scanOptions,
  contactOptions,
} from '../sources/telegram-chat-users-shape.js';

export const TELEGRAM_USERS_HELP = `  telegram-users --chat=<id|@username|t.me/link> [--participants-limit=10000] [--messages-limit=100000]
  telegram-chat-contacts --chat=<id|@username|t.me/link> [--limit=0] [--delay-ms=10000]
                [--apply=true] [--share-phone=true] [--include-existing=true] [--store=<dir>]
                Contacts are previewed by default; phone sharing is off. Scan limits also apply.
                Zero participants means unlimited; zero messages disables history. [--debug=true]`;
const bool = (value) =>
  [undefined, true, false, 'true', 'false'].includes(value);
const on = (value) => value === true || value === 'true';
const successfulReport = (report) =>
  report.job?.state === 'done' && report.preview?.ok !== false && !report.error;
export const usersCommandRequest = (args) => {
  if (
    !['apply', 'share-phone', 'include-existing', 'debug'].every((key) =>
      bool(args[key])
    )
  ) {
    return null;
  }
  const chat = exportTarget(args.chat);
  const scan = scanOptions({
    participantsLimit: Number(args['participants-limit'] ?? 10_000),
    messagesLimit: Number(args['messages-limit'] ?? 100_000),
    debug: on(args.debug),
  });
  const contacts = contactOptions({
    limit: Number(args.limit ?? 0),
    delayMs: Number(args['delay-ms'] ?? 10_000),
    sharePhone: on(args['share-phone']),
    includeExisting: on(args['include-existing']),
  });
  return chat && scan && contacts
    ? { chat, ...scan, contacts, apply: on(args.apply) }
    : null;
};
const completed = async (account, sleep) => {
  for (;;) {
    const result = await account.chatUsersStatus();
    if (!['running', 'cancelling'].includes(result.job?.state)) {
      return result;
    }
    await sleep(200);
  }
};
export const allUsersPages = async (account) => {
  const users = [];
  const results = [];
  let offset = 0;
  for (;;) {
    const page = await account.chatUsersStatus({ offset, limit: 500 });
    if (!page.ok) {
      throw new Error('status-failed');
    }
    users.push(...page.users);
    results.push(...page.results);
    if (!page.more) {
      return { job: page.job, users, results };
    }
    const count = page.users.length + page.results.length;
    if (!count) {
      throw new Error('invalid-page');
    }
    offset += count;
  }
};
const contactRun = async (account, request, scan, interrupted, sleep) => {
  const preview = await account.chatUsersContactsPreview({
    jobId: scan.job.id,
    ...request.contacts,
  });
  if (!preview.ok || !request.apply || interrupted()) {
    return { ...scan, preview, applied: false };
  }
  const applied = await account.chatUsersContactsApply({
    planId: preview.planId,
    confirm: true,
  });
  if (!applied.ok) {
    return { ...scan, applied: false, error: applied };
  }
  if (interrupted()) {
    await account.chatUsersCancel();
  }
  await completed(account, sleep);
  return { ...(await allUsersPages(account)), preview, applied: true };
};
export const createTelegramUsersCommands = ({
  openStore,
  createAccount = createTelegramAccount,
  sleep = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)),
} = {}) => {
  const run = (contacts) => async (args, log) => {
    const request = usersCommandRequest(args);
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
      account = createAccount({
        store,
        pollMs: 0,
        log: (event) => {
          if (
            request.debug &&
            event?.event === 'telegram_chat_users_progress'
          ) {
            log(JSON.stringify(event));
          }
        },
      });
      process.once('SIGINT', cancel);
      const started = await account.chatUsersStart(request);
      if (!started.ok) {
        log(JSON.stringify(started));
        return 1;
      }
      if (interrupted) {
        await account.chatUsersCancel();
      }
      await completed(account, sleep);
      const scan = await allUsersPages(account);
      const report =
        contacts && scan.job.state === 'done' && !interrupted
          ? await contactRun(account, request, scan, () => interrupted, sleep)
          : scan;
      log(JSON.stringify(report, null, 2));
      return !interrupted && successfulReport(report) ? 0 : 1;
    } finally {
      process.removeListener('SIGINT', cancel);
      try {
        await account?.stop?.();
      } finally {
        await store.close();
      }
    }
  };
  return { 'telegram-users': run(false), 'telegram-chat-contacts': run(true) };
};
