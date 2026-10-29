// Preload only in the focused rolling CLI test. Model a cold filesystem with
// one finite 11-second copy delay in that test's disposable server process.
// NODE_OPTIONS="--import=./experiments/issue50-delayed-cli-copy.mjs" node \
//   --test --test-concurrency=1 --test-name-pattern='default serve owns' \
//   js/tests/rolling-cli.test.js
import { promises as fs } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

if (
  process.argv.includes('serve') &&
  process.argv.some((arg) => /^--store=.*ms-cli-rolling-/.test(arg))
) {
  const copyFile = fs.copyFile;
  let delayed = false;
  fs.copyFile = async (...args) => {
    if (!delayed) {
      delayed = true;
      process.stderr.write(
        'fixture: delaying the first release copy by 11000ms\n'
      );
      await sleep(11_000);
    }
    return copyFile(...args);
  };
}
