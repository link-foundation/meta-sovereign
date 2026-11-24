import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRunnerTransport } from '../../js/src/server/runner-transport.js';
import { transportFixture } from './runner-transport-fixture.mjs';

const fixture = transportFixture();
const before = process.argv.includes('--before');
const source = before
  ? execFileSync(
      'git',
      ['show', 'b558bd74:js/src/server/runner-transport.js'],
      { encoding: 'utf8' }
    )
  : undefined;
const run = before
  ? new Function(
      'execFile',
      `${source.replace(/^import .*\n/gm, '').replaceAll('export const ', 'const ')}\nreturn runRunnerCommand;`
    )(fixture.exec)
  : createRunnerTransport(fixture);
const abort = new AbortController();
const pending = run({ directory: '/fixture' }, ['fixture'], {
  signal: abort.signal,
});
abort.abort();
fixture.advance(1000);
try {
  assert.deepEqual(fixture.signals, ['SIGTERM', 'SIGKILL']);
  console.log(
    JSON.stringify({
      parent: 'b558bd74',
      before,
      cancelled: true,
      forcedAfterGrace: true,
      realChild: false,
    })
  );
} finally {
  fixture.report(Object.assign(new Error('aborted'), { code: 'ABORT_ERR' }));
  fixture.close();
  await pending;
}
