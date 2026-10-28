#!/usr/bin/env node
// Each browser suite gets a fresh fixture and its own diagnostic log.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const checks = JSON.parse(
  readFileSync(new URL('./browser-checks.json', import.meta.url))
);
const dir = process.env.E2E_ARTIFACT_DIR || 'artifacts/browser';
mkdirSync(dir, { recursive: true });
const failures = [];
for (const name of checks) {
  const command =
    name === 'browser'
      ? 'js/tests/e2e-browser-spa.mjs'
      : JSON.parse(readFileSync('package.json')).scripts[
          `test:e2e:${name}`
        ]?.replace(/^node /, '');
  if (!command || command.includes(' ')) {
    throw new Error(`Invalid browser check: ${name}`);
  }
  console.log(`::group::Browser check: ${name}`);
  const start = Date.now();
  const result = spawnSync(process.execPath, [command], {
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=./js/tests/helpers/e2e-reduced-effects.mjs`,
    },
  });
  const log = `${result.stdout || ''}${result.stderr || ''}${result.error?.stack || ''}`;
  writeFileSync(path.join(dir, `${name}.log`), log);
  console.log(log);
  console.log(
    `Completed ${name} in ${Date.now() - start}ms; exit ${result.status}`
  );
  console.log('::endgroup::');
  if (
    result.status !== 0 ||
    /\bSKIP:|\bnot installed,\s*skipped\b/i.test(log)
  ) {
    failures.push(name);
  }
}
writeFileSync(
  path.join(dir, 'summary.json'),
  JSON.stringify({ engine: process.env.E2E_BROWSER, checks, failures }, null, 2)
);
if (failures.length) {
  console.error(`Browser checks failed: ${failures.join(', ')}`);
  process.exitCode = 1;
}
