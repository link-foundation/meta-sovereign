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
} from '../storage/index.js';
import {
  createBackup,
  pruneBackups,
  restoreBackup,
} from '../storage/backup.js';
import { listSources, importInto } from '../sources/index.js';
import { startServer } from '../server/index.js';
import {
  startSyncListener,
  connectSyncPeer,
  createPeer,
} from '../sync/index.js';
import { extractFacts } from '../facts/index.js';
import { localSearch, intersect, union, difference } from '../crm/index.js';
import { inferRegex, simplifyRegex, inferRegexLcs } from '../patterns/index.js';
import { runGraph } from '../automation/index.js';

const HELP = `meta-sovereign <command> [options]

Commands:
  import        --source=<name> --file=<path> --store=<dir>
  export        --file=<path> --store=<dir>
  backup        --store=<dir> --archive=<dir> [--keep=<n>]
  restore       --file=<path> --store=<dir>
  serve         [--port=<n>] [--store=<dir>]
  sources
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
  return 0;
};

const sourcesCmd = async (_args, log) => {
  log(listSources().join('\n'));
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

// --- audience expression evaluator (mirrors server) ----------------------
const evalAudience = (links, expression) => {
  const ops = parseAudience(expression);
  const evalExpr = (node) => {
    if (node.kind === 'set') {
      return links.filter(node.predicate);
    }
    if (node.kind === 'and') {
      return intersect(evalExpr(node.left), evalExpr(node.right));
    }
    if (node.kind === 'or') {
      return union(evalExpr(node.left), evalExpr(node.right));
    }
    if (node.kind === 'not') {
      return difference(links, evalExpr(node.expr));
    }
    return [];
  };
  return evalExpr(ops);
};

const parseAudience = (expr) => {
  const tokens = String(expr ?? '')
    .replace(/([(),])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean);
  let i = 0;
  const peek = () => tokens[i];
  const eat = () => tokens[i++];
  const parsePrimary = () => {
    const t = eat();
    if (t === 'NOT') {
      return { kind: 'not', expr: parsePrimary() };
    }
    if (t === '(') {
      const inner = parseOr();
      eat();
      return inner;
    }
    return makeSet(t);
  };
  const parseAnd = () => {
    let left = parsePrimary();
    while (peek() === 'AND') {
      eat();
      left = { kind: 'and', left, right: parsePrimary() };
    }
    return left;
  };
  const parseOr = () => {
    let left = parseAnd();
    while (peek() === 'OR') {
      eat();
      left = { kind: 'or', left, right: parseAnd() };
    }
    return left;
  };
  return parseOr();
};

const makeSet = (token) => {
  const m = token?.match(/^(network|chat|sender|fact|kind):(.+)$/);
  if (!m) {
    return { kind: 'set', predicate: () => false };
  }
  const [, dim, value] = m;
  if (dim === 'network') {
    return { kind: 'set', predicate: (l) => l.source === value };
  }
  if (dim === 'chat') {
    return { kind: 'set', predicate: (l) => l.chat === value };
  }
  if (dim === 'sender') {
    return { kind: 'set', predicate: (l) => l.sender === value };
  }
  if (dim === 'kind') {
    return { kind: 'set', predicate: (l) => l.id?.startsWith(`${value}:`) };
  }
  return {
    kind: 'set',
    predicate: (l) => (l.facts ?? []).some((f) => f.includes(value)),
  };
};

const COMMANDS = {
  import: importCmd,
  export: exportCmd,
  backup: backupCmd,
  restore: restoreCmd,
  serve: serveCmd,
  sources: sourcesCmd,
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
