import { readFile, stat } from 'node:fs/promises';
import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { defaultStoreDir } from '../storage/app-directory.js';
import { createTelegramAccount } from '../sources/telegram-account.js';
import { codedError } from '../sources/http.js';
import { createPublicationService } from '../broadcast/service.js';
import { saveTarget, removeTarget } from '../broadcast/targets.js';
import {
  BROADCAST_CREDENTIALS,
  credentialStatus,
  saveBroadcastCredentials,
} from '../broadcast/credentials.js';
import { confirmCli } from './confirm.js';

export const BROADCAST_HELP = `  broadcast-targets [--store=<dir>]
  broadcast-target-save --id=<id> --label=<name> --network=telegram|vk|x --kind=channel|group|personal-wall|community-wall|account [--destination=<id|@name>] [--auth-mode=<mode>] [--format=plain|html] [--enabled=true|false]
  broadcast-target-remove --id=<id>
  broadcast-credentials --network=telegram|vk|x [--file=<private-json-file>]
  broadcast-setup --network=telegram|vk|x (interactive masked credential input)
  broadcast-preview --text=<message> --targets=<id,id> | --all [--debug=true|false]
  broadcast-send (preview flags) [--request-id=<stable-id>] [--yes]
  broadcast-test --id=<destination-id> (read-only identity test)
  broadcast-history [--id=<publication-id>] [--limit=50]
  broadcast-delete --id=<publication-id> [--targets=<id,id>] [--yes]
                all broadcast commands accept --store=<dir>; legacy broadcast --networks still queues`;

const list = (value) =>
  value === undefined
    ? undefined
    : String(value)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
const boolean = (value, fallback) => {
  if (value === undefined) {
    return fallback;
  }
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }
  throw codedError('Boolean options must be true or false', 'bad-config');
};
const options = (args) => ({
  text: args.text,
  targetIds: list(args.targets),
  all: boolean(args.all, false),
  requestId: args['request-id'],
  debug: boolean(args.debug, false),
});
const target = (args) => ({
  id: args.id,
  label: args.label,
  network: args.network,
  kind: args.kind,
  destination: args.destination,
  authMode: args['auth-mode'],
  format: args.format,
  enabled: boolean(args.enabled, true),
  fromGroup: boolean(args['from-group'], undefined),
  signed: boolean(args.signed, undefined),
});
const credentialFile = async (file) => {
  if ((await stat(file)).size > 65_536) {
    throw codedError('Credential file is larger than 64 KiB', 'bad-config');
  }
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw codedError(
      'Credential file must contain a valid object; its contents are not logged',
      'bad-config'
    );
  }
};
// readline owns raw mode; its muted output prevents terminal echo of the secret.
const askSecret = async (label) => {
  if (!process.stdin.isTTY) {
    throw codedError(
      'Interactive setup needs a terminal; use a private credential file or environment variables',
      'bad-config'
    );
  }
  const muted = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  process.stdout.write(`${label} (blank preserves saved value): `);
  const reader = createInterface({
    input: process.stdin,
    output: muted,
    terminal: true,
  });
  try {
    return await reader.question('');
  } finally {
    reader.close();
    muted.end();
    process.stdout.write('\n');
  }
};
const setup = async (store, args, ask = askSecret) => {
  const fields = BROADCAST_CREDENTIALS[args.network];
  if (!Object.hasOwn(BROADCAST_CREDENTIALS, args.network)) {
    throw codedError('Choose a broadcast credential provider', 'bad-config');
  }
  const values = {};
  for (const key of Object.keys(fields)) {
    const value = await ask(key);
    if (value?.trim()) {
      values[key] = value;
    }
  }
  return saveBroadcastCredentials(store, args.network, values);
};

export const createBroadcastCommands = ({
  openStore,
  openReadOnly = openStore,
  resolveSource,
  createAccount = createTelegramAccount,
  ask,
  askCredential,
} = {}) => {
  const command =
    (run, { writable = false, account = false } = {}) =>
    async (args, log) => {
      const store = await (writable ? openStore : openReadOnly)(
        args.store ?? defaultStoreDir()
      );
      let telegramAccount;
      try {
        telegramAccount = account
          ? createAccount({ store, pollMs: 0, log: () => {} })
          : null;
        const service = createPublicationService({
          store,
          telegramAccount,
          resolveSource,
        });
        const result = await run({ store, service, args, log });
        if (result !== undefined) {
          log(JSON.stringify(result, null, 2));
        }
        return result?.ok === false ||
          ['failed', 'unknown', 'partial'].includes(result?.status)
          ? 1
          : 0;
      } finally {
        try {
          await telegramAccount?.stop?.();
        } finally {
          await store.close?.();
        }
      }
    };
  return {
    'broadcast-targets': command(({ service }) => service.targets()),
    'broadcast-target-save': command(
      async ({ store, args }) => saveTarget(store, target(args)),
      { writable: true }
    ),
    'broadcast-target-remove': command(
      ({ store, args }) => removeTarget(store, args.id),
      { writable: true }
    ),
    'broadcast-credentials': command(
      ({ store, args }) =>
        args.file
          ? credentialFile(args.file).then((values) =>
              saveBroadcastCredentials(store, args.network, values)
            )
          : credentialStatus(store, args.network),
      { writable: true }
    ),
    'broadcast-setup': command(
      ({ store, args }) => setup(store, args, askCredential),
      { writable: true }
    ),
    'broadcast-preview': command(
      async ({ service, args }) =>
        (await service.prepare(options(args))).preview,
      { account: true }
    ),
    'broadcast-send': command(
      async ({ service, args, log }) => {
        const plan = await service.prepare(options(args));
        log(JSON.stringify(plan.preview, null, 2));
        if (
          !(await confirmCli('Publish this text to these destinations?', {
            args,
            log,
            ask,
          }))
        ) {
          return { status: 'cancelled' };
        }
        return service.publish(plan.data);
      },
      { writable: true, account: true }
    ),
    'broadcast-test': command(({ service, args }) => service.test(args.id), {
      writable: true,
      account: true,
    }),
    'broadcast-history': command(({ service, args }) =>
      args.id ? service.get(args.id) : service.history(Number(args.limit ?? 50))
    ),
    'broadcast-delete': command(
      async ({ service, args, log }) => {
        const plan = await service.prepareDelete({
          id: args.id,
          targetIds: list(args.targets)?.map((id) =>
            id.startsWith('broadcast-target:') ? id : `broadcast-target:${id}`
          ),
        });
        log(JSON.stringify(plan.preview, null, 2));
        if (
          !(await confirmCli('Delete these published posts?', {
            args,
            log,
            ask,
          }))
        ) {
          return { status: 'cancelled' };
        }
        const result = await service.deletePublished(plan.data);
        return {
          ...result,
          ok: plan.data.entries.every(
            ({ target }) =>
              result.results.find((entry) => entry.targetId === target.id)
                ?.deletion?.status === 'deleted'
          ),
        };
      },
      { writable: true, account: true }
    ),
  };
};
