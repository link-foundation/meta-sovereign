// The same read-only history exporter as Chat/Operator, with account/store
// ownership kept until the background job has closed all of its output files.
import { defaultStoreDir } from '../storage/app-directory.js';
import { createTelegramAccount } from '../sources/telegram-account.js';
import { MEDIA_KEYS, parseExport } from '../sources/telegram-export.js';

export const TELEGRAM_EXPORT_HELP = `  telegram-export --chat=<id|@username|t.me/link> --folder=<absolute-path>
                [--scope=active|all] [--gap-hours=4] [--max-lines=1500]
                [--formats=markdown|html|json|html,json] [--media=all|none|photos,files,...]
                [--size-limit-mb=8] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--store=<dir>] [--debug=true|false]
                active is the CLI default; Markdown includes linked structured JSON parts`;

const requestOf = (args) => {
  const kinds = String(args.media ?? 'all').split(',');
  const valid =
    kinds.every((kind) => MEDIA_KEYS.includes(kind)) ||
    (kinds.length === 1 && ['all', 'none'].includes(kinds[0]));
  if (
    !valid ||
    ![undefined, true, false, 'true', 'false'].includes(args.debug)
  ) {
    return { ok: false, code: 'bad-request' };
  }
  return parseExport({
    chat: args.chat,
    chatName: args.name,
    folder: args.folder,
    scope: args.scope ?? 'active',
    debug: args.debug === true || args.debug === 'true',
    gapHours: Number(args['gap-hours'] ?? 4),
    maxLines: Number(args['max-lines'] ?? 1500),
    sizeLimitMb: Number(args['size-limit-mb'] ?? 8),
    from: args.from,
    to: args.to,
    formats: String(args.formats ?? 'markdown').split(','),
    media: Object.fromEntries(
      MEDIA_KEYS.map((key) => [key, kinds[0] === 'all' || kinds.includes(key)])
    ),
  });
};

const completed = async (account, sleep) => {
  for (;;) {
    const result = await account.exportStatus();
    if (!['running', 'cancelling'].includes(result.job?.state)) {
      return result;
    }
    await sleep(200);
  }
};

export const createTelegramExportCommands = ({
  openStore,
  createAccount = createTelegramAccount,
  sleep = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)),
} = {}) => ({
  'telegram-export': async (args, log) => {
    const request = requestOf(args);
    if (!request.ok || typeof args.folder !== 'string') {
      log(JSON.stringify({ ok: false, code: 'bad-request' }));
      return 1;
    }
    const store = await openStore(args.store ?? defaultStoreDir());
    let account;
    let interrupted = false;
    const cancel = () => {
      interrupted = true;
      account?.exportCancel().catch(() => {});
    };
    try {
      account = createAccount({
        store,
        pollMs: 0,
        log: (event) => {
          if (
            request.value.debug &&
            event?.level === 'debug' &&
            event.event?.startsWith('telegram_export_')
          ) {
            log(JSON.stringify(event));
          }
        },
      });
      process.once('SIGINT', cancel);
      const started = await account.exportStart(request.value);
      if (!started.ok) {
        log(JSON.stringify(started));
        return 1;
      }
      if (interrupted) {
        await account.exportCancel();
      }
      const result = await completed(account, sleep);
      log(JSON.stringify(result, null, 2));
      return result.job?.state === 'done' ? 0 : 1;
    } finally {
      process.removeListener('SIGINT', cancel);
      try {
        await account?.stop?.();
      } finally {
        await store.close();
      }
    }
  },
});
