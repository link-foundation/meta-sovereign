/**
 * meta-sovereign CLI (R-F2).
 *
 * Subcommands: `import`, `export`, `backup`, `restore`, `serve`,
 * `sources`. Returns the exit code instead of calling `process.exit`
 * so it stays unit-testable.
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

const HELP = `meta-sovereign <command> [options]

Commands:
  import   --source=<name> --file=<path> --store=<dir>
  export   --file=<path> --store=<dir>
  backup   --store=<dir> --archive=<dir> [--keep=<n>]
  restore  --file=<path> --store=<dir>
  serve    [--port=<n>] [--store=<dir>]
  sources
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

const COMMANDS = {
  import: importCmd,
  export: exportCmd,
  backup: backupCmd,
  restore: restoreCmd,
  serve: serveCmd,
  sources: sourcesCmd,
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
