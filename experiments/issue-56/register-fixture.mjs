// Explicit module allowlist, bound to a new loopback port, no running app.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const modules = new Map();
for (const name of [
  'browser-store.js',
  'mutation.js',
  'local-storage.js',
  'sync-deletions.js',
]) {
  modules.set(
    `/storage/${name}`,
    await readFile(new URL(`../../js/src/storage/${name}`, import.meta.url))
  );
}
for (const name of ['register.js', 'clock.js']) {
  modules.set(
    `/after/${name}`,
    await readFile(new URL(`../../js/src/sync/${name}`, import.meta.url))
  );
}
// The exact parent's standalone primitives; only unrelated peer transport
// imports/implementation are omitted so the browser can import this one module.
const parent = execFileSync('git', ['show', 'fc7c095c:js/src/sync/peer.js'], {
  encoding: 'utf8',
});
modules.set(
  '/before/register.js',
  parent.slice(
    parent.indexOf('export const tickVersion'),
    parent.indexOf('// Secrets')
  )
);
modules.set(
  '/probe.mjs',
  await readFile(new URL('./register-probe.mjs', import.meta.url))
);
const server = createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      '<!doctype html><title>Synchronization register fixture</title>'
    );
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
  console.log(`http://127.0.0.1:${server.address().port}/`)
);
process.once('SIGTERM', () => server.close());
process.once('SIGINT', () => server.close());
