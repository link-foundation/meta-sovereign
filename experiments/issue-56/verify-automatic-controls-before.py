"""Verify the owned-session prefill control is absent on the preceding commit."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
path = root / 'js/src/web/forms-plan-controls.js'
saved = path.read_bytes()
try:
    path.write_bytes(subprocess.check_output([
        'git', 'show', '08411c49:js/src/web/forms-plan-controls.js'], cwd=root))
    with (root / 'ci-logs/forms-automatic-controls-before.log').open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1',
            '--test-name-pattern=planner exposes explicit automatic filling',
            'js/tests/forms-automatic-controls.test.js',
        ], cwd=root, env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'},
            stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0, 'The preceding planner unexpectedly exposes prefill.'
finally:
    path.write_bytes(saved)
