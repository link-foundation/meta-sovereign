// The same associative archive as doublets-archive, with the working network
// and deduplication indexes on disk. SQLite is a disposable encoder workspace,
// never a replacement for the durable log or the link-cli archive format.
import { scalarName } from './doublets-archive.js';
import { externalRef, widthFor } from './binary-packet.js';

let runtime;
export const sqliteRuntime = () =>
  (runtime ??= (async () => {
    try {
      if (process.versions.bun) {
        const { Database } = await import('bun:sqlite');
        return Database;
      }
      const { DatabaseSync } = await import('node:sqlite');
      return DatabaseSync;
    } catch {
      return null; // Older runtimes retain the existing compatible encoder.
    }
  })());

const TYPES = [
  'ms:records',
  'ms:nil',
  'ms:array',
  'ms:object',
  'ms:null',
  'ms:true',
  'ms:false',
];
const utf16 = (value) => Buffer.from(value, 'utf16le');
const bounded = (limit) => {
  const values = new Map();
  return {
    get: (key) => values.get(key),
    set(key, value) {
      if (values.size >= limit) {
        values.clear();
      }
      values.set(key, value);
    },
    clear: () => values.clear(),
  };
};

const workspace = (Database, file) => {
  const db = new Database(file);
  db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
    PRAGMA cache_size=-16384; PRAGMA mmap_size=0; PRAGMA temp_store=FILE;
    CREATE TABLE links(address INTEGER PRIMARY KEY, source INTEGER, target INTEGER);
    CREATE TABLE pairs(source INTEGER, target INTEGER, address INTEGER, PRIMARY KEY(source,target)) WITHOUT ROWID;
    CREATE TABLE names(name BLOB PRIMARY KEY, address INTEGER, width INTEGER, arity INTEGER) WITHOUT ROWID;
    CREATE INDEX names_order ON names(width,address);
    CREATE TABLE positions(id BLOB PRIMARY KEY, line INTEGER) WITHOUT ROWID;
    CREATE INDEX live_line ON positions(line);
    BEGIN;`);
  const linkPut = db.prepare('INSERT INTO links VALUES (?,?,?)');
  const pairGet = db.prepare(
    'SELECT address FROM pairs WHERE source=? AND target=?'
  );
  const pairPut = db.prepare('INSERT INTO pairs VALUES (?,?,?)');
  const nameGet = db.prepare('SELECT address FROM names WHERE name=?');
  const namePut = db.prepare('INSERT INTO names VALUES (?,?,?,?)');
  const positionPut = db.prepare(
    'INSERT INTO positions VALUES (?,?) ON CONFLICT(id) DO UPDATE SET line=excluded.line'
  );
  const positionDelete = db.prepare('DELETE FROM positions WHERE id=?');
  const positionHas = db.prepare(
    'SELECT 1 FROM positions WHERE line=? LIMIT 1'
  );
  const linkRows = db.prepare(
    'SELECT source,target FROM links ORDER BY address'
  );
  const nameRows = db.prepare(
    'SELECT name,address,arity FROM names WHERE width=? ORDER BY address'
  );
  return {
    db,
    linkPut,
    pairGet,
    pairPut,
    nameGet,
    namePut,
    positionPut,
    positionDelete,
    positionHas,
    linkRows,
    nameRows,
  };
};

const packetsFor = (groups, length, linkRows, nameRows) => [
  {
    sections: [
      {
        width: widthFor(length, false),
        minArity: 2,
        maxArity: 2,
        links: {
          length,
          *[Symbol.iterator]() {
            for (const row of linkRows.iterate()) {
              yield [row.source, row.target];
            }
          },
        },
      },
    ],
  },
  {
    external: true,
    sections: [...groups]
      .sort(([a], [b]) => a - b)
      .map(([width, group]) => ({
        width,
        minArity: group.min,
        maxArity: group.max,
        links: {
          length: group.count,
          *[Symbol.iterator]() {
            for (const entry of nameRows.iterate(width)) {
              const name = Buffer.from(entry.name).toString('utf16le');
              yield {
                length: entry.arity,
                *[Symbol.iterator]() {
                  yield externalRef(entry.address);
                  for (const ch of name) {
                    yield externalRef(ch.codePointAt(0));
                  }
                },
              };
            }
          },
        },
      })),
  },
];

export const createDiskNetwork = async (
  file,
  { pointCache = 50_000, pairCache = 100_000 } = {}
) => {
  const Database = await sqliteRuntime();
  if (!Database) {
    return null;
  }
  const {
    db,
    linkPut,
    pairGet,
    pairPut,
    nameGet,
    namePut,
    positionPut,
    positionDelete,
    positionHas,
    linkRows,
    nameRows,
  } = workspace(Database, file);
  const points = bounded(pointCache);
  const pairs = bounded(pairCache);
  const groups = new Map();
  let length = 0;
  const push = (source, target) => {
    const address = ++length;
    linkPut.run(address, source, target);
    return address;
  };
  const pair = (source, target) => {
    const key = `${source}:${target}`;
    let address = pairs.get(key);
    if (address === undefined) {
      address = pairGet.get(source, target)?.address;
      if (address === undefined) {
        address = push(source, target);
        pairPut.run(source, target, address);
      }
      pairs.set(key, address);
    }
    return address;
  };
  const point = (name) => {
    let address = points.get(name);
    if (address !== undefined) {
      return address;
    }
    const bytes = utf16(name);
    address = nameGet.get(bytes)?.address;
    if (address === undefined) {
      address = push(length + 1, length + 1);
      let max = address;
      let arity = 1;
      for (const ch of name) {
        max = Math.max(max, ch.codePointAt(0));
        arity += 1;
      }
      const width = widthFor(max, true);
      namePut.run(bytes, address, width, arity);
      const group = groups.get(width) ?? { count: 0, min: Infinity, max: 0 };
      group.count += 1;
      group.min = Math.min(group.min, arity);
      group.max = Math.max(group.max, arity);
      groups.set(width, group);
    }
    if (name.length <= 64) {
      points.set(bytes.toString('utf16le'), address);
    }
    return address;
  };
  const T = Object.fromEntries(TYPES.map((name) => [name, point(name)]));
  const cells = (nodes) =>
    nodes.reduceRight((rest, n) => pair(n, rest), T['ms:nil']);
  const node = (value) => {
    if (value === null || value === undefined) {
      return T['ms:null'];
    }
    if (typeof value === 'boolean') {
      return value ? T['ms:true'] : T['ms:false'];
    }
    if (Array.isArray(value)) {
      return pair(T['ms:array'], cells(value.map(node)));
    }
    if (typeof value === 'object') {
      return pair(
        T['ms:object'],
        cells(
          Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => pair(point(scalarName(k)), node(v)))
        )
      );
    }
    return point(scalarName(value));
  };
  return {
    positions: {
      set: (id, line) => positionPut.run(utf16(id), line),
      delete: (id) => positionDelete.run(utf16(id)),
      finish: () => ({ has: (line) => Boolean(positionHas.get(line)) }),
    },
    add(record) {
      pair(T['ms:records'], node(record));
    },
    packets() {
      // No more builder lookups while writing: release even bounded caches.
      points.clear();
      pairs.clear();
      return packetsFor(groups, length, linkRows, nameRows);
    },
    close() {
      db.close();
    },
  };
};
