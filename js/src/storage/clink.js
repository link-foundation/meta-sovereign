/**
 * link-cli (`clink`) client: find the binary, load a doublets archive
 * into a database, and talk to `clink --serve` over its text protocol
 * (one LiNo query per message, terminated by a `.` line; the answer is
 * one `(before) (after)` change per matched link, then `.`).
 *
 * Works with both link-cli builds (Rust 1.x, .NET 4.x). Everything that
 * starts a process or opens a socket is injectable for tests.
 */

import { execFile, spawn } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { clearTimeout, setTimeout } from 'node:timers';
import { Parser } from 'links-notation';
import { scalarFrom, scalarName } from './doublets-archive.js';

const run = promisify(execFile);

const SYNTAX_ERROR = /^\(error: .?invalid LiNo/;

/**
 * The clink binary to use: `$CLINK_BIN`, then the cargo and dotnet tool
 * folders, then `$PATH`; `null` when there is none. On Windows both
 * tool installers name the binary `clink.exe`.
 */
export const findClink = ({
  env = process.env,
  home = os.homedir(),
  exists = existsSync,
  platform = process.platform,
} = {}) => {
  const names = platform === 'win32' ? ['clink.exe', 'clink'] : ['clink'];
  const dirs = [
    path.join(home, '.cargo', 'bin'),
    path.join(home, '.dotnet', 'tools'),
    ...String(env.PATH ?? '')
      .split(path.delimiter)
      .filter(Boolean),
  ];
  const candidates = [
    env.CLINK_BIN,
    ...dirs.flatMap((dir) => names.map((name) => path.join(dir, name))),
  ].filter(Boolean);
  return candidates.find((candidate) => exists(candidate)) ?? null;
};

export class ClinkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClinkError';
  }
}

const parser = new Parser();

const asLink = (node) => {
  const inner = node?.values?.[0];
  if (!inner || inner.id === null || inner.id === undefined) {
    return null;
  }
  const [source, target] = inner.values ?? [];
  return { id: inner.id, source: source?.id, target: target?.id };
};

/**
 * Parse a clink answer into `[{ before, after }]` changes, where a link
 * is `{ id, source, target }` (names where clink knows one, else link
 * numbers as strings) and `null` means "did not exist" / "deleted".
 */
export const parseClinkReply = (text) => {
  const body = String(text ?? '')
    .replace(/(^|\n)\.\n?$/, '$1')
    .replace(/^\./gm, '');
  if (!body.trim()) {
    return [];
  }
  const changes = [];
  for (const top of parser.parse(body)) {
    if (top.id === 'error') {
      throw new ClinkError(top.values?.map((v) => v.id).join(' ') ?? 'error');
    }
    const [before, after] = top.values ?? [];
    changes.push({ before: asLink(before), after: asLink(after) });
  }
  return changes;
};

const QUOTES = ["'", '"', '`'];

/**
 * The serve protocol is dot-stuffed both ways (as in SMTP): a line that
 * starts with `.` gets one more, so a lone `.` line always ends a reply.
 */
export const stuff = (text) => String(text).replace(/^\./gm, '..');

export const replyComplete = (buffer) =>
  buffer === '.\n' || buffer.endsWith('\n.\n');

/**
 * The point name a text is stored under in link-cli: `scalarName` (so
 * names never look like link numbers), and `ms:u:<uri-encoded>` for the
 * rare text that uses all three quote characters, so every name can be
 * written as a plain one-character quoted reference.
 */
export const clinkName = (value) => {
  const name = scalarName(value);
  return QUOTES.every((q) => name.includes(q))
    ? `ms:u:${encodeURIComponent(String(value))}`
    : name;
};

/** The text a `clinkName` stands for. */
export const clinkText = (name) =>
  String(name).startsWith('ms:u:')
    ? decodeURIComponent(String(name).slice(5))
    : scalarFrom(String(name));

/** A name as a query reference (see `clinkName`). */
export const quoteName = (name) => {
  const text = String(name);
  const q = QUOTES.find((c) => !text.includes(c));
  if (!q) {
    throw new ClinkError(`cannot quote ${JSON.stringify(text)}`);
  }
  return `${q}${text}${q}`;
};

/** Load a binary links notation store archive into a fresh database. */
export const importArchive = async ({ bin, db, archive }) => {
  await fs.mkdir(path.dirname(db), { recursive: true });
  const base = path.basename(db, path.extname(db));
  for (const file of await fs.readdir(path.dirname(db))) {
    if (file === path.basename(db) || file.startsWith(`${base}.`)) {
      await fs.rm(path.join(path.dirname(db), file), { force: true });
    }
  }
  const archivePath = `${db}.${process.pid}.import.bin`;
  await fs.writeFile(archivePath, archive);
  try {
    await run(bin, ['--db', db, '--import-binary', archivePath]);
  } finally {
    await fs.rm(archivePath, { force: true });
  }
};

/**
 * Start `clink --serve` on a free local port and return a client whose
 * `query(text)` resolves to parsed changes. Queries are serialised. The
 * server drops a connection after a syntax error (it stays up), so a
 * closed or timed-out connection is reopened for the next query.
 */
export const startClinkServer = async ({
  bin,
  db,
  spawnImpl = spawn,
  connect = (address) => net.connect(address),
  timeoutMs = 10_000,
}) => {
  const child = spawnImpl(bin, ['--db', db, '--serve', '127.0.0.1:0']);
  let exited = false;
  const address = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ClinkError('clink --serve did not start')),
      timeoutMs
    );
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const m = out.match(/listening on ([\d.]+):(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve({ host: m[1], port: Number(m[2]) });
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      exited = true;
      clearTimeout(timer);
      reject(new ClinkError(`clink exited with ${code}`));
    });
  });
  let socket = null;
  let buffer = '';
  let waiting = null;
  const fail = (error) => {
    const pending = waiting;
    waiting = null;
    pending?.reject(error);
  };
  const drop = (s) => {
    if (socket === s) {
      socket = null;
    }
    s.destroy();
  };
  const open = () => {
    const s = connect(address);
    s.setEncoding('utf8');
    s.on('data', (chunk) => {
      buffer += chunk;
      if (waiting?.socket === s && replyComplete(buffer)) {
        const { resolve } = waiting;
        waiting = null;
        if (SYNTAX_ERROR.test(buffer)) {
          // clink hangs up after a syntax error; reconnect next time.
          drop(s);
        }
        resolve(buffer);
      }
    });
    const lost = (error) => {
      drop(s);
      if (waiting?.socket === s) {
        fail(error);
      }
    };
    s.on('error', lost);
    s.on('close', () => lost(new ClinkError('clink closed the connection')));
    return s;
  };
  const raw = (text) =>
    new Promise((resolve, reject) => {
      if (exited) {
        reject(new ClinkError('clink is not running'));
        return;
      }
      socket ??= open();
      const timer = setTimeout(() => {
        const s = waiting?.socket;
        fail(new ClinkError('clink query timed out'));
        if (s) {
          drop(s);
        }
      }, timeoutMs);
      waiting = {
        socket,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      buffer = '';
      socket.write(`${stuff(text)}\n.\n`);
    });
  let chain = Promise.resolve();
  return {
    address,
    /** Run one LiNo query; resolves to parsed changes. */
    query(text) {
      const next = chain.then(() => raw(text)).then(parseClinkReply);
      chain = next.catch(() => {});
      return next;
    },
    async close() {
      socket?.destroy();
      socket = null;
      child.kill();
    },
  };
};
