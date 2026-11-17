"""Reproduce finite empty/edited-cap failures on the published parent."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/automation/autopilot.js'
saved = source.read_bytes()
try:
    source.write_bytes(subprocess.check_output([
        'git', 'show', '448c2234:js/src/automation/autopilot.js'], cwd=root))
    with (root / 'ci-logs/autopilot-cap-lifecycle-before.log').open('wb') as log:
        result = subprocess.run([
            'node', '--max-old-space-size=256', '--test', '--test-concurrency=1',
            'js/tests/autopilot-cap-lifecycle.test.js',
        ], cwd=root, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1, result.returncode
finally:
    source.write_bytes(saved)
