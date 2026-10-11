// Issue #31 / PR #34: the reply graph in a link-cli database — the clink
// client (quoting, reply framing, reconnect after a syntax error) and
// the reply store, which must answer exactly like the in-memory index.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setImmediate } from 'node:timers';
import { Parser } from 'links-notation';

import {
  clinkName,
  clinkText,
  findClink,
  parseClinkReply,
  quoteName,
  replyComplete,
  startClinkServer,
  stuff,
} from '../src/storage/clink.js';
import {
  encodeLinksArchive,
  readNetwork,
} from '../src/storage/doublets-archive.js';
import { buildReplyIndex } from '../src/replies/reply-graph.js';
import {
  createClinkReplyStore,
  replyNetwork,
} from '../src/replies/reply-store-clink.js';

const TRICKY = [
  'Привет!',
  "it's",
  'say "hi"',
  'both \' and "',
  'all \' " ` three',
  'line1\n.\nline2',
  'ms:n:5',
  '42',
  'emoji 😀 (x): y',
];

test('clinkName / clinkText round-trip and always quote safely', () => {
  const parser = new Parser();
  for (const text of TRICKY) {
    const name = clinkName(text);
    assert.equal(clinkText(name), text);
    const [link] = parser.parse(`(${quoteName(name)})`);
    assert.equal(link.values[0].id, name, text);
  }
  assert.equal(clinkName('ms:n:5'), 'ms:s:ms:n:5');
  assert.equal(clinkName('42'), 'ms:s:42');
  assert.match(clinkName('all \' " ` three'), /^ms:u:/);
});

test('the serve protocol is dot-stuffed both ways', () => {
  assert.equal(stuff("('a\n.\nb')"), "('a\n..\nb')");
  assert.equal(stuff('.x\ny'), '..x\ny');
  assert.equal(replyComplete('.\n'), true);
  assert.equal(replyComplete('() ((1: 1 1))\n.\n'), true);
  assert.equal(replyComplete("() (('a\n..\n"), false);
  assert.equal(replyComplete('() ((1: 1 1))\n'), false);
  assert.deepEqual(
    parseClinkReply("() (('a\n..\nb': 1 2))\n.\n")[0].after.id,
    'a\n.\nb'
  );
});

test('parseClinkReply reads changes and raises clink errors', () => {
  assert.deepEqual(
    parseClinkReply("() ((4: 'ms:prompt' привет))\n((5: 4 x)) ()\n.\n"),
    [
      {
        before: null,
        after: { id: '4', source: 'ms:prompt', target: 'привет' },
      },
      { before: { id: '5', source: '4', target: 'x' }, after: null },
    ]
  );
  assert.deepEqual(parseClinkReply('.\n'), []);
  assert.throws(
    () => parseClinkReply('(error: "Query error: no")\n.\n'),
    /Query error: no/
  );
});

test('findClink prefers $CLINK_BIN, then tool folders, then PATH', () => {
  const exists = (p) => p.startsWith('/opt/') || p === '/h/.cargo/bin/clink';
  assert.equal(
    findClink({ env: { CLINK_BIN: '/opt/clink' }, home: '/h', exists }),
    '/opt/clink'
  );
  assert.equal(
    findClink({ env: {}, home: '/h', exists }),
    '/h/.cargo/bin/clink'
  );
  assert.equal(
    findClink({ env: { PATH: '/opt/bin' }, home: '/x', exists }),
    '/opt/bin/clink'
  );
  assert.equal(findClink({ env: {}, home: '/x', exists: () => false }), null);
});

// A stand-in for `clink --serve`: answers `ok`, hangs up after `bad`
// (like clink after a syntax error) and never answers `slow`.
const fakeClink = async () => {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      while (buffer.includes('\n.\n')) {
        const query = buffer.slice(0, buffer.indexOf('\n.\n'));
        buffer = buffer.slice(buffer.indexOf('\n.\n') + 3);
        if (query === 'bad') {
          socket.end("(error: 'invalid LiNo: Syntax error')\n.\n");
        } else if (query !== 'slow') {
          socket.write(`() ((1: '${query}' x))\n.\n`);
        }
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    kill() {
      for (const s of sockets) {
        s.destroy();
      }
      server.close();
    },
  });
  setImmediate(() =>
    child.stdout.emit(
      'data',
      `listening on 127.0.0.1:${server.address().port}\n`
    )
  );
  return child;
};

