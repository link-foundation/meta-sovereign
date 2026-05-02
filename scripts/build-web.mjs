#!/usr/bin/env node

import { build } from 'esbuild';

await build({
  entryPoints: ['src/web/app.js'],
  outfile: 'src/web/app.min.js',
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
