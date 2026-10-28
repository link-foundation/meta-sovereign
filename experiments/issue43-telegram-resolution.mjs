// Offline probe: import maps and CommonJS must share the TL class registry.
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../js/src/sources/telegram-layer.js', import.meta.url)
);
const cjs = require('teleproto');
const esm = await import('teleproto');
console.log(
  JSON.stringify({
    runtime: process.version,
    resolved: require.resolve('teleproto'),
    sameApi: cjs.Api === esm.Api,
    layer: require('teleproto/tl').LAYER,
  })
);