test('startClinkServer serialises queries and reconnects after a hang-up', async () => {
  const child = await fakeClink();
  const client = await startClinkServer({
    bin: 'clink',
    db: 'x',
    spawnImpl: () => child,
    timeoutMs: 300,
  });
  const answers = await Promise.all(
    ['a', 'b', 'c'].map((q) => client.query(q))
  );
  assert.deepEqual(
    answers.map(([c]) => c.after.source),
    ['a', 'b', 'c']
  );
  await assert.rejects(client.query('bad'), /invalid LiNo/);
  assert.equal((await client.query('after'))[0].after.source, 'after');
  await assert.rejects(client.query('slow'), /timed out/);
  assert.equal((await client.query('again'))[0].after.source, 'again');
  await client.close();
});

test('replyNetwork is the documented prompt → edge → attrs shape', () => {
  const { links, names } = replyNetwork([
    { prompt: 'привет', reply: 'Привет!', count: 3, at: '2026-01-01' },
  ]);
  const { links: decoded, names: byAddress } = readNetwork(
    encodeLinksArchive({ links, names })
  );
  const name = (a) => byAddress.get(a) ?? a;
  const rows = [...decoded].map(([, [s, t]]) => [name(s), name(t)]);
  const prompt = names.get('ms:prompt');
  const q = links.findIndex(([s, t]) => s === prompt && t !== prompt) + 1;
  const e = links.findIndex(([s]) => s === q) + 1;
  assert.deepEqual(rows[q - 1], ['ms:prompt', 'привет']);
  assert.deepEqual(rows[e - 1], [q, 'привет']);
  assert.deepEqual(
    rows.filter(([s]) => s === e).map(([, t]) => t),
    ['ms:n:3', 'Привет!', 'ms:t:2026-01-01']
  );
});

let seq = 0;
const msg = (chat, sender, body, minute) => ({
  id: `msg:vk:${++seq}`,
  source: 'vk',
  chat,
  sender,
  body,
  timestamp: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(),
});

const history = () => [
  msg('1', 'u1', 'Привет!', 0),
  msg('1', 'me', 'Привет, как дела?', 1),
  msg('2', 'u2', 'привет', 0),
  msg('2', 'me', 'Привет, как дела?', 2),
  msg('3', 'u3', 'Привет', 0),
  msg('3', 'me', 'Здравствуйте!', 3),
  msg('5', 'u5', 'привет', 0),
  msg('5', 'me', 'Привет!', 4),
  msg('4', 'u4', 'Спасибо', 0),
  msg('4', 'me', 'Пожалуйста, обращайтесь', 1),
  ...TRICKY.flatMap((text, i) => [
    msg(`t${i}`, 'u9', text, 0),
    msg(`t${i}`, 'me', text, 1),
  ]),
];

const clink = findClink();

test(
  'the clink reply store answers exactly like the in-memory index',
  { skip: clink ? false : 'clink (link-cli) is not installed' },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-reply-clink-'));
    const index = buildReplyIndex(history());
    const store = createClinkReplyStore({
      bin: clink,
      db: path.join(dir, 'replies.links'),
    });
    try {
      await store.open(index.toLinks());
      const prompts = ['ПРИВЕТ', 'спасибо', 'нет такого', ...TRICKY];
      const check = async () => {
        for (const prompt of prompts) {
          assert.deepEqual(
            await store.suggestReplies(prompt),
            index.suggestReplies(prompt),
            prompt
          );
        }
        assert.deepEqual(
          await store.suggestReplies('привет', { typed: 'здр' }),
          index.suggestReplies('привет', { typed: 'здр' })
        );
      };
      await check();

      // Learning in place: a repeated pair, a brand new one, and a new
      // prompt whose points do not exist yet.
      const learned = [
        {
          prompt: 'Привет',
          reply: 'Здравствуйте!',
          at: '2026-02-01T00:00:00.000Z',
        },
        {
          prompt: 'Привет',
          reply: 'Здравствуйте!',
          at: '2026-02-02T00:00:00.000Z',
        },
        {
          prompt: 'спасибо',
          reply: 'Не за что',
          at: '2026-02-03T00:00:00.000Z',
        },
        {
          prompt: 'Как дела?',
          reply: "Отлично, it's fine",
          at: '2026-02-04T00:00:00.000Z',
        },
        {
          prompt: 'all \' " ` three',
          reply: '.\nдот\n.\n',
          at: '2026-02-05T00:00:00.000Z',
        },
      ];
      for (const pair of learned) {
        await store.learn(pair);
        index.learnPair(pair);
      }
      prompts.push('как дела');
      await check();
      assert.equal(
        (await store.suggestReplies('привет'))[0].text,
        'Здравствуйте!',
        '3 uses now beat 2'
      );

      // Reopening from the index export gives the same answers.
      await store.open(index.toLinks());
      await check();
    } finally {
      await store.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
);
