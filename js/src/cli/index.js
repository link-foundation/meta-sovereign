/**
 * meta-sovereign CLI (R-F2).
 *
 * Subcommands cover the full feature surface so every capability the
 * server exposes is also reachable from the terminal: import/export,
 * backup/restore, serve, sources, audience, facts, search, broadcast,
 * sync (listen/connect), patterns (infer/list), graphs (run/list),
 * replies (list), profile/resume, cv (platforms/plan/read/diff/sync/
 * telemetry over browser-commander), automations (plan/run/review drafts),
 * greetings (stickers/select/plan/send).
 *
 * Returns an exit code instead of calling `process.exit`, keeping the
 * entry point unit-testable.
 */

import { defaultStoreDir, resolveUserStore } from '../storage/app-directory.js';
import path from 'node:path';
import { maybeOpenHostedApp } from './browser-open.js';
import {
  upgradeRunningServer,
  startRollingCliServer,
} from './rolling-serve.js';
import { CONTACTS_HELP, createContactCommands } from './contact-commands.js';
import {
  TELEGRAM_EXPORT_HELP,
  createTelegramExportCommands,
} from './telegram-export-commands.js';
import { promises as fs } from 'node:fs';
import { parseArgs } from './lino-args.js';
import { CV_HELP, createCvCommands } from './cv-commands.js';
import { BROWSER_HELP, createBrowserCommands } from './browser-commands.js';
import {
  BROADCAST_HELP,
  createBroadcastCommands,
} from './broadcast-commands.js';
import {
  AUTOMATION_HELP,
  createAutomationCommands,
} from './automation-commands.js';
import {
  GREETINGS_HELP,
  createGreetingCommands,
} from './greetings-commands.js';
import {
  TRUST_HELP,
  createTrustCommands,
  setupLocalCertificate,
} from './trust-commands.js';
import {
  MIGRATE_HELP,
  SCHEMA_ERROR_CODES,
  createMigrateCommands,
  migrationNotice,
} from './migrate-commands.js';
import {
  openDualStore,
  bulkPurge,
  isTombstone,
  deletedAtOf,
  createVault,
} from '../storage/index.js';
import {
  makeBackup,
  pruneBackups,
  restoreBackup,
  restoreBackupToDir,
} from '../storage/backup.js';
import {
  recoveryFormats,
  pruneRecoveryDumps,
} from '../storage/recovery-dump.js';
import {
  readRecoverySettings,
  saveRecoverySettings,
  validateRecoverySettings,
} from '../storage/recovery-settings.js';
import { writeEncryptedExport } from '../storage/export-encrypted.js';
import { CURRENT_SCHEMA } from '../storage/migrations/index.js';
import {
  listCvSources,
  listSources,
  importInto,
  pullLiveInto,
} from '../sources/index.js';
import { createEmailLive } from '../sources/email.js';
import { createNodeEmailTransport } from '../sources/email-node-transport.js';
import { createGithubLive } from '../sources/github.js';
import { createUpworkLive } from '../sources/upwork.js';
import { createPeoplePerHourLive } from '../sources/peopleperhour.js';
import { startServer } from '../server/index.js';
import { clearPasscode } from '../server/passcode.js';
import { createServerLog, installCrashLogging } from '../server/log.js';
import {
  startSyncListener,
  connectSyncPeer,
  createPeer,
} from '../sync/index.js';
import { extractFacts } from '../facts/index.js';
import { localSearch } from '../crm/index.js';
import { evalAudience } from '../crm/audience.js';
import { inferRegex, simplifyRegex, inferRegexLcs } from '../patterns/index.js';
import { runGraph } from '../automation/index.js';
import { planOutreach } from '../broadcast/index.js';
import { foundOnPort } from '../server/hosted-ui.js';
import { DEFAULT_PORTS } from '../web/discover.js';
import { LINO_TEXT, LINO_BINARY, JSON_MEDIA } from '../transport/lino.js';
import { syncWire } from '../sync/wire.js';

