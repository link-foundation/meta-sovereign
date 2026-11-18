// Isolated browser fixture. The parent bundle loads exact committed sources;
// both bundles use installed, unchanged dependencies. No owner app server.
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { build } from 'esbuild';

const modules = new Map();
for (const side of ['before', 'after']) {
  const built = await build({
    entryPoints: ['experiments/issue-56/reconciliation-probe.mjs'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    external: ['doublets-web'],
    write: false,
    plugins:
      side === 'before'
        ? [
            {
              name: 'exact-parent',
              setup(builder) {
                builder.onLoad(
                  { filter: /\/js\/src\/.*\.js$/ },
                  ({ path: name }) => ({
                    contents: execFileSync(
                      'git',
                      [
                        'show',
                        `4bfeaf2c:${path.relative(process.cwd(), name)}`,
                      ],
                      { encoding: 'utf8' }
                    ),
                    loader: 'js',
                    resolveDir: path.dirname(name),
                  })
                );
              },
            },
          ]
        : [],
  });
  modules.set(`/${side}.js`, built.outputFiles[0].contents);
}
const server = createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      '<!doctype html><title>IndexedDB reconciliation fixture</title>'
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
