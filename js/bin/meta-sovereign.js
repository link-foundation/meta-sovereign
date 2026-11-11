#!/usr/bin/env node
const importedAt = globalThis.performance.now();
const { runCli } = await import('../src/cli/index.js');
if (process.env.MS_LIFECYCLE_DEBUG === '1') {
  console.error(
    `[cli] imported after ${Math.round(globalThis.performance.now() - importedAt)} ms`
  );
}

const code = await runCli(process.argv.slice(2));
// Let pending output finish before the runtime exits.
process.exitCode = code;
