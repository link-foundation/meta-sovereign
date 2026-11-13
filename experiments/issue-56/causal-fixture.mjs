// Finite, allowlisted fixture; no account, app server or public listener.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const modules = new Map();
for (const name of ['browser-store.js', 'mutation.js', 'local-storage.js']) {
  const file = `js/src/storage/${name}`;
  modules.set(
    `/before/storage/${name}`,
    execFileSync('git', ['show', `96a54d99:${file}`])
  );
  modules.set(
    `/after/storage/${name}`,
    await readFile(new URL(`../../${file}`, import.meta.url))
  );
}
modules.set(
  '/after/storage/causal-writes.js',
  await readFile(
    new URL('../../js/src/storage/causal-writes.js', import.meta.url)
  )
);
modules.set(
  '/after/storage/sync-deletions.js',
  await readFile(
    new URL('../../js/src/storage/sync-deletions.js', import.meta.url)
  )
);
for (const name of ['register.js', 'clock.js']) {
  modules.set(
    `/after/sync/${name}`,
    await readFile(new URL(`../../js/src/sync/${name}`, import.meta.url))
  );
}
modules.set(
  '/probe.mjs',
  await readFile(new URL('./causal-probe.mjs', import.meta.url))
);
const server = createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      '<!doctype html><title>Ordinary causal writes fixture</title>'
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
  console.log(
    JSON.stringify({
      url: `http://127.0.0.1:${server.address().port}/`,
      pid: process.pid,
    })
  )
);
process.once('SIGTERM', () => server.close());
process.once('SIGINT', () => server.close());
