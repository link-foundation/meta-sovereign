import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { build } from 'esbuild';

// Separate from the owner's app; bundles the production storage adapter only.
// An optional exact commit is served solely for finite before/after probes.
export const startSnapshotFixture = async ({ before } = {}) => {
  const modules = new Map();
  for (const side of before ? ['before', 'after'] : ['after']) {
    const result = await build({
      stdin: {
        contents: "export * from './js/src/storage/browser-store.js';",
        resolveDir: process.cwd(),
      },
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
                          `${before}:${path.relative(process.cwd(), name)}`,
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
    modules.set(`/${side}.js`, result.outputFiles[0].contents);
  }
  const server = createServer((request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><title>Snapshot ownership fixture</title>');
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
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      ),
  };
};