const HELP = `meta-sovereign <command> [options]

Commands:
  import        --source=<name> --file=<path> --store=<dir>
  export        --file=<path> --store=<dir>
  backup        --store=<dir> --archive=<dir> [--keep=<n>] [--formats=text,binary] [--passphrase=<pp>]
  backup-config [--store=<dir>] [--interval-hours=<h>] [--keep=<n>] [--formats=text,binary|none]
  restore       --file=<path> --store=<dir> [--replace] [--passphrase=<pp>]
  passcode      --clear [--store=<dir>]   (remove a forgotten local passcode)
  serve         [--port=<n>] [--store=<dir>] [--allow-origin=<origins|none>] [--ui-url=<url>] [--local-ui=true] [--tls=false] [--trust=true|false] [--hardware-key=false] [--open=true|false] [--json-compatibility=true] [--quiet-logs]
                [--backup-interval-hours=<h>] [--backup-keep=<n>] [--recovery-formats=text,binary|none]
                open https://link-foundation.github.io/meta-sovereign/; the localhost UI is opt-in
                on macOS: protect the TLS key with Secure Enclave; detect trust, set it up once in an interactive terminal
                verbose logs are written to <store>/logs/meta-sovereign.log by default
                repeat serve after updating: the current worker serves while its replacement prepares
                https is served on the same port (for Safari); --tls=false or MS_TLS=off turns it off
${TRUST_HELP}
${CONTACTS_HELP}
${TELEGRAM_EXPORT_HELP}
  sources
  source-pull   --source=<name> [--protocol=<p>] [--host=<mail-host>] [--owner=<o>] [--repo=<r>] [--state=<s>] [--offset=<n>] [--limit=<n>] [--store=<dir>]
  email-send    --protocol=<gmail|microsoft-graph|jmap|smtp> --to=<email> --subject=<s> --text=<body> [--host=<mail-host>]
  github-clone  --owner=<o> --repo=<r> [--ref=<branch>] --token=<pat> [--store=<dir>]
  github-comment --owner=<o> --repo=<r> --issue-number=<n> --text=<body> --token=<pat>
  upwork-search --query=<q> [--limit=<n>] [--sort=<s>] --token=<pat> [--store=<dir>]
  upwork-message --room-id=<r> --text=<body> --token=<pat> [--store=<dir>]
  peopleperhour-search --query=<q> [--limit=<n>] [--sort=<s>] --token=<pat> [--store=<dir>]
  peopleperhour-message --workstream-id=<w> | --proposal-id=<p> --text=<body> --token=<pat> [--store=<dir>]
  audience      --query=<expr> [--store=<dir>]
  facts         [--store=<dir>]
  search        --query=<text> [--min=<0..1>] [--store=<dir>]
  broadcast     --text=<msg> [--networks=t,vk,...] [--store=<dir>]
  patterns      [--store=<dir>]
  patterns-infer --examples=<a,b,c> [--mode=simple|lcs]
  graphs        [--store=<dir>]
  graphs-run    --id=<graph:id> --message=<text> [--mode=auto|semi] [--store=<dir>]
  replies       [--store=<dir>]
  profile       [--name=<n>] [--bio=<b>] [--store=<dir>]
  resume        [--title=<t>] [--body=<b>] [--store=<dir>]
  sync-listen   [--port=<n>] [--store=<dir>] [--sync-format=lino|binary|json]
  sync-connect  --port=<n> [--host=<h>] [--store=<dir>] [--sync-format=lino|binary|json]
                JSON sync also requires --json-compatibility=true on both ends
  outreach      --query=<expr> --text=<msg> [--reply=<reply:id>] [--networks=t,vk] [--mode=preview|queue] [--store=<dir>]
${AUTOMATION_HELP}
  export-encrypted --file=<path> --passphrase=<pp> [--store=<dir>]
  purge-tombstones --confirm=true [--id-prefix=<msg:tg>] [--older-than=<iso>] [--store=<dir>]
  vault-init    --kind=passphrase|pin|passkey|totp-recovery --secret=<s> [--label=<l>] [--file=<path>]
  vault-add     --secret=<old> --kind=<k> --new-secret=<s> [--label=<l>] [--file=<path>]
  vault-remove  --secret=<s> --id=<unlock-id> [--file=<path>]
  vault-list    [--file=<path>]
${CV_HELP}
${BROWSER_HELP}
${GREETINGS_HELP}
${BROADCAST_HELP}
${MIGRATE_HELP}
  help          (also --help, -h)
  version       (also --version, -v)
`;

// A writer migrates the store first (R-Z17) and says so on stderr.
const openStore = (dir) =>
  openDualStore(dir, { onEvent: migrationNotice(console.error) });
// Read-only commands take no lock and never write, so they work while
// `serve` owns the store (R-Z2).
const openReadOnly = (dir) => openDualStore(dir, { readOnly: true });

