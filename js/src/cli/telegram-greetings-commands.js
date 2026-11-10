import { defaultStoreDir } from '../storage/app-directory.js';
import { createTelegramAccount } from '../sources/telegram-account.js';
import {
  stickerRefreshOptions,
  stickerPageOptions,
} from '../sources/telegram-greeting-stickers-shape.js';

export const TELEGRAM_GREETINGS_HELP = `  telegram-greeting-stickers [--refresh=true] [--max-sets=1000] [--max-documents=10000]
                [--greetings-only=false] [--offset=0] [--limit=100] [--store=<dir>]
                Reads the connected user's cache. Refresh discovers featured, mask, recent and favourite stickers; it sends nothing.`;
const bool = (value) =>
  [undefined, true, false, 'true', 'false'].includes(value);
const on = (value) => value === true || value === 'true';
export const greetingCatalogRequest = (args) => {
  if (!bool(args.refresh) || !bool(args['greetings-only'])) {
    return null;
  }
  const options = stickerRefreshOptions({
    maxSets: Number(args['max-sets'] ?? 1000),
    maxDocuments: Number(args['max-documents'] ?? 10_000),
  });
  const page = stickerPageOptions({
    offset: Number(args.offset ?? 0),
    limit: Number(args.limit ?? 100),
    greetingsOnly:
      args['greetings-only'] === undefined || on(args['greetings-only']),
  });
  return options && page ? { options, page, refresh: on(args.refresh) } : null;
};
const waitForCatalog = async (account, id, page, sleep) => {
  for (;;) {
    const answer = await account.greetingStickersStatus(page);
    if (!answer.ok) {
      return answer;
    }
    if (answer.job?.id !== id) {
      return { ok: false, code: 'account-changed' };
    }
    if (!['running', 'cancelling'].includes(answer.job.state)) {
      return answer;
    }
    await sleep(200);
  }
};
export const createTelegramGreetingCommands = ({
  openStore,
  createAccount = createTelegramAccount,
  sleep = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)),
} = {}) => ({
  'telegram-greeting-stickers': async (args, log) => {
    const request = greetingCatalogRequest(args);
    if (!request) {
      log(JSON.stringify({ ok: false, code: 'bad-request' }));
      return 1;
    }
    const store = await openStore(args.store ?? defaultStoreDir());
    let account;
    let interrupted = false;
    const cancel = () => {
      interrupted = true;
      account?.greetingStickersCancel().catch(() => {});
    };
    try {
      account = createAccount({ store, pollMs: 0 });
      process.once('SIGINT', cancel);
      process.once('SIGTERM', cancel);
      let answer;
      if (request.refresh) {
        const started = await account.greetingStickersRefresh(request.options);
        if (!started.ok) {
          log(JSON.stringify(started));
          return 1;
        }
        if (interrupted) {
          await account.greetingStickersCancel();
        }
        answer = await waitForCatalog(
          account,
          started.job.id,
          request.page,
          sleep
        );
      } else {
        answer = await account.greetingStickersStatus(request.page);
      }
      log(JSON.stringify(answer, null, 2));
      return !interrupted &&
        answer.ok &&
        (!request.refresh || answer.job?.state === 'done')
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
  },
});
