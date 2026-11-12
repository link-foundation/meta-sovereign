"""Replay focused export regressions against the actual parent, then restore sources."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384',
           RUN_BROWSER_E2E='1', E2E_BROWSER='webkit', PYTHONDONTWRITEBYTECODE='1')
for name, target, command in [
    ('service', 'js/src/jobs/service.js', [
        'node', '--test', '--test-concurrency=1',
        '--test-name-pattern=durable export IDs', 'js/tests/job-resume-exports.test.js']),
    ('browser', 'js/src/web/app.min.js', [
        'node', 'experiments/issue-56/resume-export-browser.mjs', '--before']),
]:
    path = root / target
    saved = path.read_bytes()
    try:
        path.write_bytes(subprocess.check_output(['git', 'show', f'3a6a49fd:{target}'], cwd=root))
        with (root / f'ci-logs/resume-export-{name}-before.log').open('w') as output:
            result = subprocess.run(command, cwd=root, env=env, stdout=output,
                                    stderr=subprocess.STDOUT)
        assert result.returncode != 0, f'{name}: actual parent unexpectedly passes'
        print(f'{name}: expected parent failure {result.returncode}', flush=True)
    finally:
        path.write_bytes(saved)
