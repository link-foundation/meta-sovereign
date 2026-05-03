#!/usr/bin/env node

import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const JS_ROOT = resolve(HERE, '..');
const WEB_ROOT = resolve(JS_ROOT, 'src/web');

await build({
  entryPoints: [resolve(WEB_ROOT, 'app.js')],
  outfile: resolve(WEB_ROOT, 'app.min.js'),
  bundle: true,
  format: 'esm',
  minify: true,
  sourcemap: false,
  target: ['es2022'],
  external: ['doublets-web'],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});
