// Rebuild the failing status-reader draft for an isolated browser screenshot.
// Only this omitted argument differs from the current production source.
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

await build({
  entryPoints: [resolve('js/src/web/app.js')],
  outfile: '/tmp/issue-56-resume-read-before.min.js',
  bundle: true,
  format: 'esm',
  minify: true,
  sourcemap: false,
  target: ['es2022'],
  external: ['doublets-web'],
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'original-resume-reader',
      setup(builder) {
        // esbuild's Go regexp parser does not accept JavaScript's u flag.
        builder.onLoad({ filter: /\/web\/dom\.js$/ }, async ({ path }) => {
          const source = await readFile(path, 'utf8');
          const original = source.replace(
            '    getResume: serverReadReport,\n',
            ''
          );
          if (source === original) {
            throw new Error('Cannot reproduce the original reader argument.');
          }
          return { contents: original, loader: 'js' };
        });
      },
    },
  ],
});
