// Isolated loopback fixture: exactly three source modules and a finite probe.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const modules = new Map();
for (const name of ['browser-store.js', 'mutation.js', 'local-storage.js']) {
  const source = new URL(`../../js/src/storage/${name}`, import.meta.url);
  modules.set(`/after/${name}`, await readFile(source));
  modules.set(
    `/before/${name}`,
    execFileSync('git', ['show', `ff43da4f:js/src/storage/${name}`])
  );
}
modules.set(
  '/probe.mjs',
  await readFile(new URL('./browser-save-probe.mjs', import.meta.url))
);
const server = createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>Snapshot ordering fixture</title>');
  } else if (modules.has(req.url)) {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    res.end(modules.get(req.url));
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.listen(0, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${server.address().port}/`);
});
process.once('SIGTERM', () => server.close());
process.once('SIGINT', () => server.close());
