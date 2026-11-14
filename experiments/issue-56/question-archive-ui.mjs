// Isolated finite archive fixture. No accounts, providers or scheduled work.
// Optional QUESTION_ARCHIVE_BEFORE=<commit> replays that revision's learner.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { readBody, json } from '../../js/src/server/util.js';
import { bindWire } from '../../js/src/server/wire.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-archive-ui-'));
const store = createMemoryStore();
for (let id = 1; id <= 12502; id++) {
  await store.put({
    id: `msg:hh:1:${id}`,
    source: 'hh',
    chat: id < 3 ? '1' : 'notices',
    sender: id === 2 ? 'me' : 'interviewer',
    body:
      id === 1
        ? 'Where do you live?'
        : id === 2
          ? 'Vietnam.'
          : 'Archived notice.',
    timestamp: new Date(1700000000000 + id * 1000).toISOString(),
  });
}
const server = await startServer({
  store,
  storeDir: dir,
  port: 0,
  localUi: true,
  enableHandlers: false,
  enableSync: false,
  telegramAccount: false,
  automations: { scheduler: false },
});
let proxy;
try {
  let port = server.port;
  const before = process.env.QUESTION_ARCHIVE_BEFORE;
  if (before) {
    if (!/^[a-f0-9]{7,40}$/u.test(before)) {
      throw new Error('before revision must be a commit identifier');
    }
    const { stdout } = await promisify(execFile)(
      'git',
      ['show', `${before}:js/src/automation/question-store.js`],
      { cwd: root }
    );
    const source = stdout.replace(/from '([^']+)'/gu, (match, relative) =>
      relative.startsWith('.')
        ? `from '${pathToFileURL(path.resolve(root, 'js/src/automation', relative)).href}'`
        : match
    );
    const file = path.join(dir, 'before.mjs');
    await writeFile(file, source);
    const { learnSavedAnswers } = await import(pathToFileURL(file).href);
    const { stdout: bundle } = await promisify(execFile)(
      'git',
      ['show', `${before}:js/src/web/app.min.js`],
      { cwd: root, maxBuffer: 8 * 1024 ** 2 }
    );
    proxy = createServer(async (req, res) => {
      if (req.method === 'GET' && req.url.split('?')[0] === '/app.min.js') {
        res.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
        });
        res.end(bundle);
        return;
      }
      if (
        req.method === 'POST' &&
        req.url === '/api/automations/answers/learn'
      ) {
        try {
          bindWire(req, res);
          json(res, 200, await learnSavedAnswers(store, await readBody(req)));
        } catch (error) {
          json(res, 400, { error: error.message });
        }
        return;
      }
      const upstream = request(
        {
          hostname: '127.0.0.1',
          port: server.port,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            host: `127.0.0.1:${server.port}`,
            ...(req.headers.origin
              ? { origin: `http://127.0.0.1:${server.port}` }
              : {}),
            ...(req.headers.referer
              ? { referer: `http://127.0.0.1:${server.port}/` }
              : {}),
          },
        },
        (reply) => {
          res.writeHead(reply.statusCode, reply.headers);
          reply.pipe(res);
        }
      );
      upstream.on('error', () => res.destroy());
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
    });
    await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    port = proxy.address().port;
  }
  console.log(
    JSON.stringify({
      origin: `http://127.0.0.1:${port}`,
      messages: 12502,
      before: before ?? null,
    })
  );
  await new Promise((resolve) => {
    process.once('SIGTERM', resolve);
    process.once('SIGINT', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  proxy?.closeAllConnections();
  if (proxy) {
    await new Promise((resolve) => proxy.close(resolve));
  }
  await server.close();
  await rm(dir, { recursive: true, force: true });
  process.stdin.pause();
}
