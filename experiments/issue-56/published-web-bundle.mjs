import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

/** Rebuild selected published entry modules without changing working sources. */
export const publishedWebBundle = async (parent, names) => {
  const root = resolve(import.meta.dirname, '../..');
  const paths = new Set(names);
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
        name: 'published-web-entry',
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
  return built.outputFiles[0].text;
};
