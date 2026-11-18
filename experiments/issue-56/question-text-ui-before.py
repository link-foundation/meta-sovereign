"""Test the visible reply requirement against the actual parent's shipped UI."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
bundle = root / 'js/src/web/app.min.js'
original = bundle.read_bytes()
try:
    bundle.write_bytes(subprocess.check_output(
        ['git', 'show', 'c446791d:js/src/web/app.min.js'], cwd=root))
    with (root / 'ci-logs/question-text-ui-before.log').open('w') as output:
        result = subprocess.run(
            ['node', 'experiments/issue-56/question-text-ui-probe.mjs', '--before'],
            cwd=root, env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'},
            stdout=output, stderr=subprocess.STDOUT, check=False)
    if result.returncode == 0:
        raise RuntimeError('The actual parent unexpectedly has visible text controls')
finally:
    bundle.write_bytes(original)
print('Actual parent fails visible text admission; shipped bundle restored.')