const importCmd = async (args, log) => {
  const file = args.file;
  const archive = await fs.readFile(file, 'utf8');
  const parsed = file.endsWith('.json') ? JSON.parse(archive) : archive;
  const store = await openStore(args.store ?? defaultStoreDir());
  const n = await importInto(store, args.source, parsed);
  log(`imported ${n} messages from ${args.source}`);
  return 0;
};

const exportCmd = async (args, log) => {
  const store = await openReadOnly(args.store ?? defaultStoreDir());
  const links = await store.query();
  await fs.writeFile(args.file, JSON.stringify(links, null, 2));
  log(`exported ${links.length} links to ${args.file}`);
  return 0;
};

const backupCmd = async (args, log) => {
  const store = await openReadOnly(args.store ?? defaultStoreDir());
  try {
    const settings = await readRecoverySettings(store);
    const formats =
      args.formats === 'none'
        ? []
        : recoveryFormats(args.formats ?? settings.formats);
    const keep = Number(args.keep ?? settings.keep);
    validateRecoverySettings({ ...settings, formats, keep });
    const made = await makeBackup(store, {
      archiveDir: args.archive,
      passphrase: args.passphrase ?? null,
      recoveryFormats: formats,
    });
    if (made.skipped) {
      throw Object.assign(
        new Error('not enough free disk space for a backup'),
        { code: 'LOW_DISK' }
      );
    }
    if (keep > 0) {
      await pruneBackups({
        archiveDir: args.archive,
        keep,
        passphrase: args.passphrase ?? null,
      });
      await pruneRecoveryDumps({ archiveDir: args.archive, keep });
    }
    log(`backup written to ${made.file}`);
    for (const dump of made.recovery) {
      log(
        `${dump.format} recovery dump written to ${dump.file} (secret records excluded)`
      );
    }
    return 0;
  } finally {
    await store.close?.();
  }
};

const backupConfigCmd = async (args, log) => {
  const changes = {
    ...(args['interval-hours'] !== undefined
      ? { intervalHours: Number(args['interval-hours']) }
      : {}),
    ...(args.keep !== undefined ? { keep: Number(args.keep) } : {}),
    ...(args.formats !== undefined
      ? {
          formats: args.formats === 'none' ? [] : recoveryFormats(args.formats),
        }
      : {}),
  };
  const store = await (Object.keys(changes).length ? openStore : openReadOnly)(
    args.store ?? defaultStoreDir()
  );
  try {
    const before = await readRecoverySettings(store);
    const settings = Object.keys(changes).length
      ? await saveRecoverySettings(store, { ...before, ...changes })
      : before;
    log(JSON.stringify(settings, null, 2));
    return 0;
  } finally {
    await store.close?.();
  }
};

// Removes the local passcode's stored hash — the way out of a forgotten
// passcode (R-Y183).
const passcodeCmd = async (args, log) => {
  if (!args.clear) {
    log('usage: meta-sovereign passcode --clear [--store=<dir>]');
    return 1;
  }
  const cleared = clearPasscode(args.store ?? defaultStoreDir());
  log(cleared ? 'local passcode cleared' : 'no local passcode was set');
  return 0;
};

const restoreCmd = async (args, log) => {
  if (args.replace) {
    // Swap the whole log in one step; the store must not be in use (R-Z16).
    const n = await restoreBackupToDir(
      args.file,
      args.store ?? defaultStoreDir(),
      {
        replace: true,
        passphrase: args.passphrase ?? null,
      }
    );
    log(`replaced the store with ${n} records from ${args.file}`);
    return 0;
  }
  const store = await openStore(args.store ?? defaultStoreDir());
  try {
    const n = await restoreBackup(store, args.file, {
      passphrase: args.passphrase ?? null,
    });
    log(`restored ${n} links from ${args.file}`);
    return 0;
  } finally {
    await store.close?.();
  }
};

// What `serve` passes to the server besides its port, store and log.
const serveOptions = (args) => ({
  backups: {
    ...(args['backup-interval-hours'] !== undefined
      ? { intervalHours: Number(args['backup-interval-hours']) }
      : {}),
    ...(args['backup-keep'] !== undefined
      ? { keep: Number(args['backup-keep']) }
      : {}),
    ...(args['recovery-formats'] !== undefined
      ? {
          formats:
            args['recovery-formats'] === 'none'
              ? []
              : recoveryFormats(args['recovery-formats']),
        }
      : {}),
  },
  // Hosted web origins allowed to use this server (issue #37); falls
  // back to MS_ALLOW_ORIGINS and then the built-in defaults.
  ...(args['allow-origin'] ? { allowOrigins: args['allow-origin'] } : {}),
  // The hosted app is the UI; the server's own copy is a fallback
  // enabled with `--local-ui=true` (R-Y58, R-Y59).
  ...(args['ui-url'] ? { uiUrl: args['ui-url'] } : {}),
  ...(args['local-ui'] !== undefined ? { localUi: args['local-ui'] } : {}),
  ...(args['json-compatibility'] !== undefined
    ? { jsonCompatibility: String(args['json-compatibility']) === 'true' }
    : {}),
  // https beside http on the same port, for Safari (R-Y64).
  tls: String(args.tls ?? 'true') !== 'false' && process.env.MS_TLS !== 'off',
});

