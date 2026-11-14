// One finite invalid serve invocation: no worker, provider or source build.
import { observeCliImports } from './cli-import-observation.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-serve-imports-'));
const output = [];
try {
  const result = await observeCliImports(async (runCli) => {
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
    return { code, output };
  });
  console.log(JSON.stringify(result));
} finally {
  await rm(dir, { recursive: true, force: true });
}
