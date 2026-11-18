"""Bounded before/after checks; rebuild only the web fixture and restore its bundle."""
import os
from pathlib import Path
import subprocess
from application_parent_fixture import published_application_sources, run_parent_application_probe

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, RUN_BROWSER_E2E='1', E2E_BROWSER='chromium',
           E2E_EXECUTABLE_PATH='/opt/google/chrome/chrome', DENO_JOBS='1')
node = ['node', '--max-old-space-size=384', '--test', '--test-concurrency=1']
guard = 'js/tests/job-application-pacing-guard.test.js'
with published_application_sources(__file__, '9a78b6d9') as (_, parent_env):
    log, before = run_parent_application_probe(root, parent_env, 'application-pacing-guard', node + [guard])
    assert before.returncode != 0 and 'fail 2' in log.read_text()
    log, before = run_parent_application_probe(root, parent_env, 'application-pacing-guard',
        ['node', '--max-old-space-size=384', 'experiments/issue-56/application-pacing-guard-native.mjs'], native=True)
    assert before.returncode != 0 and '0 !== 1' in log.read_text()

def check(name, command):
    with (root / f'ci-logs/application-pacing-guard-{name}.log').open('w') as output:
        subprocess.run(command, cwd=root, env=env, stdout=output,
                       stderr=subprocess.STDOUT, check=True)

files = [guard, 'js/tests/job-application-pacing.test.js',
         'js/tests/job-application-pacing-controls.test.js',
         'js/tests/migrations-application-pacing.test.js',
         'js/tests/job-application-limit.test.js',
         'js/tests/ci-browser-shards.test.js']
check('node-final', node + files)
check('deno-final', ['deno', 'test', '--allow-all', '--no-check', '--cached-only', *files[:5]])
bundle = root / 'js/src/web/app.min.js'
original = bundle.read_bytes()
try:
    check('build', ['node', 'js/scripts/build-web.mjs'])
    check('native-final', ['node', '--max-old-space-size=384', 'js/tests/e2e-job-application-pacing-browser.mjs'])
finally:
    bundle.write_bytes(original)
    assert bundle.read_bytes() == original
print('Actual-parent failures and focused/native passes retained; bundle restored and owned resources drained.')
