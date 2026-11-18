import { runnerApiFixture } from './runner-api-fixture.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dockerFixture } from './runner-docker-fixture.mjs';

const layered = process.argv.includes('--layered');
const docker = process.argv.includes('--docker');
const fixture = await runnerApiFixture({
  ...(docker ? { backend: dockerFixture() } : {}),
  initial: process.argv.includes('--health') ? { local: 'running' } : {},
  ...(layered
    ? {
        overlay: {
          local: { port: 8128 },
          server: { host: 'local@example.invalid' },
        },
      }
    : {}),
});
const globalBefore = await readFile(join(fixture.dir, 'runner.lino'));
console.log(
  JSON.stringify({ base: fixture.base, pid: process.pid, liveProvider: false })
);
let timer;
try {
  await new Promise((resolve) => {
    process.once('SIGTERM', resolve);
    process.stdin.once('data', resolve);
    process.stdin.resume();
    timer = setTimeout(resolve, 180000);
  });
} finally {
  clearTimeout(timer);
  process.stdin.pause();
  const globalUnchanged = globalBefore.equals(
    await readFile(join(fixture.dir, 'runner.lino'))
  );
  await fixture.close();
  console.log(
    JSON.stringify({
      resourcesClosed: true,
      liveProvider: false,
      ...(layered ? { globalUnchanged } : {}),
      mutations: fixture.backend.calls.filter((call) =>
        docker
          ? call[0] !== 'screen' && call[2] !== 'ls'
          : !['probe', 'health'].includes(call[1])
      ),
      healthReads: fixture.backend.calls.filter(
        ([, action]) => action === 'health'
      ).length,
    })
  );
}