// Where the server and the app are, as `serve` prints them.
const logAddresses = (handle, log) => {
  const origin = `http://127.0.0.1:${handle.port}`;
  log(`meta-sovereign listening on ${origin}`);
  log(`open the app → ${handle.uiUrl}`);
  if (handle.tls) {
    log(
      `https too → https://127.0.0.1:${handle.port} (Safari: trust it once → meta-sovereign trust)`
    );
  }
  if (!foundOnPort(handle.port)) {
    log(
      `the app looks for the server on ports ${DEFAULT_PORTS.join(', ')}; on ${handle.port} set it in Settings → Server`
    );
  }
  log(
    handle.localUi
      ? `local copy (fallback, e.g. for Safari or offline) → ${origin}/`
      : `local copy off: ${origin}/ opens the app above (enable with --local-ui=true)`
  );
};

const serveCmd = async (args, log) => {
  const storeDir = args.store ?? defaultStoreDir();
  const repeated = await repeatServe(args, storeDir, log);
  if (repeated !== null) {
    return repeated;
  }
  // Verbose logging is on by default: every request, event and error is
  // written to a file in the app folder (and echoed here), so the root
  // cause of any issue is always on disk. `--quiet-logs` opts out.
  const serverLog =
    args['quiet-logs'] === true
      ? null
      : await createServerLog({
          storeDir,
          toStdout: args.foreground !== false,
        });
  if (serverLog) {
    installCrashLogging(serverLog.log);
  }
  let handle;
  try {
    if (args.foreground !== false) {
      await setupLocalCertificate(args, log);
    }
    const options = {
      port: Number(args.port ?? 8787),
      storeDir,
      ...(serverLog ? { log: serverLog.log } : {}),
      ...serveOptions(args),
    };
    handle = await createServeHandle(args, options);
  } catch (error) {
    // A busy port (or any start failure) ends here with a message, a
    // non-zero exit and nothing left running (R-Z1).
    log(`cannot start the server: ${error.message}`);
    await serverLog?.close();
    return 1;
  }
  logAddresses(handle, log);
  maybeOpenHostedApp(args, handle, log);
  if (serverLog) {
    log(`verbose logs → ${serverLog.file}`);
  }
  // Block on SIGINT/SIGTERM so the CLI keeps the server alive until
  // the user explicitly stops it. Tests pass `args.foreground = false`
  // to skip the wait and reclaim control after startup.
  if (args.foreground === false) {
    await serverLog?.close();
    return 0;
  }
  await new Promise((resolve) => {
    const stop = async () => {
      await handle.close();
      await serverLog?.close();
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  return 0;
};

const createServeHandle = (args, options) =>
  args.foreground === false
    ? startServer(options)
    : startRollingCliServer({
        storeDir: options.storeDir,
        port: options.port,
        options: serveOptions(args),
        log: options.log ?? (() => {}),
      });

const repeatServe = async (args, storeDir, log) => {
  if (args.foreground === false) {
    return null;
  }
  try {
    const running = await upgradeRunningServer({ args, storeDir, log });
    if (!running) {
      return null;
    }
    logAddresses(running, log);
    maybeOpenHostedApp(args, running, log);
    return 0;
  } catch (error) {
    log(`cannot upgrade the server: ${error.message}`);
    return 1;
  }
};

const sourcesCmd = async (_args, log) => {
  log(listSources().join('\n'));
  return 0;
};

const RAW_EMAIL_PROTOCOLS = new Set(['imap', 'pop3', 'smtp']);

const rawEmailTransport = (args, protocol) =>
  RAW_EMAIL_PROTOCOLS.has(String(protocol ?? '').toLowerCase())
    ? createNodeEmailTransport({
        protocol,
        host: args.host,
        port: args.port ? Number(args.port) : undefined,
        secure: args.secure,
        username: args.username ?? args.user,
        password: args.password,
        mailbox: args.mailbox,
        token: args.token,
      })
    : null;

const sourcePullCmd = async (args, log) => {
  const store = await openStore(args.store ?? defaultStoreDir());
  const protocol = args.protocol;
  const result = await pullLiveInto(store, args.source, {
    protocol,
    provider: args.provider,
    baseUrl: args['base-url'],
    accountId: args['account-id'],
    userId: args['user-id'],
    mailboxId: args['mailbox-id'],
    mailbox: args.mailbox,
    label: args.label,
    query: args.query,
    owner: args.owner,
    repo: args.repo,
    state: args.state,
    stage: args.stage,
    perspective: args.perspective,
    jobId: args['job-id'],
    contractId: args['contract-id'],
    proposalId: args['proposal-id'],
    roomId: args['room-id'],
    organizationId: args['organization-id'],
    token: args.token,
    transport: rawEmailTransport(args, protocol),
    offset: args.offset ? Number(args.offset) : undefined,
    limit: args.limit ? Number(args.limit) : undefined,
    timeout: args.timeout ? Number(args.timeout) : undefined,
  });
  log(JSON.stringify(result, null, 2));
  return 0;
};

const emailSendCmd = async (args, log) => {
  const protocol = args.protocol ?? 'jmap';
  const live = createEmailLive({
    protocol,
    provider: args.provider,
    baseUrl: args['base-url'],
    accountId: args['account-id'],
    userId: args['user-id'],
    token: args.token,
    transport: rawEmailTransport(args, protocol),
  });
  const result = await live.post(
    {
      from: args.from,
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      subject: args.subject ?? '',
      text: args.text ?? args.body ?? '',
    },
    {
      token: args.token,
      identityId: args['identity-id'],
      draftsMailboxId: args['drafts-mailbox-id'],
    }
  );
  log(JSON.stringify({ source: 'email', protocol, result }, null, 2));
  return 0;
};

const githubLiveFromArgs = (args) =>
  createGithubLive({
    token: args.token,
    owner: args.owner,
    repo: args.repo,
    baseUrl: args['base-url'],
  });

const githubCloneCmd = async (args, log) => {
  const store = await openStore(args.store ?? defaultStoreDir());
  const live = githubLiveFromArgs(args);
  const result = await live.cloneRepo({
    owner: args.owner,
    repo: args.repo,
    ref: args.ref,
    store,
  });
  log(
    JSON.stringify(
      {
        source: 'github',
        indexId: result.indexLink?.id ?? null,
        fileCount: result.fileLinks?.length ?? 0,
      },
      null,
      2
    )
  );
  return 0;
};

const githubCommentCmd = async (args, log) => {
  const live = githubLiveFromArgs(args);
  const result = await live.post(
    { text: args.text ?? args.body ?? '' },
    {
      owner: args.owner,
      repo: args.repo,
      issueNumber: args['issue-number']
        ? Number(args['issue-number'])
        : undefined,
    }
  );
  log(JSON.stringify({ source: 'github', result }, null, 2));
  return 0;
};

const upworkLiveFromArgs = (args) =>
  createUpworkLive({
    token: args.token,
    baseUrl: args['base-url'],
    organizationId: args['organization-id'],
  });

const peoplePerHourLiveFromArgs = (args) =>
  createPeoplePerHourLive({
    token: args.token,
    baseUrl: args['base-url'],
  });

// Search and message commands for a freelancing source differ only in the
// source name, how the live client is built, and which search/post shape the
// board uses — so they share one factory each instead of a copy per source.
const boardSearchCmd = (source, liveFromArgs, method) => async (args, log) => {
  const result = await liveFromArgs(args)[method]({
    query: args.query ?? '',
    limit: args.limit ? Number(args.limit) : undefined,
    sort: args.sort,
  });
  log(
    JSON.stringify(
      { source, count: result.links?.length ?? 0, links: result.links ?? [] },
      null,
      2
    )
  );
  return 0;
};

const boardMessageCmd = (source, liveFromArgs, target) => async (args, log) => {
  const result = await liveFromArgs(args).post(
    { text: args.text ?? args.body ?? '' },
    target(args)
  );
  log(JSON.stringify({ source, result }, null, 2));
  return 0;
};

const upworkSearchCmd = boardSearchCmd(
  'upwork',
  upworkLiveFromArgs,
  'searchJobs'
);
const upworkMessageCmd = boardMessageCmd(
  'upwork',
  upworkLiveFromArgs,
  (args) => ({
    roomId: args['room-id'],
  })
);
const peoplePerHourSearchCmd = boardSearchCmd(
  'peopleperhour',
  peoplePerHourLiveFromArgs,
  'searchProjects'
);
const peoplePerHourMessageCmd = boardMessageCmd(
  'peopleperhour',
  peoplePerHourLiveFromArgs,
  (args) => ({
    workstreamId: args['workstream-id'],
    proposalId: args['proposal-id'],
  })
);

const audienceCmd = async (args, log) => {
  const store = await openReadOnly(args.store ?? defaultStoreDir());
  const all = await store.query();
  const matched = evalAudience(all, args.query ?? '');
  log(JSON.stringify(matched, null, 2));
  return 0;
};

const factsCmd = async (args, log) => {
  const store = await openReadOnly(args.store ?? defaultStoreDir());
  const all = await store.query();
  const messages = all.filter((l) => l.id?.startsWith('msg:'));
  const patterns = all
    .filter((l) => l.id?.startsWith('pattern:'))
    .map((p) => ({
      id: p.id,
      regex:
        typeof p.regex === 'string'
          ? new RegExp(p.regex, p.flags ?? 'i')
          : p.regex,
    }));
  log(JSON.stringify(extractFacts(messages, patterns), null, 2));
  return 0;
};

const searchCmd = async (args, log) => {
  const store = await openReadOnly(args.store ?? defaultStoreDir());
  const results = await localSearch(store, {
    query: args.query ?? '',
    min: Number(args.min ?? 0.2),
  });
  log(JSON.stringify(results, null, 2));
  return 0;
};

const broadcastCmd = async (args, log) => {
  const store = await openStore(args.store ?? defaultStoreDir());
  const networks = (args.networks?.split(',') ?? listSources()).filter((n) =>
    listSources().includes(n)
  );
  const post = {
    id: `broadcast:${Date.now()}`,
    tokens: ['broadcast', ...networks],
    body: args.text ?? '',
    networks,
    timestamp: new Date().toISOString(),
    status: 'queued',
  };
  await store.put(post);
  log(JSON.stringify(post, null, 2));
  return 0;
};

const listByPrefixCmd = (prefix) => async (args, log) => {
  const store = await openReadOnly(args.store ?? defaultStoreDir());
  const all = await store.query();
  log(
    JSON.stringify(
      all.filter((l) => l.id?.startsWith(prefix)),
      null,
      2
    )
  );
  return 0;
};

const patternsInferCmd = async (args, log) => {
  const examples = (args.examples ?? '').split(',').filter(Boolean);
  const regex =
    args.mode === 'lcs'
      ? inferRegexLcs(examples)
      : simplifyRegex(inferRegex(examples));
  log(JSON.stringify({ regex: regex.source, flags: regex.flags }));
  return 0;
};

const graphsRunCmd = async (args, log) => {
  const store = await openStore(args.store ?? defaultStoreDir());
  const persisted = await store.get(args.id);
  if (!persisted) {
    log(`graph ${args.id} not found`);
    return 1;
  }
  const nodes = new Map();
  for (const n of persisted.nodes ?? []) {
    nodes.set(n.id, {
      ...n,
      regex: n.regex ? new RegExp(n.regex, n.flags ?? 'i') : undefined,
    });
  }
  const plan = runGraph(
    { nodes, edges: persisted.edges ?? [] },
    { body: args.message ?? '' },
    { mode: args.mode ?? 'semi' }
  );
  log(JSON.stringify(plan, null, 2));
  return 0;
};

const profileCmd = async (args, log) => {
  const store = await openStore(args.store ?? defaultStoreDir());
  if (args.name || args.bio) {
    const profile = {
      id: 'profile:me',
      tokens: ['profile'],
      name: args.name,
      bio: args.bio,
    };
    await store.put(profile);
    log(
      JSON.stringify(
        {
          profile,
          plannedSyncs: listSources().map((s) => ({
            source: s,
            status: 'queued',
          })),
        },
        null,
        2
      )
    );
    return 0;
  }
  const profile = await store.get('profile:me');
  log(JSON.stringify(profile ?? { id: 'profile:me' }, null, 2));
  return 0;
};

const resumeCmd = async (args, log) => {
  const store = await openStore(args.store ?? defaultStoreDir());
  if (args.title || args.body) {
    const resume = {
      id: 'resume:me',
      tokens: ['resume'],
      title: args.title,
      body: args.body,
    };
    await store.put(resume);
    // Every board with a CV plan is a resume target (issue #29).
    const targets = listCvSources();
    log(
      JSON.stringify(
        {
          resume,
          plannedSyncs: targets.map((s) => ({ source: s, status: 'queued' })),
        },
        null,
        2
      )
    );
    return 0;
  }
  const resume = await store.get('resume:me');
  log(JSON.stringify(resume ?? { id: 'resume:me' }, null, 2));
  return 0;
};

const syncOptions = (args) => {
  const formats = { lino: LINO_TEXT, binary: LINO_BINARY, json: JSON_MEDIA };
  const format = formats[args['sync-format'] ?? 'lino'];
  if (!format) {
    throw new Error('Unsupported --sync-format; use lino, binary or json');
  }
  const options = {
    format,
    jsonCompatibility: String(args['json-compatibility']) === 'true',
  };
  syncWire(options);
  return options;
};

const waitForSyncStop = (handle, announce) =>
  new Promise((resolve) => {
    const stop = () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    handle.closed?.then(stop);
    announce();
  });

const syncCmd = async (args, log, listen) => {
  const options = syncOptions(args);
  const store = await openStore(args.store ?? defaultStoreDir());
  let handle;
  let off;
  try {
    const peer = createPeer(store, {
      node: listen ? 'cli-listener' : 'cli-client',
      schemaVersion: CURRENT_SCHEMA,
      hub: listen,
      onMismatch: (error) => log(error.message),
    });
    handle = listen
      ? await startSyncListener({ port: Number(args.port ?? 0), ...options })
      : await connectSyncPeer({
          port: Number(args.port),
          host: args.host ?? '127.0.0.1',
          ...options,
        });
    off = peer.connect(handle.transport);
    await waitForSyncStop(handle, () =>
      log(
        listen
          ? `sync listener on tcp://127.0.0.1:${handle.port}`
          : `sync client connected to tcp://${args.host ?? '127.0.0.1'}:${args.port}`
      )
    );
    return 0;
  } finally {
    off?.();
    try {
      await handle?.close();
    } finally {
      await store.close();
    }
  }
};

const syncListenCmd = (args, log) => syncCmd(args, log, true);
const syncConnectCmd = (args, log) => syncCmd(args, log, false);

const outreachCmd = async (args, log) => {
  const store = await openStore(args.store ?? defaultStoreDir());
  const all = await store.query();
  const matched = evalAudience(all, args.query ?? '');
  const replyGroup = args.reply
    ? all.find((l) => l.id === args.reply)
    : undefined;
  const plan = planOutreach({
    audience: matched,
    text: args.text,
    replyGroup,
    networks: args.networks?.split(',') ?? null,
    mode: args.mode ?? 'preview',
  });
  log(JSON.stringify(plan, null, 2));
  return 0;
};

const exportEncryptedCmd = async (args, log) => {
  if (!args.passphrase) {
    log('export-encrypted: --passphrase is required (R-K13)');
    return 1;
  }
  const store = await openReadOnly(args.store ?? defaultStoreDir());
  const file = await writeEncryptedExport(store, args.file, {
    passphrase: args.passphrase,
  });
  log(`encrypted export written to ${file}`);
  return 0;
};

const purgeTombstonesCmd = async (args, log) => {
  if (args.confirm !== 'true' && args.confirm !== true) {
    log('purge-tombstones: refusing without --confirm=true (R-K4)');
    return 1;
  }
  const store = await openStore(args.store ?? defaultStoreDir());
  const idPrefix = args['id-prefix'] ?? null;
  const olderThan = args['older-than']
    ? new Date(args['older-than']).toISOString()
    : null;
  const purged = await bulkPurge(
    store,
    (link) => {
      if (!isTombstone(link)) {
        return false;
      }
      if (idPrefix && !link.id?.startsWith(idPrefix)) {
        return false;
      }
      if (olderThan && (deletedAtOf(link) ?? '') > olderThan) {
        return false;
      }
      return true;
    },
    { confirm: true }
  );
  log(`purged ${purged.length} tombstones: ${JSON.stringify(purged)}`);
  return 0;
};

const vaultFile = (args) =>
  args.file ?? path.join(args.store ?? defaultStoreDir(), 'vault.json');

const vaultInitCmd = async (args, log) => {
  const file = vaultFile(args);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const v = createVault({ file });
  await v.initialize({
    kind: args.kind ?? 'passphrase',
    secret: args.secret,
    label: args.label,
  });
  log(`vault initialized at ${file}`);
  return 0;
};

const vaultAddCmd = async (args, log) => {
  const file = vaultFile(args);
  const v = createVault({ file });
  await v.unlock({ secret: args.secret });
  const entry = await v.addUnlock({
    kind: args.kind ?? 'passphrase',
    secret: args['new-secret'],
    label: args.label,
  });
  log(`added unlock ${entry.id} (${entry.kind}/${entry.label})`);
  return 0;
};

const vaultRemoveCmd = async (args, log) => {
  const file = vaultFile(args);
  const v = createVault({ file });
  await v.unlock({ secret: args.secret });
  const ok = await v.removeUnlock({ id: args.id });
  log(ok ? `removed unlock ${args.id}` : `unlock ${args.id} not found`);
  return ok ? 0 : 1;
};

const vaultListCmd = async (args, log) => {
  const file = vaultFile(args);
  const v = createVault({ file });
  log(JSON.stringify(await v.listUnlocks(), null, 2));
  return 0;
};

const COMMANDS = {
  import: importCmd,
  export: exportCmd,
  'export-encrypted': exportEncryptedCmd,
  backup: backupCmd,
  'backup-config': backupConfigCmd,
  restore: restoreCmd,
  passcode: passcodeCmd,
  serve: serveCmd,
  sources: sourcesCmd,
  'source-pull': sourcePullCmd,
  'email-send': emailSendCmd,
  'github-clone': githubCloneCmd,
  'github-comment': githubCommentCmd,
  'upwork-search': upworkSearchCmd,
  'upwork-message': upworkMessageCmd,
  'peopleperhour-search': peoplePerHourSearchCmd,
  'peopleperhour-message': peoplePerHourMessageCmd,
  audience: audienceCmd,
  facts: factsCmd,
  search: searchCmd,
  broadcast: broadcastCmd,
  patterns: listByPrefixCmd('pattern:'),
  'patterns-infer': patternsInferCmd,
  graphs: listByPrefixCmd('graph:'),
  'graphs-run': graphsRunCmd,
  replies: listByPrefixCmd('reply:'),
  profile: profileCmd,
  resume: resumeCmd,
  'sync-listen': syncListenCmd,
  'sync-connect': syncConnectCmd,
  outreach: outreachCmd,
  'purge-tombstones': purgeTombstonesCmd,
  'vault-init': vaultInitCmd,
  'vault-add': vaultAddCmd,
  'vault-remove': vaultRemoveCmd,
  'vault-list': vaultListCmd,
  // CV read/diff/sync/telemetry over browser-commander (issue #29).
  ...createCvCommands({ openStore }),
  ...createBrowserCommands({ openStore, openReadOnly }),
  // Automations: plan, run and review drafts one by one (issue #31).
  ...createAutomationCommands({ openStore }),
  // Hi/hello and greeting-sticker openers (issue #35).
  ...createGreetingCommands({ openStore }),
  ...createBroadcastCommands({ openStore, openReadOnly }),
  // Let Safari trust the server's own certificate (R-Y64).
  ...createTrustCommands(),
  ...createContactCommands({ openStore }),
  ...createTelegramExportCommands({ openStore }),
  // Bring a store to the current data schema, or look first (R-Z17).
  ...createMigrateCommands(),
  help: async (_a, log) => {
    log(HELP);
    return 0;
  },
  // The published package's version, read from its package.json.
  version: async (_a, log) => {
    const pkg = new URL('../../../package.json', import.meta.url);
    log(JSON.parse(await fs.readFile(pkg, 'utf8')).version);
    return 0;
  },
};

// Conventional flags that package managers and users try first.
const ALIASES = {
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
};

export const runCli = async (argv, { log = console.log } = {}) => {
  const [cmd, ...rest] = argv;
  const handler = COMMANDS[ALIASES[cmd] ?? cmd ?? 'help'];
  if (!handler) {
    log(HELP);
    return 1;
  }
  try {
    const args = parseArgs(rest);
    if (
      args.store === undefined &&
      ![
        'help',
        '--help',
        '-h',
        'version',
        '--version',
        '-v',
        undefined,
      ].includes(cmd)
    ) {
      args.store =
        ['serve', 'trust'].includes(cmd) &&
        !process.env.META_SOVEREIGN_STORE_DIR
          ? await resolveUserStore({ log })
          : defaultStoreDir();
    }
    return await handler(args, log);
  } catch (error) {
    if (error?.code === 'STORE_LOCKED' || SCHEMA_ERROR_CODES.has(error?.code)) {
      log(error.message); // another process owns the store (R-Z2); the schema (R-Z17)
      return 1;
    }
    throw error;
  }
};
