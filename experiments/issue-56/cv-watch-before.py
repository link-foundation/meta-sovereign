"""Replay focused regressions against the published parent, restoring all bytes."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384', RUN_BROWSER_E2E='1', E2E_BROWSER='webkit')
for name, target, command in [
    ('service', 'js/src/jobs/service.js', ['node', '--test', '--test-concurrency=1', '--test-name-pattern=trusted final Save', 'js/tests/cv-save-watch.test.js']),
    ('browser', 'js/src/web/app.min.js', ['node', 'experiments/issue-56/cv-watch-browser.mjs', '--before']),
]:
    path = root / target
    saved = path.read_bytes()
    try:
        path.write_bytes(subprocess.check_output(['git', 'show', f'15f9c3e8:{target}'], cwd=root))
        with (root / f'ci-logs/cv-watch-{name}-before.log').open('w') as output:
            result = subprocess.run(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
        assert result.returncode != 0, f'{name}: parent unexpectedly passes'
        print(f'{name}: expected actual-parent failure {result.returncode}', flush=True)
    finally:
        path.write_bytes(saved)
