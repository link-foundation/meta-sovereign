/**
 * meta-sovereign CLI (R-F2).
 *
 * Subcommands cover the full feature surface so every capability the
 * server exposes is also reachable from the terminal: import/export,
 * backup/restore, serve, sources, audience, facts, search, broadcast,
 * sync (listen/connect), patterns (infer/list), graphs (run/list),
 * replies (list), profile/resume.
 *
 * Returns an exit code instead of calling `process.exit`, keeping the
 * entry point unit-testable.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { parseArgs } from './lino-args.js';
import {
  createDualStore,
  createLinoTextStore,
  createDoubletsStore,
  bulkPurge,
  isTombstone,
  createVault,
} from '../storage/index.js';
import {
  createBackup,
  pruneBackups,
  restoreBackup,
} from '../storage/backup.js';
import { writeEncryptedExport } from '../storage/export-encrypted.js';
import { listSources, importInto, pullLiveInto } from '../sources/index.js';
import { createEmailLive } from '../sources/email.js';
import { createNodeEmailTransport } from '../sources/email-node-transport.js';
import { createGithubLive } from '../sources/github.js';
import { startServer } from '../server/index.js';
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

const HELP = `meta-sovereign <command> [options]

Commands:
  import        --source=<name> --file=<path> --store=<dir>
  export        --file=<path> --store=<dir>
  backup        --store=<dir> --archive=<dir> [--keep=<n>]
  restore       --file=<path> --store=<dir>
  serve         [--port=<n>] [--store=<dir>]
  sources
  source-pull   --source=<name> [--protocol=<p>] [--host=<mail-host>] [--owner=<o>] [--repo=<r>] [--state=<s>] [--offset=<n>] [--limit=<n>] [--store=<dir>]
  email-send    --protocol=<gmail|microsoft-graph|jmap|smtp> --to=<email> --subject=<s> --text=<body> [--host=<mail-host>]
  github-clone  --owner=<o> --repo=<r> [--ref=<branch>] --token=<pat> [--store=<dir>]
  github-comment --owner=<o> --repo=<r> --issue-number=<n> --text=<body> --token=<pat>
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
  sync-listen   [--port=<n>] [--store=<dir>]
  sync-connect  --port=<n> [--host=<h>] [--store=<dir>]
  outreach      --query=<expr> --text=<msg> [--reply=<reply:id>] [--networks=t,vk] [--mode=preview|queue] [--store=<dir>]
  export-encrypted --file=<path> --passphrase=<pp> [--store=<dir>]
  purge-tombstones --confirm=true [--id-prefix=<msg:tg>] [--older-than=<iso>] [--store=<dir>]
  vault-init    --kind=passphrase|pin|passkey|totp-recovery --secret=<s> [--label=<l>] [--file=<path>]
  vault-add     --secret=<old> --kind=<k> --new-secret=<s> [--label=<l>] [--file=<path>]
  vault-remove  --secret=<s> --id=<unlock-id> [--file=<path>]
  vault-list    [--file=<path>]
  help
`;

const openStore = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
  const text = await createLinoTextStore(path.join(dir, 'data.lino'));
  const binary = await createDoubletsStore(path.join(dir, 'data.bin'));
  return createDualStore({ binary, text });
};

const importCmd = async (args, log) => {
  const file = args.file;
  const archive = await fs.readFile(file, 'utf8');
  const parsed = file.endsWith('.json') ? JSON.parse(archive) : archive;
  const store = await openStore(args.store ?? '.meta-sovereign');
  const n = await importInto(store, args.source, parsed);
  log(`imported ${n} messages from ${args.source}`);
  return 0;
};

const exportCmd = async (args, log) => {
  const store = await openStore(args.store ?? '.meta-sovereign');
  const links = await store.query();
  await fs.writeFile(args.file, JSON.stringify(links, null, 2));
  log(`exported ${links.length} links to ${args.file}`);
  return 0;
};

const backupCmd = async (args, log) => {
  const store = await openStore(args.store ?? '.meta-sovereign');
  const file = await createBackup(store, { archiveDir: args.archive });
  if (args.keep) {
    await pruneBackups({ archiveDir: args.archive, keep: Number(args.keep) });
  }
  log(`backup written to ${file}`);
  return 0;
};

const restoreCmd = async (args, log) => {
  const store = await openStore(args.store ?? '.meta-sovereign');
  const n = await restoreBackup(store, args.file);
  log(`restored ${n} links from ${args.file}`);
  return 0;
};

const serveCmd = async (args, log) => {
  const handle = await startServer({
    port: Number(args.port ?? 8787),
    storeDir: args.store ?? '.meta-sovereign',
  });
  log(`meta-sovereign listening on http://127.0.0.1:${handle.port}`);
  // Block on SIGINT/SIGTERM so the CLI keeps the server alive until
  // the user explicitly stops it. Tests pass `args.foreground = false`
  // to skip the wait and reclaim control after startup.
  if (args.foreground === false) {
    return 0;
  }
  await new Promise((resolve) => {
    const stop = async () => {
      await handle.close();
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  return 0;
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
  const store = await openStore(args.store ?? '.meta-sovereign');
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
  const store = await openStore(args.store ?? '.meta-sovereign');
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

const audienceCmd = async (args, log) => {
  const store = await openStore(args.store ?? '.meta-sovereign');
  const all = await store.query();
  const matched = evalAudience(all, args.query ?? '');
  log(JSON.stringify(matched, null, 2));
  return 0;
};

const factsCmd = async (args, log) => {
  const store = await openStore(args.store ?? '.meta-sovereign');
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
  const store = await openStore(args.store ?? '.meta-sovereign');
  const results = await localSearch(store, {
    query: args.query ?? '',
    min: Number(args.min ?? 0.2),
  });
  log(JSON.stringify(results, null, 2));
  return 0;
};

const broadcastCmd = async (args, log) => {
  const store = await openStore(args.store ?? '.meta-sovereign');
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
  const store = await openStore(args.store ?? '.meta-sovereign');
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
  const store = await openStore(args.store ?? '.meta-sovereign');
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
  const store = await openStore(args.store ?? '.meta-sovereign');
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
  const store = await openStore(args.store ?? '.meta-sovereign');
  if (args.title || args.body) {
    const resume = {
      id: 'resume:me',
      tokens: ['resume'],
      title: args.title,
      body: args.body,
    };
    await store.put(resume);
    const targets = ['hh', 'habr-career', 'superjob', 'linkedin'];
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

const syncListenCmd = async (args, log) => {
  const store = await openStore(args.store ?? '.meta-sovereign');
  const peer = createPeer(store, { node: 'cli-listener' });
  const handle = await startSyncListener({ port: Number(args.port ?? 0) });
  peer.connect(handle.transport);
  log(`sync listener on tcp://127.0.0.1:${handle.port}`);
  return 0;
};

const syncConnectCmd = async (args, log) => {
  const store = await openStore(args.store ?? '.meta-sovereign');
  const peer = createPeer(store, { node: 'cli-client' });
  const client = await connectSyncPeer({
    port: Number(args.port),
    host: args.host ?? '127.0.0.1',
  });
  peer.connect(client.transport);
  log(
    `sync client connected to tcp://${args.host ?? '127.0.0.1'}:${args.port}`
  );
  return 0;
};

const outreachCmd = async (args, log) => {
  const store = await openStore(args.store ?? '.meta-sovereign');
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
  const store = await openStore(args.store ?? '.meta-sovereign');
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
  const store = await openStore(args.store ?? '.meta-sovereign');
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
      if (olderThan && (link.deleted?.at ?? '') > olderThan) {
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
  args.file ?? path.join(args.store ?? '.meta-sovereign', 'vault.json');

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
  restore: restoreCmd,
  serve: serveCmd,
  sources: sourcesCmd,
  'source-pull': sourcePullCmd,
  'email-send': emailSendCmd,
  'github-clone': githubCloneCmd,
  'github-comment': githubCommentCmd,
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
  help: async (_a, log) => {
    log(HELP);
    return 0;
  },
};

export const runCli = async (argv, { log = console.log } = {}) => {
  const [cmd, ...rest] = argv;
  const handler = COMMANDS[cmd ?? 'help'];
  if (!handler) {
    log(HELP);
    return 1;
  }
  return handler(parseArgs(rest), log);
};
