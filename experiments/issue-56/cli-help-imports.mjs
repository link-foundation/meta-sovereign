// Observe real help/unknown consumers with bounded child ownership in their test.
import { createHash } from 'node:crypto';
import { observeCliImports } from './cli-import-observation.mjs';
const result = await observeCliImports(async (runCli) => {
  const codes = [];
  const output = [];
  for (const argv of [
    [],
    ['help'],
    ['--help'],
    ['-h'],
    ['unknown-fixture-command'],
  ]) {
    codes.push(await runCli(argv, { log: (line) => output.push(line) }));
  }
  return {
    codes,
    outputHashes: output.map((text) =>
      createHash('sha256').update(text).digest('hex')
    ),
    hasUsage: output.every((text) =>
      text.startsWith('meta-sovereign <command>')
    ),
    hasAssignment: output.every((text) => text.includes('test-assignment')),
  };
});
console.log(JSON.stringify(result));
