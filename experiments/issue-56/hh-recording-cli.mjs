import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  hhRecordingAnswer,
  hhRecordingFixture,
} from './hh-recording-fixture.mjs';

const run = promisify(execFile);
const cli = fileURLToPath(
  new URL('../../js/bin/meta-sovereign.js', import.meta.url)
);
const dir = await mkdtemp(join(tmpdir(), 'hh-recording-cli-'));
const command = async (args) => {
  const { stdout } = await run(process.execPath, [
    '--max-old-space-size=384',
    cli,
    ...args,
    `--store=${join(dir, 'store')}`,
  ]);
  return stdout.trim();
};
try {
  const file = join(dir, 'chat-history.json');
  await writeFile(file, JSON.stringify(hhRecordingFixture()));
  const args = ['import', '--source=hh', `--file=${file}`];
  const first = await command(args);
  const repeat = await command(args);
  assert.equal(first, 'imported 2 messages from hh');
  assert.equal(repeat, 'imported 0 messages from hh');

  const exported = join(dir, 'export.json');
  await command(['export', `--file=${exported}`]);
  const links = JSON.parse(await readFile(exported, 'utf8'));
  const current = links.find(({ id }) => id === hhRecordingAnswer);
  assert.equal(current.timestamp, null);
  assert.equal(current.delivery, 'unknown');
  assert.equal(current.versionPartial, true);
  assert.equal(current.versionCount, 3);
  const versions = links.filter(({ kind }) => kind === 'message-version');
  assert.equal(versions.length, 3);
  assert.ok(versions.every(({ capturedAt }) => capturedAt === null));

  const report = JSON.parse(
    await command(['automations', 'answers', 'learn', '--json'])
  );
  assert.deepEqual(report.rules, []);
  assert.equal(report.coverage.seen, 2);
  assert.equal(report.coverage.excludedChats, 1);
  console.log(
    JSON.stringify({
      first,
      repeat,
      versions: versions.length,
      coverage: report.coverage,
    })
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
