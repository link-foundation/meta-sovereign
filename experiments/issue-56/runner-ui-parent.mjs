import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import { webkit } from 'playwright';
import { verifyRunnerSessions } from '../../js/tests/helpers/e2e-runner-sessions.mjs';

// Override only the three changed parent entry modules; do not mutate sources.
const root = resolve(import.meta.dirname, '../..');
const parent = 'aa897f694df94471bb6fa713c5b1733397985b5b';
const paths = new Set([
  'js/src/web/dom.js',
  'js/src/web/settings-view.js',
  'js/src/web/locales/index.js',
]);
const built = await build({
  entryPoints: [resolve(root, 'js/src/web/app.js')],
  bundle: true,
  minify: true,
  write: false,
  format: 'esm',
  target: ['es2022'],
  external: ['doublets-web'],
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'published-runner-ui',
      setup(plugin) {
        plugin.onLoad({ filter: /\.js$/ }, ({ path }) => {
          const name = relative(root, path).replaceAll('\\', '/');
          if (!paths.has(name)) {
            return undefined;
          }
          return {
            contents: execFileSync('git', ['show', `${parent}:${name}`], {
              cwd: root,
              encoding: 'utf8',
            }),
            loader: 'js',
            resolveDir: resolve(path, '..'),
          };
        });
      },
    },
  ],
});
const browser = await webkit.launch({ headless: true });
try {
  await assert.rejects(
    verifyRunnerSessions(browser, { beforeBundle: built.outputFiles[0].text }),
    (error) => /data-runner-settings/.test(error.message)
  );
  console.log(
    JSON.stringify({
      parent,
      regressionFails: true,
      missingRunnerControls: true,
      liveProvider: false,
    })
  );
} finally {
  await browser.close();
}
