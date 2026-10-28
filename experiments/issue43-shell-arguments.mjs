// Finite DEP0190 reproduction and comparison with the shared command launcher.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const helper = new URL('../js/scripts/command-process.mjs', import.meta.url);
for (const mode of ['legacy', 'escaped']) {
  const source =
    mode === 'legacy'
      ? `import { execFileSync } from 'node:child_process'; execFileSync('npm', ['--version'], {shell:true, encoding:'utf8'});`
      : `import { execCommandSync } from ${JSON.stringify(helper.href)}; console.log(execCommandSync('npm', ['--version'], {encoding:'utf8'}).trim());`;
  const child = spawnSync(
    'node',
    ['--throw-deprecation', '--input-type=module', '-e', source],
    {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=128' },
    }
  );
  console.log(
    JSON.stringify({ mode, status: child.status, signal: child.signal })
  );
  console.log(child.stdout, child.stderr);
  if (mode === 'legacy') {
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /DEP0190/);
  } else {
    assert.equal(child.status, 0);
    assert.doesNotMatch(child.stderr, /DeprecationWarning/);
  }
}
