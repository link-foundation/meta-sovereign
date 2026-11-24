// Reproduce the live protocol failure against a preserved commit, no credentials.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hhCommonFixture } from './hh-common-fixture.mjs';

const commit = process.env.HH_COMMON_BEFORE ?? 'e280197a';
if (!/^[a-f\d]{7,40}$/u.test(commit)) {
  throw new Error('Expected commit ID');
}
const dir = await mkdtemp(join(tmpdir(), 'ms-hh-common-before-'));
try {
  const { stdout } = await promisify(execFile)('git', [
    'show',
    `${commit}:js/src/sources/hh.js`,
  ]);
  const code = stdout.replace(/from '([^']+)'/gu, (match, relative) =>
    relative.startsWith('.')
      ? `from '${new URL(relative, new URL('../../js/src/sources/hh.js', import.meta.url)).href}'`
      : match
  );
  const file = join(dir, 'hh.mjs');
  await writeFile(file, code);
  const { createHhLive } = await import(pathToFileURL(file).href);
  await createHhLive({
    ...hhCommonFixture(),
    token: 'fixture-token',
  }).pullMessages();
} finally {
  await rm(dir, { recursive: true, force: true });
}
