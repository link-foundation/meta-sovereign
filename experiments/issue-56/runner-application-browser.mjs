import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { registerHooks } from 'node:module';

const file = 'js/src/server/runner-control.js';
if (process.argv.includes('--parent')) {
  const url = new URL(`../../${file}`, import.meta.url).href;
  const source = execFileSync('git', ['show', `3c1cf860:${file}`]);
  registerHooks({
    load(specifier, context, next) {
      return specifier === url
        ? { format: 'module', source, shortCircuit: true }
        : next(specifier, context);
    },
  });
}
const { runnerApplicationRefusalFixture } =
  await import('./runner-api-fixture.mjs');
const fixture = await runnerApplicationRefusalFixture();
try {
  console.log(fixture.base);
  await once(process, 'SIGTERM');
} finally {
  await fixture.close();
  console.log(
    JSON.stringify({
      states: fixture.backend.state,
      commands: fixture.backend.calls.filter(
        ([, action]) => action !== 'probe'
      ),
      resourcesClosed: true,
    })
  );
}
