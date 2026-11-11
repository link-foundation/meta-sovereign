// One finite real CLI startup/upgrade, with opt-in phase tracing and no builds.
import { spawn } from 'node:child_process';
const started = globalThis.performance.now();
const child = spawn(
  process.execPath,
  [
    '--test',
    '--test-concurrency=1',
    '--test-timeout=30000',
    '--test-name-pattern=default serve owns',
    'js/tests/rolling-cli.test.js',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: '--max-old-space-size=384',
      MS_LIFECYCLE_DEBUG: '1',
    },
  }
);
const code = await new Promise((resolve) => child.once('close', resolve));
console.log(
  '[startup-probe]',
  JSON.stringify({
    code,
    elapsedMs: Math.round(globalThis.performance.now() - started),
  })
);
process.exitCode = code ?? 1;
