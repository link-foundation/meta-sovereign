// Explicit browser-module allowlist, isolated loopback listener, no app server.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const modules = new Map();
const names = [
  'storage/browser-store.js',
  'storage/local-storage.js',
  'storage/mutation.js',
  'storage/causal-writes.js',
  'sync/register.js',
  'sync/clock.js',
];
for (const name of names) {
  modules.set(
    `/before/${name}`,
    execFileSync('git', ['show', `a874e936:js/src/${name}`])
  );
  modules.set(
    `/after/${name}`,
    await readFile(new URL(`../../js/src/${name}`, import.meta.url))
  );
}
modules.set(
  '/after/storage/sync-deletions.js',
  await readFile(
    new URL('../../js/src/storage/sync-deletions.js', import.meta.url)
  )
);
modules.set(
  '/probe.mjs',
  await readFile(new URL('./deletions-probe.mjs', import.meta.url))
);
const server = createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Causal deletion fixture</title>');
  } else if (modules.has(request.url)) {
    response.writeHead(200, {
      'content-type': 'text/javascript; charset=utf-8',
    });
    response.end(modules.get(request.url));
  } else {
    response.writeHead(request.url === '/favicon.ico' ? 204 : 404);
    response.end();
  }
});
server.listen(0, '127.0.0.1', () =>
  console.log(
    JSON.stringify({
      url: `http://127.0.0.1:${server.address().port}/`,
      pid: process.pid,
    })
  )
);
process.once('SIGTERM', () => server.close());
process.once('SIGINT', () => server.close());
