// One finite invalid serve invocation: no worker, provider or source build.
import { registerHooks } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = new URL('../../js/src/', import.meta.url).href;
const loaded = new Set();
const hooks = registerHooks({
  load(url, context, next) {
    if (url.startsWith(root)) {
      loaded.add(url.slice(root.length));
    }
    return next(url, context);
  },
});
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-serve-imports-'));
const began = globalThis.performance.now();
const output = [];
try {
  const { runCli } = await import('../../js/src/cli/index.js');
  const code = await runCli(
    [
      'serve',
      `--store=${dir}`,
      '--tls=false',
      '--open=false',
      '--quiet-logs',
      '--recovery-formats=invalid-fixture-format',
    ],
    { log: (line) => output.push(line) }
  );
  console.log(
    JSON.stringify({
      code,
      output,
      modules: [...loaded].sort(),
      moduleCount: loaded.size,
      elapsedMs: Math.round(globalThis.performance.now() - began),
      maxRssKiB: process.resourceUsage().maxRSS,
    })
  );
} finally {
  hooks.deregister();
  await rm(dir, { recursive: true, force: true });
}
