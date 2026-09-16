// Issue #29: can a test force a fresh instance of `js/src/web/dom.js`
// (which memoises the server it discovered) with a cache-busting query
// string, the usual ESM trick?
//
// Finding: no. Node treats `./x.js?fresh=1` as a distinct specifier and
// re-evaluates; bun resolves it to the same module and returns the
// cached instance. That is why `resetServerBinding()` exists in
// `js/src/web/dom.js` instead — see experiments/dom-boot-cache.mjs.
//
//   node experiments/module-cache-bust.mjs   -> fresh instance: true
//   bun  experiments/module-cache-bust.mjs   -> fresh instance: false
//
// Beware: running this under `deno run -A` rewrites node_modules into
// Deno's own layout (and may resolve different dependency versions),
// which silently changes what `npm run build:web` produces. Run
// `npm ci` afterwards if you do.
const url = new URL('../js/src/web/discover.js', import.meta.url).href;
const a = await import(url);
const b = await import(`${url}?fresh=${Date.now()}`);
console.log('fresh instance:', a.discoverServer !== b.discoverServer);
