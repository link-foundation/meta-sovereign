"""Run finite regressions against the published parent and restore both files."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384', RUN_BROWSER_E2E='1', E2E_BROWSER='webkit')
for name, target, command in [
    ('service', 'js/src/jobs/service.js', ['node', '--test', '--test-concurrency=1',
     '--test-name-pattern=verified explicit resume technology', 'js/tests/job-technology-analysis.test.js']),
    ('browser', 'js/src/web/app.min.js', ['node', 'experiments/issue-56/technology-browser.mjs', '--before']),
    ('ci-budgets', 'js/scripts/browser-checks.json', ['node', '--test', '--test-concurrency=1',
     '--test-name-pattern=independent mandatory browser budgets', 'js/tests/ci-contracts.test.js']),
]:
    path = root / target
    saved = path.read_bytes()
    try:
        path.write_bytes(subprocess.check_output(['git', 'show', f'72ec50bf:{target}'], cwd=root))
        with (root / f'ci-logs/technology-{name}-before.log').open('w') as output:
            result = subprocess.run(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
        assert result.returncode != 0, f'{name}: parent unexpectedly passes'
        print(f'{name}: expected actual-parent failure {result.returncode}', flush=True)
    finally:
        path.write_bytes(saved)
